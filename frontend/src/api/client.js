const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const message = (isJson && body?.error) || `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return body;
}

export const api = {
  health: () => request("/health"),

  generateDataset: (params) =>
    request("/dataset/generate", { method: "POST", body: JSON.stringify(params) }),
  rebuildSchedule: () => request("/schedule/rebuild", { method: "POST" }),
  dashboard: () => request("/dashboard"),

  companies: (params = {}) => request(`/companies?${new URLSearchParams(params)}`),
  students: (params = {}) => request(`/students?${new URLSearchParams(params)}`),
  rooms: () => request("/rooms"),
  interviews: (params = {}) => request(`/interviews?${new URLSearchParams(params)}`),
  unscheduled: (params = {}) => request(`/interviews/unscheduled?${new URLSearchParams(params)}`),

  companyDelay: (payload) =>
    request("/disruptions/company-delay", { method: "POST", body: JSON.stringify(payload) }),
  panelDrop: (payload) =>
    request("/disruptions/panel-drop", { method: "POST", body: JSON.stringify(payload) }),
  studentWithdraw: (payload) =>
    request("/disruptions/student-withdraw", { method: "POST", body: JSON.stringify(payload) }),
  roomUnavailable: (payload) =>
    request("/disruptions/room-unavailable", { method: "POST", body: JSON.stringify(payload) }),
  disruptionLog: () => request("/disruptions/log"),
};
