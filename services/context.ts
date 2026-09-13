import { assertCan, can, type Permission, type RoleKey } from "@/lib/permissions";

/** Every service call runs inside an authenticated, tenant-scoped context. */
export interface ServiceContext {
  userId: string;
  userName: string;
  organizationId: string;
  role: RoleKey;
}

export function contextFromUser(user: { id: string; name: string; organizationId: string; role: RoleKey }): ServiceContext {
  return { userId: user.id, userName: user.name, organizationId: user.organizationId, role: user.role };
}

export function authorize(ctx: ServiceContext, permission: Permission): void {
  assertCan(ctx.role, permission);
}

export function allowed(ctx: ServiceContext, permission: Permission): boolean {
  return can(ctx.role, permission);
}
