import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { audit } from "@/lib/audit";
import { SESSION_COOKIE, clearSessionCookie, invalidateSessionToken, validateSessionToken } from "@/lib/auth/session";

export async function POST() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const user = await validateSessionToken(token);
    await invalidateSessionToken(token);
    if (user) {
      await audit({ organizationId: user.organizationId, userId: user.id }, { action: "auth.logout", entityType: "User", entityId: user.id });
    }
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
