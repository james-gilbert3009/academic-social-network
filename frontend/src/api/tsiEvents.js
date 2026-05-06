import { api } from "../api";

export function getTsiEvents() {
  return api.get("/api/tsi-events");
}

