import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import type { RoleKey } from "@/lib/permissions";

export const SESSION_COOKIE = "gifos_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RENEW_WHEN_LESS_THAN_MS = 24 * 60 * 60 * 1000;

export interface SessionUser {
  sessionId: string;
  id: string;
  name: string;
  email: string;
  role: RoleKey;
  organizationId: string;
  organizationName: string;
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, meta: { userAgent?: string | null; ipAddress?: string | null } = {}) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ipAddress: meta.ipAddress?.slice(0, 64) ?? null,
    },
  });
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function validateSessionToken(token: string): Promise<SessionUser | null> {
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { organization: { select: { name: true } } } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now() || !session.user.isActive) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (session.expiresAt.getTime() - Date.now() < RENEW_WHEN_LESS_THAN_MS) {
    await db.session.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() + SESSION_TTL_MS) } });
  }
  return {
    sessionId: session.id,
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
    organizationId: session.user.organizationId,
    organizationName: session.user.organization.name,
  };
}

export async function invalidateSessionToken(token: string) {
  await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/** Current user for this request (deduplicated per render). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(token);
});

/** For Server Components / pages: redirects to /login when unauthenticated. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
