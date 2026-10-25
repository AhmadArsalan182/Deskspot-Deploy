import { apiRequest } from "./api.js";

export function getOffices() {
  return apiRequest("/offices").then((data) => data.items);
}

export function createOffice(data) {
  return apiRequest("/offices", { method: "POST", body: data });
}

export function updateOffice(id, data) {
  return apiRequest(`/offices/${id}`, { method: "PATCH", body: data });
}

export function deleteOffice(id) {
  return apiRequest(`/offices/${id}`, { method: "DELETE" });
}
