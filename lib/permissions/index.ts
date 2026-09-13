/** Minimal RBAC. Pure: no I/O. */

export type RoleKey = "OWNER" | "ADVISOR" | "ANALYST";

export const PERMISSIONS = [
  "company:read",
  "company:write",
  "company:delete",
  "document:read",
  "document:write",
  "document:delete",
  "financials:write",
  "financials:approve",
  "operation:read",
  "operation:write",
  "task:read",
  "task:write",
  "alert:manage",
  "ai:use",
  "approval:decide",
  "audit:read",
  "settings:manage",
  "users:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ANALYST: Permission[] = [
  "company:read",
  "document:read",
  "document:write",
  "financials:write",
  "operation:read",
  "task:read",
  "task:write",
  "alert:manage",
  "ai:use",
];

const ADVISOR: Permission[] = [
  ...ANALYST,
  "company:write",
  "document:delete",
  "financials:approve",
  "operation:write",
  "approval:decide",
  "audit:read",
];

const OWNER: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<RoleKey, ReadonlySet<Permission>> = {
  OWNER: new Set(OWNER),
  ADVISOR: new Set(ADVISOR),
  ANALYST: new Set(ANALYST),
};

export const ROLE_LABELS: Record<RoleKey, string> = {
  OWNER: "Owner",
  ADVISOR: "Advisor",
  ANALYST: "Analyst",
};

export function can(role: RoleKey, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(public readonly permission: Permission) {
    super(`Operazione non consentita per il tuo ruolo (${permission}).`);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  readonly status = 404;
  constructor(entity = "Risorsa") {
    super(`${entity} non trovata.`);
    this.name = "NotFoundError";
  }
}

export function assertCan(role: RoleKey, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError(permission);
}
