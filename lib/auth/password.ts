import bcrypt from "bcryptjs";

const COST = 12;
let dummyHash: string | null = null;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    // Spend comparable time when the user does not exist (no user enumeration by timing).
    dummyHash ??= await bcrypt.hash("gi-finance-os-dummy-password", COST);
    await bcrypt.compare(password, dummyHash);
    return false;
  }
  return bcrypt.compare(password, hash);
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 10) return "La password deve avere almeno 10 caratteri.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "La password deve contenere lettere e numeri.";
  return null;
}
