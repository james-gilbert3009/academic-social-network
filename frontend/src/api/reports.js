import { api } from "../api";

export function createReport(payload) {
  return api.post("/api/reports", payload);
}

// Admin helpers (if admin UI exists)
export function getAdminReports(params) {
  return api.get("/api/admin/reports", { params });
}

export function updateReportStatus(reportId, status) {
  return api.put(`/api/admin/reports/${reportId}/status`, { status });
}

