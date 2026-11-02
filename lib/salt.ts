// Salt for hashed caller ids (IP counters, WhatsApp session keys). The dev
// fallback is public (the repo is), so production refuses to run without one.
export function guardSalt(): string {
  const s = process.env.GUARD_SALT;
  if (s) return s;
  if (process.env.VERCEL) throw new Error("GUARD_SALT_MISSING");
  return "offisio-dev-salt";
}
