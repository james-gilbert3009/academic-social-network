import { api } from "../api";

/** PUT follow/unfollow toggle for a user. */
export function toggleFollow(userId) {
  return api.put(`/api/users/${userId}/follow`);
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

