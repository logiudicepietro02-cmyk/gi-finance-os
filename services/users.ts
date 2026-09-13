import { audit } from "@/lib/audit";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { badRequest, conflict, isUniqueViolation } from "@/lib/errors";
import { NotFoundError } from "@/lib/permissions";
import { userCreateSchema, userUpdateSchema } from "@/lib/validation/schemas";
import { authorize, type ServiceContext } from "./context";

/**
 * Directory interna dell'organizzazione (nome, email, ruolo, ultimo accesso). Intenzionalmente
 * disponibile a ogni ruolo con `company:read` (non solo a `users:manage`): popola i selettori di
 * assegnatario su aziende, operazioni e task, usati anche da Advisor e Analyst.
 */
export async function listUsers(ctx: ServiceContext) {
  authorize(ctx, "company:read");
  return db.user.findMany({
    where: { organizationId: ctx.organizationId },
    select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true },
    orderBy: { name: "asc" },
  });
}

export async function createUser(ctx: ServiceContext, input: unknown) {
  authorize(ctx, "users:manage");
  const data = userCreateSchema.parse(input);
  const weak = validatePasswordStrength(data.password);
  if (weak) throw badRequest(weak);
  try {
    const user = await db.user.create({
      data: {
        organizationId: ctx.organizationId,
        name: data.name,
        email: data.email,
        role: data.role,
        passwordHash: await hashPassword(data.password),
      },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    await audit(ctx, { action: "user.create", entityType: "User", entityId: user.id, metadata: { email: user.email, role: user.role } });
    return user;
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("Esiste già un utente con questa email.");
    throw error;
  }
}

export async function updateUser(ctx: ServiceContext, userId: string, input: unknown) {
  authorize(ctx, "users:manage");
  const data = userUpdateSchema.parse(input);
  const existing = await db.user.findFirst({ where: { id: userId, organizationId: ctx.organizationId } });
  if (!existing) throw new NotFoundError("Utente");
  if (userId === ctx.userId && ((data.role && data.role !== "OWNER") || data.isActive === false)) {
    throw badRequest("Non puoi rimuovere il tuo ruolo di Owner o disattivare il tuo account.");
  }
  const user = await db.user.update({
    where: { id: userId },
    data,
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  if (data.isActive === false) await db.session.deleteMany({ where: { userId } });
  await audit(ctx, { action: "user.update", entityType: "User", entityId: userId, metadata: data });
  return user;
}
