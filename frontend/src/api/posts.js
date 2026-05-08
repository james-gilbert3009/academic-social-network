import { api } from "../api";

export function getPosts() {
  return api.get("/api/posts");
}

export function getPostsByUser(userId) {
  return api.get(`/api/posts/user/${userId}`);
}

export function getPostById(postId) {
  return api.get(`/api/posts/${postId}`);
}

export function createPost(formData) {
  return api.post("/api/posts", formData);
}

/** Plain object sends JSON; FormData sends multipart (create-style only if you still use it). */
export function updatePost(postId, data) {
  return api.put(`/api/posts/${postId}`, data);
}

export function deletePost(postId) {
  return api.delete(`/api/posts/${postId}`);
}

export function toggleLike(postId) {
  return api.put(`/api/posts/${postId}/like`);
}

export function addComment(postId, text) {
  return api.post(`/api/posts/${postId}/comments`, { text });
}

export function deleteComment(postId, commentId) {
  return api.delete(`/api/posts/${postId}/comments/${commentId}`);
}

export function toggleCommentLike(postId, commentId) {
  return api.put(`/api/posts/${postId}/comments/${commentId}/like`);
}

