/**
 * Profile is "complete" when the same core fields as setup expect are filled.
 * Photo-only updates must not mark the profile complete.
 */
export default function computeIsProfileComplete(u) {
  if (!u || typeof u !== "object") return false;
  const name = String(u.name ?? "").trim();
  const bio = String(u.bio ?? "").trim();
  const faculty = String(u.faculty ?? "").trim();
  const program = String(u.program ?? "").trim();
  const skills = Array.isArray(u.skills) ? u.skills.map((s) => String(s).trim()).filter(Boolean) : [];
  const interests = Array.isArray(u.interests)
    ? u.interests.map((s) => String(s).trim()).filter(Boolean)
    : [];
  return Boolean(
    name && bio && faculty && program && skills.length > 0 && interests.length > 0
  );
}
