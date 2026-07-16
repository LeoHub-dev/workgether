import bcrypt from "bcryptjs";

const ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function validateCredentials(username: string, password: string): string | null {
  const u = username.trim();
  if (u.length < 3 || u.length > 32) {
    return "Username must be 3–32 characters.";
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(u)) {
    return "Username may only contain letters, numbers, dots, underscores, and hyphens.";
  }
  if (password.length < 6 || password.length > 128) {
    return "Password must be 6–128 characters.";
  }
  return null;
}
