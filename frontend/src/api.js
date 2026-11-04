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

async function request(path, { method = "GET", body, isForm = false, auth = true, timeoutMs = 0 } = {}) {
  const headers = {};
  if (!isForm) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const controller = timeoutMs ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Phân tích AI quá thời gian chờ. Vui lòng thử lại.");
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }

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

async function requestBlob(path) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { headers, cache: "no-store" });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      message = data.detail || data.message || message;
    } catch {
      // Keep the status-based message for non-JSON errors.
    }
    const error = new Error(typeof message === "string" ? message : JSON.stringify(message));
    error.status = res.status;
    throw error;
  }
  return res.blob();
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
  activateResume: (id) => request(`/api/resumes/${id}/activate`, { method: "PUT" }),
  resumeInsights: () => request("/api/resumes/me/insights"),
  listResumeDrafts: () => request("/api/resume-drafts"),
  createResumeDraft: (payload) => request("/api/resume-drafts", { method: "POST", body: payload }),
  getResumeDraft: (id) => request(`/api/resume-drafts/${id}`),
  updateResumeDraft: (id, payload) => request(`/api/resume-drafts/${id}`, { method: "PUT", body: payload }),
  deleteResumeDraft: (id) => request(`/api/resume-drafts/${id}`, { method: "DELETE" }),
  getDraftPortrait: (id, version = "") => requestBlob(`/api/resume-drafts/${id}/portrait${version ? `?v=${version}` : ""}`),
  uploadDraftPortrait: (id, file) => {
    const form = new FormData();
    form.append("file", file, "portrait.jpg");
    return request(`/api/resume-drafts/${id}/portrait`, { method: "POST", body: form, isForm: true });
  },
  deleteDraftPortrait: (id) => request(`/api/resume-drafts/${id}/portrait`, { method: "DELETE" }),
  saveDraftToResumes: (id, file, filename) => {
    const form = new FormData();
    form.append("file", file, filename);
    return request(`/api/resume-drafts/${id}/save-to-resumes`, { method: "POST", body: form, isForm: true });
  },

  // applications
  applyToJob: (jobId, resumeId) =>
    request(`/api/jobs/${jobId}/apply${resumeId ? `?resume_id=${resumeId}` : ""}`, { method: "POST" }),
  myApplications: () => request("/api/applications/me"),
  jobApplications: (jobId) => request(`/api/jobs/${jobId}/applications`),
  updateApplicationStatus: (id, status, reason = "", candidateMessage = "") =>
    request(`/api/applications/${id}/status`, {
      method: "PATCH",
      body: { status, reason, candidate_message: candidateMessage },
    }),
  sendApplicationMessage: (id, candidateMessage) =>
    request(`/api/applications/${id}/messages`, { method: "POST", body: { candidate_message: candidateMessage } }),
  applicationStatusHistory: (id) => request(`/api/applications/${id}/history`),

  // recommendations
  recommendationPositions: () => request("/api/recommendations/positions"),
  recommendationJobs: (position) =>
    request(`/api/recommendations/jobs?${new URLSearchParams({ position })}`),
  recommendations: (payload) =>
    request("/api/recommendations", { method: "POST", body: payload, timeoutMs: 30000 }),

  // interviews
  scheduleInterview: (payload) => request("/api/interviews", { method: "POST", body: payload }),
  myInterviews: () => request("/api/interviews/me"),
  updateInterviewStatus: (id, status) =>
    request(`/api/interviews/${id}/status`, { method: "PATCH", body: { status } }),
  createInterviewProposal: (payload) => request("/api/interview-proposals", { method: "POST", body: payload }),
  myInterviewProposals: () => request("/api/interview-proposals/me"),
  recruiterInterviewProposals: () => request("/api/recruiter/interview-proposals"),
  confirmInterviewProposal: (id, optionId) =>
    request(`/api/interview-proposals/${id}/confirm`, { method: "POST", body: { option_id: optionId } }),

  // notifications
  notifications: () => request("/api/notifications"),
  notificationUnreadCount: () => request("/api/notifications/unread-count"),
  markNotificationRead: (id) => request(`/api/notifications/${id}/read`, { method: "PATCH" }),
  markAllNotificationsRead: () => request("/api/notifications/read-all", { method: "PATCH" }),

  // evaluations
  createEvaluation: (payload) => request("/api/evaluations", { method: "POST", body: payload }),
  getAIFeedback: (applicationId) => request(`/api/applications/${applicationId}/ai-feedback`),
  saveAIFeedback: (applicationId, payload) =>
    request(`/api/applications/${applicationId}/ai-feedback`, { method: "PUT", body: payload }),
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
