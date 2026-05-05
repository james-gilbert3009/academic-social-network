import { api } from "../api";

/** GET current user profile (same route as before). */
export function getProfile() {
  return api.get("/api/profile/me");
}

/** GET another user's profile (public view). */
export function getProfileById(userId) {
  return api.get(`/api/profile/${userId}`);
}

/**
 * PUT profile update. Pass a plain object for JSON fields, or FormData for image upload.
 * Axios sets Content-Type appropriately (JSON vs multipart).
 */
export function updateProfile(data) {
  return api.put("/api/profile/me", data);
}
