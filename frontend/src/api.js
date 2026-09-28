const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "" : "http://127.0.0.1:8000");

export function getToken() {
  return localStorage.getItem("sra_token");
}

export function setToken(token) {
  if (token) localStorage.setItem("sra_token", token);
  else localStorage.removeItem("sra_token");
}

export function setStoredUser(user) {
  if (user) localStorage.setItem("sra_user", JSON.stringify(user));
  else localStorage.removeItem("sra_user");
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("sra_user")) || null;
  } catch {
    return null;
  }
}

async function request(path, { method = "GET", body, isForm = false, auth = true } = {}) {
  const headers = {};
  if (!isForm) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const message = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    const error = new Error(typeof message === "string" ? message : JSON.stringify(message));
    error.status = res.status;
    throw error;
  }
  return data;
}

export const api = {
  // auth
  register: (payload) => request("/api/auth/register", { method: "POST", body: payload, auth: false }),
  login: (payload) => request("/api/auth/login", { method: "POST", body: payload, auth: false }),
  me: () => request("/api/me"),

  // company
  myCompany: () => request("/api/company/me"),
  saveCompany: (payload) => request("/api/company/me", { method: "PUT", body: payload }),
  companies: () => request("/api/companies"),

  // jobs
  listJobs: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/jobs${qs ? `?${qs}` : ""}`, { auth: false });
  },
  myJobs: () => request("/api/jobs/mine"),
  getJob: (id) => request(`/api/jobs/${id}`, { auth: false }),
  createJob: (payload) => request("/api/jobs", { method: "POST", body: payload }),
  updateJob: (id, payload) => request(`/api/jobs/${id}`, { method: "PUT", body: payload }),
  deleteJob: (id) => request(`/api/jobs/${id}`, { method: "DELETE" }),

  // resumes
  uploadResume: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("/api/resumes/upload", { method: "POST", body: form, isForm: true });
  },
  myResumes: () => request("/api/resumes/me"),

  // applications
  applyToJob: (jobId) => request(`/api/jobs/${jobId}/apply`, { method: "POST" }),
  myApplications: () => request("/api/applications/me"),
  jobApplications: (jobId) => request(`/api/jobs/${jobId}/applications`),
  updateApplicationStatus: (id, status) =>
    request(`/api/applications/${id}/status`, { method: "PATCH", body: { status } }),

  // recommendations
  recommendations: (limit = 5) => request(`/api/recommendations?limit=${limit}`),

  // interviews
  scheduleInterview: (payload) => request("/api/interviews", { method: "POST", body: payload }),
  myInterviews: () => request("/api/interviews/me"),
  updateInterviewStatus: (id, status) =>
    request(`/api/interviews/${id}/status`, { method: "PATCH", body: { status } }),

  // evaluations
  createEvaluation: (payload) => request("/api/evaluations", { method: "POST", body: payload }),
  listEvaluations: (applicationId) => request(`/api/applications/${applicationId}/evaluations`),

  // stats
  candidateStats: () => request("/api/stats/candidate"),
  recruiterStats: () => request("/api/stats/recruiter"),
  adminStats: () => request("/api/stats/admin"),

  // admin
  adminUsers: () => request("/api/admin/users"),
  adminUpdateUser: (id, payload) => request(`/api/admin/users/${id}`, { method: "PATCH", body: payload }),
  adminJobs: () => request("/api/admin/jobs"),

  health: () => request("/health", { auth: false }),
};

export default api;
