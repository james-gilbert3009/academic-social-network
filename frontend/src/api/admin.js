import { api } from "../api";

export function getAdminStats() {
  return api.get("/api/admin/stats");
}

export function listAdminUsers({ q = "", role = "", page = 1, limit = 20 } = {}) {
  return api.get("/api/admin/users", { params: { q, role, page, limit } });
}

export function updateAdminUserRole(userId, role) {
  return api.put(`/api/admin/users/${userId}/role`, { role });
}

export function listAdminPosts({ q = "", page = 1, limit = 20 } = {}) {
  return api.get("/api/admin/posts", { params: { q, page, limit } });
}

export function getAdminPostById(postId) {
  return api.get(`/api/admin/posts/${postId}`);
}

export function deleteAdminPost(postId) {
  return api.delete(`/api/admin/posts/${postId}`);
}

export function deleteAdminComment(postId, commentId) {
  return api.delete(`/api/admin/posts/${postId}/comments/${commentId}`);
}

export function updateAdminReportStatus(reportId, status) {
  return api.put(`/api/admin/reports/${reportId}/status`, { status });
}

