import bcrypt from "bcryptjs";

const COST = 12;

/** パスワードを bcrypt でハッシュ化する。平文は保存しない。 */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

/** 平文とハッシュを照合する。 */
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** 最低要件（8 文字以上）。UI と Server Action で共有する。 */
export function isAcceptablePassword(plain: string): boolean {
  return typeof plain === "string" && plain.length >= 8;
}
