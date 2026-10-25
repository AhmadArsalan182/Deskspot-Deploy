import { apiRequest, query } from "./api.js";

export function getSpaces(params = {}) {
  return apiRequest(`/spaces${query(params)}`).then((data) => data.items);
}

export function createSpace(data) {
  return apiRequest("/spaces", { method: "POST", body: data });
}

export function updateSpace(id, data) {
  return apiRequest(`/spaces/${id}`, { method: "PATCH", body: data });
}

export function deleteSpace(id) {
  return apiRequest(`/spaces/${id}`, { method: "DELETE" });
}
