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

