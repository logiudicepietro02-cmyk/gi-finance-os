/** Small helpers to read query/form values in Route Handlers. */
export function str(value: FormDataEntryValue | string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function int(value: FormDataEntryValue | string | null | undefined): number | null {
  const s = str(value);
  if (s === null) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
}

export function bool(value: string | null | undefined): boolean {
  return value === "1" || value === "true";
}
