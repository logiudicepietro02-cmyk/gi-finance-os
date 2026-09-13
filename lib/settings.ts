import { z } from "zod";

/** Organization-level configuration (stored in Organization.settings). */
export const orgSettingsSchema = z.object({
  /** Alert when DSCR is below this value */
  dscrMin: z.number().min(0).max(10).default(1.2),
  /** Alert when PFN/EBITDA is above this value */
  netDebtEbitdaMax: z.number().min(0).max(20).default(4),
  /** Alert when a financing operation matures within N days */
  maturityWarningDays: z.number().int().min(1).max(365).default(60),
});

export type OrgSettings = z.infer<typeof orgSettingsSchema>;

export const DEFAULT_ORG_SETTINGS: OrgSettings = orgSettingsSchema.parse({});

export function parseOrgSettings(raw: unknown): OrgSettings {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const settings = { ...DEFAULT_ORG_SETTINGS };
  // Keep each valid key; ignore invalid ones instead of discarding everything.
  for (const key of Object.keys(DEFAULT_ORG_SETTINGS) as (keyof OrgSettings)[]) {
    const parsed = orgSettingsSchema.shape[key].safeParse(source[key]);
    if (parsed.success && source[key] !== undefined) settings[key] = parsed.data as never;
  }
  return settings;
}
