/** Characters counted as "special" for password rules. */
const SPECIAL_RE = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

/** Small set of obviously weak passwords (lowercase match). */
const COMMON_WEAK = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "qwerty123",
  "qwertyui",
  "admin123",
  "letmein",
  "welcome1",
  "monkey123",
]);

/**
 * @param {string} password
 * @param {{ username?: string, email?: string }} [ctx]
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validatePasswordStrength(password, ctx = {}) {
  if (typeof password !== "string") {
    return { ok: false, message: "Password is required." };
  }

  if (password.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }
  if (password.length > 128) {
    return { ok: false, message: "Password is too long (max 128 characters)." };
  }

  if (!/[a-z]/.test(password)) {
    return { ok: false, message: "Password must include at least one lowercase letter." };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, message: "Password must include at least one uppercase letter." };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: "Password must include at least one number." };
  }
  if (!SPECIAL_RE.test(password)) {
    return {
      ok: false,
      message: "Password must include at least one special character (e.g. !@#$%^&*).",
    };
  }

  if (/^(.)\1+$/.test(password)) {
    return { ok: false, message: "Password cannot be a single repeated character." };
  }

  const lower = password.toLowerCase();
  if (COMMON_WEAK.has(lower)) {
    return { ok: false, message: "This password is too common. Choose a stronger one." };
  }

  const username = ctx.username ? String(ctx.username).toLowerCase().trim() : "";
  const emailLocal = ctx.email
    ? String(ctx.email).toLowerCase().trim().split("@")[0] || ""
    : "";

  if (username.length >= 3 && lower.includes(username)) {
    return { ok: false, message: "Password must not contain your username." };
  }
  if (emailLocal.length >= 3 && lower.includes(emailLocal)) {
    return { ok: false, message: "Password must not contain your email address." };
  }

  return { ok: true };
}
