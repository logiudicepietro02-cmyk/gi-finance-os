import { audit } from "@/lib/audit";
import { db, toJson, type Prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/permissions";
import { parseOrgSettings } from "@/lib/settings";
import { settingsUpdateSchema } from "@/lib/validation/schemas";
import { syncAlerts } from "./alerts";
import { authorize, type ServiceContext } from "./context";

export async function getOrganizationSettings(ctx: ServiceContext) {
  authorize(ctx, "company:read");
  const org = await db.organization.findUnique({ where: { id: ctx.organizationId } });
  if (!org) throw new NotFoundError("Organizzazione");
  return { organization: { id: org.id, name: org.name, slug: org.slug }, settings: parseOrgSettings(org.settings) };
}

export async function updateOrganizationSettings(ctx: ServiceContext, input: unknown) {
  authorize(ctx, "settings:manage");
  const data = settingsUpdateSchema.parse(input);
  const before = await getOrganizationSettings(ctx);
  await db.organization.update({
    where: { id: ctx.organizationId },
    data: { settings: toJson(data) as Prisma.InputJsonValue },
  });
  await audit(ctx, { action: "settings.update", entityType: "Organization", entityId: ctx.organizationId, metadata: { before: before.settings, after: data } });
  const alerts = await syncAlerts(ctx.organizationId);
  return { settings: parseOrgSettings(data), alerts };
}
