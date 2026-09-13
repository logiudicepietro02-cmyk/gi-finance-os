import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/handler";
import { audit } from "@/lib/audit";
import { verifyPassword } from "@/lib/auth/password";
import { rateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { db } from "@/lib/db";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  try {
    const body = loginSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: "Inserisci email e password valide." }, { status: 400 });
    }
    const { email, password } = body.data;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const limiterKey = `login:${email}:${ip}`;
    const limit = rateLimit(limiterKey, 10, 15 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: `Troppi tentativi. Riprova tra ${Math.ceil(limit.retryAfterSec / 60)} minuti.` },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
      );
    }

    const user = await db.user.findUnique({ where: { email } });
    const valid = await verifyPassword(password, user?.passwordHash);
    if (!user || !valid || !user.isActive) {
      return NextResponse.json({ error: "Credenziali non valide." }, { status: 401 });
    }

    resetRateLimit(limiterKey);
    const { token, expiresAt } = await createSession(user.id, {
      userAgent: req.headers.get("user-agent"),
      ipAddress: ip,
    });
    await setSessionCookie(token, expiresAt);
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit({ organizationId: user.organizationId, userId: user.id }, { action: "auth.login", entityType: "User", entityId: user.id });

    return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, role: user.role } });
  } catch (error) {
    return errorResponse(error);
  }
}
