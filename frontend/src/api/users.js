import { api } from "../api";

/** PUT follow/unfollow toggle for a user. */
export function toggleFollow(userId) {
  return api.put(`/api/users/${userId}/follow`);
}

export function searchUsers(query, role) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  const roleParam = normalizedRole && normalizedRole !== "all" ? normalizedRole : undefined;
  return api.get("/api/users/search", { params: { q: query, role: roleParam } });
}

export function getFollowers(userId) {
  return api.get(`/api/users/${userId}/followers`);
}

export function getFollowing(userId) {
  return api.get(`/api/users/${userId}/following`);
}

export function getMutualUsers(userId) {
  return api.get(`/api/users/${userId}/mutual`);
}

export function getConnections(userId) {
  return api.get(`/api/users/${userId}/connections`);
}

/** DELETE permanently deletes the logged-in user's account. */
export function deleteMyAccount() {
  return api.delete("/api/users/me");
}

/**
 * Globally block a user. After a successful response the caller should
 * refetch the affected profile/conversation (the backend mutates follow,
 * notification and conversation state in the same request).
 */
export function blockUser(userId) {
  return api.put(`/api/users/${userId}/block`);
}

/** Reverse of `blockUser`. */
export function unblockUser(userId) {
  return api.put(`/api/users/${userId}/unblock`);
}

/**
 * List of users the current account has globally blocked. Returned shape:
 * `{ users: [{ _id, name, username, role, profileImage }] }`. Used by the
 * Settings → Blocked users panel.
 */
export function getBlockedUsers() {
  return api.get("/api/users/blocked");
}

