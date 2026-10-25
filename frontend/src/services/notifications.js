import { apiRequest, query } from "./api.js";

export function getNotifications({ page, pageSize } = {}) {
  return apiRequest(`/notifications${query({ page, pageSize })}`);
}

export function markNotificationRead(id) {
  return apiRequest(`/notifications/${id}/read`, { method: "POST" });
}

export function markAllNotificationsRead() {
  return apiRequest("/notifications/read-all", { method: "POST" });
}
