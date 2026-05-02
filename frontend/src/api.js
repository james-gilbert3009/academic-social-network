import axios from "axios";

/** API origin for axios and absolute asset URLs (e.g. `/uploads/...`). Override via `VITE_API_BASE_URL`. */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export const api = axios.create({
  baseURL: API_BASE_URL,
});

const token = localStorage.getItem("token");

if (token) {
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
}

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}
