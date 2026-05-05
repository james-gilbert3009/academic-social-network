import { api } from "../api";

export function getNotifications() {
  return api.get("/api/notifications");
}

export function markNotificationRead(notificationId) {
  return api.put(`/api/notifications/${notificationId}/read`);
}

export function markAllNotificationsRead() {
  return api.put("/api/notifications/read-all");
}

