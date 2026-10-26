import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Link2,
  ListChecks,
  MapPin,
  Send,
  Sparkles,
  Users,
  Video,
  X,
  XCircle,
} from "lucide-react";
import api from "../api.js";
import { Alert, EmptyState, ScoreBar, Spinner, StatusBadge, STATUS_LABELS } from "./Common.jsx";

export default function RecruiterDashboard({ activeTab = "overview" }) {
  return (
    <div className="dashboard recruiter-dashboard" data-active-tab={activeTab}>
      {activeTab === "overview" && <Overview />}
      {activeTab === "company" && <CompanyProfile />}
      {activeTab === "jobs" && <JobManager />}
      {activeTab === "applications" && <ApplicationsRanking />}
      {activeTab === "interviews" && <InterviewList />}
    </div>
  );
}

function Overview() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.recruiterStats().then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!stats) return <Spinner />;

  const topCandidates = [...(stats.top_candidates || [])].sort(
    (a, b) => Number(b.final_score || 0) - Number(a.final_score || 0),
  );
  const statusEntries = Object.entries(stats.by_status || {});

  return (
    <div className="recruiter-overview">
      <section className="recruiter-page-header">
        <p className="recruiter-eyebrow">Tổng quan tuyển dụng</p>
        <h1>Bảng điều khiển Nhà tuyển dụng</h1>
        <p>Theo dõi hiệu quả tuyển dụng và những ứng viên nổi bật của bạn.</p>
      </section>

      <div className="recruiter-stat-grid">
        <article className="recruiter-stat-card">
          <span className="recruiter-stat-icon" aria-hidden="true"><BriefcaseBusiness /></span>
          <h2>Tin tuyển dụng</h2>
          <strong className="recruiter-stat-value" data-testid="recruiter-total-jobs">{stats.total_jobs}</strong>
          <p><span>{stats.open_jobs}</span> đang mở</p>
        </article>
        <article className="recruiter-stat-card">
          <span className="recruiter-stat-icon" aria-hidden="true"><Users /></span>
          <h2>Tổng ứng viên</h2>
          <strong className="recruiter-stat-value" data-testid="recruiter-total-applications">
            {stats.total_applications}
          </strong>
          <p>Hồ sơ đã tiếp nhận</p>
        </article>
        <article className="recruiter-stat-card">
          <span className="recruiter-stat-icon" aria-hidden="true"><Sparkles /></span>
          <h2>Điểm phù hợp trung bình</h2>
          <strong className="recruiter-stat-value" data-testid="recruiter-average-score">
            {formatScore(stats.average_match_score)}%
          </strong>
          <p>Phân tích bởi Smart AI</p>
        </article>
        <article className="recruiter-stat-card recruiter-status-card">
          <span className="recruiter-stat-icon" aria-hidden="true"><ListChecks /></span>
          <h2>Theo trạng thái</h2>
          {statusEntries.length === 0 ? (
            <EmptyState text="Chưa có ứng viên." />
          ) : (
            <div className="recruiter-status-list">
              {statusEntries.map(([status, count]) => (
                <div key={status} className="recruiter-status-row">
                  <StatusBadge status={status} />
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>

      <section className="recruiter-top-candidates" aria-labelledby="top-candidates-title">
        <div className="recruiter-section-heading">
          <div>
            <h2 id="top-candidates-title">Ứng viên hàng đầu</h2>
            <p>Những hồ sơ có điểm phù hợp cao nhất theo phân tích AI.</p>
          </div>
          <span>{topCandidates.length} ứng viên</span>
        </div>
        {topCandidates.length === 0 ? (
          <EmptyState text="Chưa có dữ liệu ứng viên." />
        ) : (
          <div className="recruiter-candidate-list">
            {topCandidates.map((candidate, index) => {
              const score = Math.max(0, Math.min(100, Number(candidate.final_score) || 0));
              return (
                <article
                  className="recruiter-candidate-row"
                  key={`${candidate.candidate_name}-${candidate.job_title}-${index}`}
                >
                  <span className="recruiter-candidate-rank">{index + 1}</span>
                  <span className="recruiter-candidate-avatar" aria-hidden="true">
                    {candidateInitials(candidate.candidate_name)}
                  </span>
                  <div className="recruiter-candidate-identity">
                    <strong>{candidate.candidate_name}</strong>
                    <span>{candidate.job_title}</span>
                  </div>
                  <div className="recruiter-candidate-score">
                    <strong>{formatScore(score)}%</strong>
                    <span>Điểm phù hợp</span>
                  </div>
                  <div
                    className="recruiter-score-track"
                    role="progressbar"
                    aria-label={`Điểm phù hợp của ${candidate.candidate_name}`}
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow={score}
                  >
                    <span style={{ width: `${score}%` }} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function candidateInitials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(-2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "UV"
  );
}

function CompanyProfile() {
  const [form, setForm] = useState({ name: "", description: "", website: "", location: "", industry: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .myCompany()
      .then((company) =>
        setForm({
          name: company.name ?? "",
          description: company.description ?? "",
          website: company.website ?? "",
          location: company.location ?? "",
          industry: company.industry ?? "",
        }),
      )
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.saveCompany(form);
      setMessage("Đã lưu thông tin công ty.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="recruiter-company-page">
      <section className="recruiter-page-header recruiter-company-hero">
        <div>
          <h1>Thông tin công ty</h1>
          <p>Cập nhật thông tin doanh nghiệp hiển thị trong tin tuyển dụng và hồ sơ công ty.</p>
        </div>
        <span className="recruiter-company-hero-icon" aria-hidden="true">
          <Building2 />
        </span>
      </section>

      <div className="recruiter-company-layout">
        <section className="recruiter-company-card" aria-labelledby="company-form-title">
          <header className="recruiter-company-card-heading">
            <span className="recruiter-company-card-icon" aria-hidden="true"><Building2 /></span>
            <div>
              <h2 id="company-form-title">Thông tin công ty</h2>
              <p>Cập nhật thông tin cơ bản về doanh nghiệp của bạn.</p>
            </div>
          </header>
          <Alert type="success">{message}</Alert>
          <Alert>{error}</Alert>
          {loading ? (
            <Spinner />
          ) : (
            <form onSubmit={save} className="stacked-form recruiter-company-form">
              <label htmlFor="company-name">Tên công ty</label>
              <input
                id="company-name"
                required
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
              />
              <label htmlFor="company-description">Mô tả</label>
              <textarea
                id="company-description"
                rows={4}
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
              />
              <label htmlFor="company-website">Website</label>
              <input id="company-website" value={form.website} onChange={(e) => update("website", e.target.value)} />
              <label htmlFor="company-location">Địa điểm</label>
              <input id="company-location" value={form.location} onChange={(e) => update("location", e.target.value)} />
              <label htmlFor="company-industry">Lĩnh vực</label>
              <input id="company-industry" value={form.industry} onChange={(e) => update("industry", e.target.value)} />
              <button className="btn-primary company-save-button" type="submit" disabled={busy}>
                {busy ? "Đang lưu..." : "Lưu thông tin"}
              </button>
            </form>
          )}
        </section>

        <aside className="recruiter-company-card recruiter-company-preview" aria-labelledby="company-preview-title">
          <header className="recruiter-company-card-heading">
            <span className="recruiter-company-card-icon preview" aria-hidden="true"><Eye /></span>
            <div>
              <h2 id="company-preview-title">Xem trước thông tin công ty</h2>
              <p>Đây là cách thông tin của bạn hiển thị với ứng viên.</p>
            </div>
          </header>
          <div className="recruiter-company-preview-panel">
            <div className="recruiter-company-preview-cover">
              <span aria-hidden="true"><Building2 /></span>
            </div>
            <div className="recruiter-company-preview-content">
              <h3 data-testid="company-preview-name">{form.name || "Tên công ty"}</h3>
              <div className="recruiter-company-preview-row">
                <FileText aria-hidden="true" />
                <span>{form.description || "Chưa cập nhật mô tả công ty."}</span>
              </div>
              <div className="recruiter-company-preview-row website">
                <Link2 aria-hidden="true" />
                <span>{form.website || "Chưa cập nhật website"}</span>
              </div>
              <div className="recruiter-company-preview-row">
                <MapPin aria-hidden="true" />
                <span>{form.location || "Chưa cập nhật địa điểm"}</span>
              </div>
              <div className="recruiter-company-preview-row">
                <BriefcaseBusiness aria-hidden="true" />
                <span>{form.industry || "Chưa cập nhật lĩnh vực"}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

const emptyJob = { title: "", description: "", skills: "", min_experience: 0, location: "Remote", employment_type: "Full-time", salary_range: "" };

function JobManager() {
  const [jobs, setJobs] = useState([]);
  const [form, setForm] = useState(emptyJob);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [showAll, setShowAll] = useState(false);

  async function load() {
    setLoadingJobs(true);
    try {
      setJobs(await api.myJobs());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingJobs(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function startEdit(job) {
    setEditingId(job.id);
    setForm({
      title: job.title ?? "",
      description: job.description ?? "",
      skills: job.skills ?? "",
      min_experience: job.min_experience ?? 0,
      location: job.location ?? "",
      employment_type: job.employment_type ?? "",
      salary_range: job.salary_range ?? "",
    });
    setError("");
    setMessage("");
  }

  function resetForm() {
    setEditingId(null);
    setForm({ ...emptyJob });
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (editingId) {
        await api.updateJob(editingId, form);
        setMessage("Đã cập nhật tin tuyển dụng.");
      } else {
        await api.createJob(form);
        setMessage("Đã đăng tin tuyển dụng mới.");
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(job) {
    setActionId(job.id);
    setError("");
    try {
      await api.updateJob(job.id, { status: job.status === "open" ? "closed" : "open" });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionId(null);
    }
  }

  async function remove(job) {
    if (!confirm(`Xóa tin "${job.title}"?`)) return;
    setActionId(job.id);
    setError("");
    try {
      await api.deleteJob(job.id);
      if (editingId === job.id) resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionId(null);
    }
  }

  const visibleJobs = showAll ? jobs : jobs.slice(0, 3);

  return (
    <div className="recruiter-jobs-page">
      <section className="recruiter-page-header recruiter-company-hero recruiter-jobs-hero">
        <div>
          <h1>Tin tuyển dụng</h1>
          <p>Đăng tin tuyển dụng mới và quản lý các vị trí đang tuyển dụng của bạn.</p>
        </div>
        <span className="recruiter-company-hero-icon" aria-hidden="true"><FileText /></span>
      </section>

      <div className="recruiter-jobs-layout">
        <section className="recruiter-jobs-card" aria-labelledby="job-form-title">
          <header className="recruiter-jobs-card-heading">
            <span className="recruiter-jobs-card-icon" aria-hidden="true"><FileText /></span>
            <div>
              <h2 id="job-form-title">{editingId ? "Chỉnh sửa tin tuyển dụng" : "Đăng tin tuyển dụng mới"}</h2>
              <p>{editingId ? "Cập nhật thông tin vị trí đang tuyển dụng." : "Tạo cơ hội mới để tiếp cận ứng viên phù hợp."}</p>
            </div>
          </header>
          <Alert type="success">{message}</Alert>
          <Alert>{error}</Alert>
          <form onSubmit={submit} className="stacked-form recruiter-job-form">
            <label htmlFor="job-title">Chức danh</label>
            <input
              id="job-title"
              required
              placeholder="Nhập chức danh vị trí tuyển dụng..."
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
            />
            <label htmlFor="job-description">Mô tả công việc</label>
            <textarea
              id="job-description"
              required
              rows={5}
              placeholder="Mô tả chi tiết công việc, trách nhiệm, quyền lợi..."
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
            />
            <label htmlFor="job-skills">Kỹ năng yêu cầu (phân cách bởi dấu phẩy)</label>
            <input
              id="job-skills"
              placeholder="python, fastapi, sql, docker (ưu tiên)"
              value={form.skills}
              onChange={(e) => update("skills", e.target.value)}
            />
            <p className="field-hint">Kỹ năng không bắt buộc: thêm “(ưu tiên)” phía sau, ví dụ <em>docker (ưu tiên)</em>. Kỹ năng ưu tiên ảnh hưởng điểm AI bằng một nửa kỹ năng bắt buộc.</p>
            <div className="recruiter-job-fields">
              <div>
                <label htmlFor="job-experience">Kinh nghiệm tối thiểu (năm)</label>
                <input
                  id="job-experience"
                  type="number"
                  step="0.5"
                  min="0"
                  value={form.min_experience}
                  onChange={(e) => update("min_experience", parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <label htmlFor="job-location">Địa điểm</label>
                <input id="job-location" value={form.location} onChange={(e) => update("location", e.target.value)} />
              </div>
              <div>
                <label htmlFor="job-employment-type">Hình thức</label>
                <input
                  id="job-employment-type"
                  value={form.employment_type}
                  onChange={(e) => update("employment_type", e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="job-salary">Mức lương</label>
                <input
                  id="job-salary"
                  placeholder="VD: 15-25 triệu"
                  value={form.salary_range}
                  onChange={(e) => update("salary_range", e.target.value)}
                />
              </div>
            </div>
            <div className="form-actions recruiter-job-form-actions">
              <button className="btn-primary recruiter-job-submit" type="submit" disabled={busy}>
                <Send size={17} aria-hidden="true" />
                {busy ? "Đang lưu..." : editingId ? "Cập nhật" : "Đăng tin"}
              </button>
              {editingId && (
                <button type="button" className="btn-ghost" onClick={resetForm}>Hủy</button>
              )}
            </div>
          </form>
        </section>

        <aside className="recruiter-jobs-card recruiter-current-jobs" aria-labelledby="current-jobs-title">
          <header className="recruiter-jobs-card-heading recruiter-current-jobs-heading">
            <span className="recruiter-jobs-card-icon list" aria-hidden="true"><Users /></span>
            <div>
              <h2 id="current-jobs-title">Tin tuyển dụng hiện tại</h2>
              <p>{jobs.length} vị trí của bạn</p>
            </div>
            {jobs.length > 3 && (
              <button
                className="recruiter-jobs-toggle"
                type="button"
                aria-expanded={showAll}
                onClick={() => setShowAll((value) => !value)}
              >
                {showAll ? "Thu gọn" : "Xem tất cả"} <ArrowRight size={14} aria-hidden="true" />
              </button>
            )}
          </header>

          {loadingJobs ? (
            <Spinner />
          ) : jobs.length === 0 ? (
            <EmptyState text="Bạn chưa đăng tin tuyển dụng nào." />
          ) : (
            <div className={`recruiter-current-job-list ${showAll ? "is-expanded" : ""}`}>
              {visibleJobs.map((job) => (
                <article className="recruiter-current-job" data-testid={`recruiter-job-${job.id}`} key={job.id}>
                  <span className="recruiter-current-job-icon" aria-hidden="true"><BriefcaseBusiness /></span>
                  <div className="recruiter-current-job-body">
                    <div className="recruiter-current-job-title">
                      <h3>{job.title}</h3>
                      <span className={`recruiter-job-status ${job.status === "open" ? "open" : "closed"}`}>
                        {job.status === "open" ? "Đang tuyển" : "Đã đóng"}
                      </span>
                    </div>
                    <div className="recruiter-current-job-meta">
                      {job.location && <span><MapPin />{job.location}</span>}
                      {job.employment_type && <span><BriefcaseBusiness />{job.employment_type}</span>}
                      {job.applicants_count != null && <span><Users />{job.applicants_count} ứng viên</span>}
                    </div>
                    {job.created_at && <time>Đăng {formatDate(job.created_at)}</time>}
                    <div className="recruiter-current-job-actions">
                      <button type="button" onClick={() => startEdit(job)} disabled={actionId === job.id}>Sửa</button>
                      <button type="button" onClick={() => toggleStatus(job)} disabled={actionId === job.id}>
                        {job.status === "open" ? "Đóng tin" : "Mở lại"}
                      </button>
                      <button className="danger" type="button" onClick={() => remove(job)} disabled={actionId === job.id}>
                        Xóa
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

const PIPELINE_COLUMNS = [
  ["applied", "Đã ứng tuyển", FileText],
  ["screening", "Sàng lọc", ListChecks],
  ["interview", "Phỏng vấn", Users],
  ["offer", "Offer", Sparkles],
  ["hired", "Đã tuyển", BriefcaseBusiness],
];

const NEXT_STATUS = {
  applied: "screening",
  screening: "interview",
  interview: "offer",
  offer: "hired",
};

const NEXT_ACTION_LABEL = {
  screening: "Chuyển sang Sàng lọc",
  interview: "Chuyển sang Phỏng vấn",
  offer: "Chuyển sang Offer",
  hired: "Đánh dấu Đã tuyển",
};

function ApplicationsRanking() {
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [apps, setApps] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingApps, setLoadingApps] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [details, setDetails] = useState(null);

  useEffect(() => {
    api
      .myJobs()
      .then((data) => {
        setJobs(data);
        if (data.length > 0) setSelectedJobId(String(data[0].id));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingJobs(false));
  }, []);

  useEffect(() => {
    if (!selectedJobId) {
      setApps([]);
      return;
    }
    loadApps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId]);

  async function loadApps() {
    setLoadingApps(true);
    setError("");
    try {
      setApps(await api.jobApplications(selectedJobId));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingApps(false);
    }
  }

  function requestTransition(application, status) {
    setError("");
    setMessage("");
    setPending({ application, status });
  }

  async function confirmTransition({ reason, candidateMessage }) {
    setUpdating(true);
    setError("");
    try {
      await api.updateApplicationStatus(pending.application.id, pending.status, reason, candidateMessage);
      setMessage(`Đã chuyển ${pending.application.candidate_name} sang ${STATUS_LABELS[pending.status]}.`);
      setPending(null);
      setDetails(null);
      await loadApps();
    } catch (e) {
      setError(e.message);
    } finally {
      setUpdating(false);
    }
  }

  async function confirmInterviewProposal(payload) {
    setUpdating(true);
    setError("");
    try {
      await api.createInterviewProposal({ application_id: pending.application.id, ...payload });
      setMessage(`Đã gửi 3 phương án phỏng vấn cho ${pending.application.candidate_name}.`);
      setPending(null);
      setDetails(null);
      await loadApps();
    } catch (e) {
      setError(e.message);
    } finally {
      setUpdating(false);
    }
  }

  const selectedJob = jobs.find((job) => String(job.id) === selectedJobId);
  const rejectedCandidates = apps
    .filter((application) => application.status === "rejected")
    .sort((a, b) => Number(b.final_score || 0) - Number(a.final_score || 0));

  return (
    <section className="ats-section">
      <div className="ats-header">
        <div>
          <h1>Ứng viên & Pipeline tuyển dụng</h1>
          <p>Theo dõi ứng viên theo từng giai đoạn và điểm matching từ AI.</p>
        </div>
        <label className="ats-job-picker">
          <span>Chọn tin tuyển dụng</span>
          <select
            aria-label="Chọn tin tuyển dụng"
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            disabled={loadingJobs || jobs.length === 0}
          >
            {jobs.length === 0 && <option value="">Chưa có tin tuyển dụng</option>}
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title} ({job.applicants_count ?? 0} ứng viên)
              </option>
            ))}
          </select>
        </label>
      </div>

      <Alert type="success">{message}</Alert>
      <Alert>{error}</Alert>

      {loadingJobs ? (
        <Spinner />
      ) : jobs.length === 0 ? (
        <EmptyState text="Bạn chưa có tin tuyển dụng để tạo pipeline." />
      ) : (
        <>
          {loadingApps ? (
            <Spinner />
          ) : (
            <>
              <div className="ats-board-viewport">
                <div className="ats-board" aria-label={`Pipeline tuyển dụng ${selectedJob?.title || ""}`}>
                  {PIPELINE_COLUMNS.map(([status, label, Icon]) => {
                    const candidates = apps
                      .filter((application) => application.status === status)
                      .sort((a, b) => Number(b.final_score || 0) - Number(a.final_score || 0));
                    return (
                      <section className={`ats-column ats-column-${status}`} key={status}>
                        <header>
                          <div className="ats-column-title">
                            <span className="ats-column-icon" aria-hidden="true"><Icon /></span>
                            <h3>{label}</h3>
                          </div>
                          <span className="ats-column-count">{candidates.length}</span>
                        </header>
                        <div className="ats-column-body">
                          {candidates.length === 0 ? (
                            <div className="ats-column-empty">
                              <FileText aria-hidden="true" />
                              <span>Chưa có ứng viên</span>
                            </div>
                          ) : (
                            candidates.map((application) => (
                              <CandidatePipelineCard
                                key={application.id}
                                application={application}
                                onDetails={() => setDetails(application)}
                                onTransition={(nextStatus) => requestTransition(application, nextStatus)}
                              />
                            ))
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
              {rejectedCandidates.length > 0 && (
                <section className="ats-rejected-section" aria-labelledby="rejected-title">
                  <header>
                    <div>
                      <span className="ats-column-icon" aria-hidden="true"><XCircle /></span>
                      <h2 id="rejected-title">Đã từ chối</h2>
                    </div>
                    <span>{rejectedCandidates.length}</span>
                  </header>
                  <div className="ats-rejected-list">
                    {rejectedCandidates.map((application) => (
                      <CandidatePipelineCard
                        key={application.id}
                        application={application}
                        onDetails={() => setDetails(application)}
                        onTransition={(nextStatus) => requestTransition(application, nextStatus)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}

      {pending && (
        pending.application.status === "screening" && pending.status === "interview" ? (
          <InterviewProposalModal
            key={`proposal-${pending.application.id}`}
            application={pending.application}
            busy={updating}
            error={error}
            onClose={() => !updating && setPending(null)}
            onConfirm={confirmInterviewProposal}
          />
        ) : (
          <TransitionModal
            key={`${pending.application.id}-${pending.status}`}
            application={pending.application}
            status={pending.status}
            busy={updating}
            error={error}
            onClose={() => !updating && setPending(null)}
            onConfirm={confirmTransition}
          />
        )
      )}
      {details && <CandidateDetailModal application={details} onClose={() => setDetails(null)} />}
    </section>
  );
}

function CandidatePipelineCard({ application, onDetails, onTransition }) {
  const nextStatus = NEXT_STATUS[application.status];
  const finalScore = formatScore(application.final_score);
  const scoreLevel = finalScore >= 70 ? "high" : finalScore >= 50 ? "medium" : "low";
  return (
    <article className="ats-candidate-card" data-testid={`ats-application-${application.id}`}>
      <div className="ats-candidate-heading">
        <div className="ats-candidate-identity">
          <span className="ats-candidate-avatar" aria-hidden="true">{candidateInitials(application.candidate_name)}</span>
          <div>
            <h4>{application.candidate_name}</h4>
            <p>{application.job_title}</p>
          </div>
        </div>
        <span className={`ats-ai-score ${scoreLevel}`}>{finalScore}%</span>
      </div>
      <dl className="ats-card-scores">
        {application.skill_score != null && <div><dt>Kỹ năng</dt><dd>{formatScore(application.skill_score)}%</dd></div>}
        {application.experience_score != null && <div><dt>Kinh nghiệm</dt><dd>{formatScore(application.experience_score)}%</dd></div>}
      </dl>
      {application.created_at && (
        <p className="ats-applied-date">Ứng tuyển: <strong>{formatDate(application.created_at)}</strong></p>
      )}
      <button className="ats-detail-button" type="button" onClick={onDetails}>
        <Eye size={15} aria-hidden="true" /> Xem chi tiết
      </button>
      {(nextStatus || !["hired", "rejected"].includes(application.status)) && (
        <div className="ats-card-actions">
          {nextStatus && (
            <button className="btn-primary" type="button" onClick={() => onTransition(nextStatus)}>
              {NEXT_ACTION_LABEL[nextStatus]} <ArrowRight size={15} aria-hidden="true" />
            </button>
          )}
          {!["hired", "rejected"].includes(application.status) && (
            <button
              className="ats-reject-button"
              type="button"
              title="Từ chối ứng viên"
              aria-label={`Từ chối ${application.candidate_name}`}
              onClick={() => onTransition("rejected")}
            >
              <XCircle size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function TransitionModal({ application, status, busy, error, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [candidateMessage, setCandidateMessage] = useState("");
  const rejected = status === "rejected";

  function submit(event) {
    event.preventDefault();
    if (rejected && !reason.trim()) return;
    onConfirm({ reason, candidateMessage });
  }

  return (
    <div className="ats-modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="ats-modal ats-transition-modal" role="dialog" aria-modal="true" aria-labelledby="transition-title" onSubmit={submit}>
        <button className="ats-modal-close" type="button" aria-label="Đóng" title="Đóng" onClick={onClose} disabled={busy}>
          <X size={20} aria-hidden="true" />
        </button>
        <h2 id="transition-title">
          {rejected ? "Bạn muốn từ chối ứng viên này?" : `Chuyển ứng viên sang ${STATUS_LABELS[status]}?`}
        </h2>
        <p className="ats-modal-candidate">{application.candidate_name}</p>
        <div className="ats-transition-path">
          <StatusBadge status={application.status} />
          <ArrowRight size={18} aria-hidden="true" />
          <StatusBadge status={status} />
        </div>
        <Alert>{error}</Alert>
        <label htmlFor="transition-reason">{rejected ? "Lý do từ chối" : "Ghi chú nội bộ (không bắt buộc)"}</label>
        <textarea
          id="transition-reason"
          rows={4}
          required={rejected}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={rejected ? "Nhập lý do từ chối ứng viên" : "Chỉ nhà tuyển dụng nhìn thấy nội dung này"}
        />
        <label htmlFor="transition-candidate-message">Ghi chú gửi ứng viên (không bắt buộc)</label>
        <textarea
          id="transition-candidate-message"
          rows={4}
          value={candidateMessage}
          onChange={(event) => setCandidateMessage(event.target.value)}
          placeholder="Nhập lời nhắn dành cho ứng viên"
        />
        <small className="ats-field-help">Nội dung này sẽ được gửi cho ứng viên và hiển thị trong lịch sử ứng tuyển.</small>
        <div className="ats-modal-actions">
          <button className="btn-ghost" type="button" onClick={onClose} disabled={busy}>Hủy</button>
          <button className={rejected ? "btn-danger" : "btn-primary"} disabled={busy || (rejected && !reason.trim())}>
            {busy ? "Đang cập nhật..." : "Xác nhận"}
          </button>
        </div>
      </form>
    </div>
  );
}

function InterviewProposalModal({ application, busy, error, onClose, onConfirm }) {
  const [times, setTimes] = useState(["", "", ""]);
  const [duration, setDuration] = useState(45);
  const [mode, setMode] = useState("online");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [candidateMessage, setCandidateMessage] = useState("");
  const [validationError, setValidationError] = useState("");

  function updateTime(index, value) {
    setTimes((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
    setValidationError("");
  }

  function submit(event) {
    event.preventDefault();
    const parsedTimes = times.map((value) => new Date(value));
    if (times.some((value) => !value) || parsedTimes.some((value) => Number.isNaN(value.getTime()))) {
      setValidationError("Vui lòng nhập đủ 3 thời gian phỏng vấn.");
      return;
    }
    const isoTimes = parsedTimes.map((value) => value.toISOString());
    if (new Set(isoTimes).size !== 3) {
      setValidationError("Ba thời gian phỏng vấn không được trùng nhau.");
      return;
    }
    if (parsedTimes.some((value) => value.getTime() <= Date.now())) {
      setValidationError("Các thời gian phỏng vấn phải nằm trong tương lai.");
      return;
    }
    if (Number(duration) < 15 || Number(duration) > 480) {
      setValidationError("Thời lượng phỏng vấn phải từ 15 đến 480 phút.");
      return;
    }
    onConfirm({
      proposed_times: isoTimes,
      duration_minutes: Number(duration),
      mode,
      location,
      notes,
      candidate_message: candidateMessage,
    });
  }

  return (
    <div className="ats-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="ats-modal interview-proposal-modal" role="dialog" aria-modal="true" aria-labelledby="proposal-title" onSubmit={submit}>
        <button className="ats-modal-close" type="button" aria-label="Đóng" title="Đóng" onClick={onClose} disabled={busy}>
          <X size={20} aria-hidden="true" />
        </button>
        <h2 id="proposal-title">Đề xuất thời gian phỏng vấn</h2>
        <p className="ats-modal-candidate">{application.candidate_name} · {application.job_title}</p>
        <Alert>{validationError || error}</Alert>
        <div className="interview-proposal-times">
          {times.map((value, index) => (
            <label key={index}>
              Phương án {index + 1}
              <input
                required
                type="datetime-local"
                value={value}
                onChange={(event) => updateTime(index, event.target.value)}
              />
            </label>
          ))}
        </div>
        <div className="interview-proposal-fields">
          <label>
            Hình thức
            <select value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="online">Trực tuyến</option>
              <option value="onsite">Trực tiếp</option>
            </select>
          </label>
          <label>
            Thời lượng (phút)
            <input type="number" min="15" max="480" value={duration} onChange={(event) => setDuration(event.target.value)} />
          </label>
        </div>
        <label>
          Địa điểm / Link
          <input value={location} onChange={(event) => setLocation(event.target.value)} />
        </label>
        <label>
          Ghi chú
          <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <label>
          Ghi chú gửi ứng viên (không bắt buộc)
          <textarea rows={3} value={candidateMessage} onChange={(event) => setCandidateMessage(event.target.value)} />
        </label>
        <small className="ats-field-help">Nội dung này sẽ được gửi cho ứng viên và hiển thị trong lịch sử ứng tuyển.</small>
        <div className="ats-modal-actions">
          <button className="btn-ghost" type="button" onClick={onClose} disabled={busy}>Hủy</button>
          <button className="btn-primary" disabled={busy}>
            {busy ? "Đang gửi..." : "Gửi đề xuất"}
          </button>
        </div>
      </form>
    </div>
  );
}

const AI_FEEDBACK_OPTIONS = [
  ["agree", "Điểm hợp lý"],
  ["too_high", "AI chấm quá cao"],
  ["too_low", "AI chấm quá thấp"],
];

function AIFeedbackBox({ applicationId }) {
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLabel("");
    setNote("");
    setStatus("");
    api
      .getAIFeedback(applicationId)
      .then((data) => {
        if (active && data) {
          setLabel(data.label);
          setNote(data.note || "");
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [applicationId]);

  async function save(nextLabel) {
    setError("");
    setStatus("");
    try {
      await api.saveAIFeedback(applicationId, { label: nextLabel, note });
      setLabel(nextLabel);
      setStatus("Đã ghi nhận phản hồi. Cảm ơn bạn đã giúp cải thiện AI.");
    } catch (e) {
      setError(e.message || "Không lưu được phản hồi.");
    }
  }

  return (
    <div className="ai-feedback" role="group" aria-label="Đánh giá điểm AI">
      <h3>Điểm AI này có đúng không?</h3>
      <div className="ai-feedback-options">
        {AI_FEEDBACK_OPTIONS.map(([value, text]) => (
          <button
            key={value}
            type="button"
            className={`ai-feedback-btn ${label === value ? "is-active" : ""}`}
            aria-pressed={label === value}
            onClick={() => save(value)}
          >
            {text}
          </button>
        ))}
      </div>
      <input
        className="ai-feedback-note"
        aria-label="Ghi chú cho phản hồi AI"
        placeholder="Ghi chú (không bắt buộc), nhấn một nút ở trên để lưu"
        maxLength={300}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {status && <p className="ai-feedback-status">{status}</p>}
      {error && <p className="ai-feedback-error">{error}</p>}
    </div>
  );
}

function CandidateDetailModal({ application, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api
      .applicationStatusHistory(application.id)
      .then(setHistory)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [application.id]);

  return (
    <div className="ats-modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="ats-modal ats-detail-modal" role="dialog" aria-modal="true" aria-labelledby="candidate-detail-title">
        <button className="ats-modal-close" type="button" aria-label="Đóng" title="Đóng" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
        <div className="ats-detail-header">
          <div>
            <p className="ats-eyebrow">Hồ sơ ứng viên</p>
            <h2 id="candidate-detail-title">{application.candidate_name}</h2>
            <p>{application.candidate_email} · {application.job_title}</p>
          </div>
          <StatusBadge status={application.status} />
        </div>

        <div className="ats-detail-grid">
          <section>
            <h3>AI Matching <span>{formatScore(application.final_score)}%</span></h3>
            <ScoreBar label="Kỹ năng" value={application.skill_score} color="#00b14f" />
            <ScoreBar label="Kinh nghiệm" value={application.experience_score} color="#3b82f6" />
            <ScoreBar label="Ngữ nghĩa" value={application.semantic_score} color="#6d5dfb" />
            <ScoreBar label="Dự án" value={application.project_score} color="#f59e0b" />
            <h3>Kỹ năng còn thiếu</h3>
            {application.missing_skills.length > 0 ? (
              <div className="ats-skill-list">{application.missing_skills.map((skill) => <span key={skill}>{skill}</span>)}</div>
            ) : <p className="job-meta">Không có kỹ năng thiếu trong kết quả AI.</p>}
            <h3>Giải thích</h3>
            <p className="ats-explanation">{application.explanation || "Chưa có giải thích từ hệ thống AI."}</p>
            <AIFeedbackBox applicationId={application.id} />
          </section>

          <section>
            <h3>Lịch sử tuyển dụng</h3>
            {loading ? <Spinner /> : error ? <Alert>{error}</Alert> : (
              <ol className="ats-history">
                <li>
                  <time>{formatDateTime(application.created_at)}</time>
                  <strong>Đã ứng tuyển</strong>
                </li>
                {history.map((item) => {
                  const messageOnly = item.old_status === item.new_status;
                  return (
                    <li key={item.id}>
                      <time>{formatDateTime(item.changed_at)}</time>
                      <strong>
                        {messageOnly
                          ? `${STATUS_LABELS[item.new_status]} · Lời nhắn`
                          : `${STATUS_LABELS[item.old_status]} → ${STATUS_LABELS[item.new_status]}`}
                      </strong>
                      <span>Người thực hiện: {item.changed_by_name || `#${item.changed_by}`}</span>
                      {item.reason && <p>Ghi chú nội bộ: {item.reason}</p>}
                      {item.candidate_message && <p className="ats-candidate-message">Gửi ứng viên: {item.candidate_message}</p>}
                    </li>
                  );
                })}
              </ol>
            )}
            <Alert type="success">{message}</Alert>
            <div className="ats-detail-actions">
              {application.status === "interview" && (
                <button className="btn-ghost" type="button" onClick={() => setForm(form === "interview" ? "" : "interview")}>Tạo lịch phỏng vấn</button>
              )}
              <button className="btn-ghost" type="button" onClick={() => setForm(form === "evaluation" ? "" : "evaluation")}>Đánh giá ứng viên</button>
              <button className="btn-ghost" type="button" onClick={() => setForm(form === "message" ? "" : "message")}>Gửi lời nhắn</button>
            </div>
            {form === "interview" && <ScheduleInterviewForm applicationId={application.id} onDone={() => { setForm(""); setMessage("Đã tạo lịch phỏng vấn."); }} />}
            {form === "evaluation" && <EvaluateForm applicationId={application.id} onDone={() => { setForm(""); setMessage("Đã lưu đánh giá ứng viên."); }} />}
            {form === "message" && (
              <ApplicationMessageForm
                applicationId={application.id}
                onDone={(item) => {
                  setHistory((current) => [...current, item]);
                  setForm("");
                  setMessage("Đã gửi lời nhắn cho ứng viên.");
                }}
              />
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function ApplicationMessageForm({ applicationId, onDone }) {
  const [candidateMessage, setCandidateMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!candidateMessage.trim()) return;
    setBusy(true);
    setError("");
    try {
      const item = await api.sendApplicationMessage(applicationId, candidateMessage.trim());
      onDone(item);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <Alert>{error}</Alert>
      <label htmlFor={`candidate-message-${applicationId}`}>Ghi chú gửi ứng viên</label>
      <textarea
        id={`candidate-message-${applicationId}`}
        rows={4}
        required
        value={candidateMessage}
        onChange={(event) => setCandidateMessage(event.target.value)}
        placeholder="Nhập lời nhắn dành cho ứng viên"
      />
      <small className="ats-field-help">Nội dung này không làm thay đổi trạng thái ứng tuyển.</small>
      <button className="btn-primary" disabled={busy || !candidateMessage.trim()}>
        {busy ? "Đang gửi..." : "Gửi lời nhắn"}
      </button>
    </form>
  );
}

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("vi-VN").format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function ScheduleInterviewForm({ applicationId, onDone }) {
  const [scheduledAt, setScheduledAt] = useState("");
  const [duration, setDuration] = useState(45);
  const [mode, setMode] = useState("online");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.scheduleInterview({
        application_id: applicationId,
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_minutes: Number(duration),
        mode,
        location,
        notes,
      });
      onDone();
    } catch (err) {
      setError(err.status === 409 ? "Ứng viên này đã có lịch phỏng vấn." : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="inline-form">
      <Alert>{error}</Alert>
      <label>Thời gian</label>
      <input required type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
      <label>Thời lượng (phút)</label>
      <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
      <label>Hình thức</label>
      <select value={mode} onChange={(e) => setMode(e.target.value)}>
        <option value="online">Trực tuyến</option>
        <option value="onsite">Trực tiếp</option>
      </select>
      <label>Địa điểm / Link</label>
      <input value={location} onChange={(e) => setLocation(e.target.value)} />
      <label>Ghi chú</label>
      <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button className="btn-primary" disabled={busy}>
        {busy ? "Đang lưu..." : "Xác nhận lịch phỏng vấn"}
      </button>
    </form>
  );
}

function EvaluateForm({ applicationId, onDone }) {
  const [rating, setRating] = useState(4);
  const [strengths, setStrengths] = useState("");
  const [concerns, setConcerns] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.createEvaluation({ application_id: applicationId, rating: Number(rating), strengths, concerns, comment });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="inline-form">
      <Alert>{error}</Alert>
      <label>Đánh giá (1-5 sao)</label>
      <input type="number" min="1" max="5" value={rating} onChange={(e) => setRating(e.target.value)} />
      <label>Điểm mạnh</label>
      <textarea rows={2} value={strengths} onChange={(e) => setStrengths(e.target.value)} />
      <label>Điểm cần lưu ý</label>
      <textarea rows={2} value={concerns} onChange={(e) => setConcerns(e.target.value)} />
      <label>Nhận xét chung</label>
      <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
      <button className="btn-primary" disabled={busy}>
        {busy ? "Đang lưu..." : "Lưu đánh giá"}
      </button>
    </form>
  );
}

function InterviewList() {
  const [items, setItems] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [filter, setFilter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load(selectDefault = false) {
    setError("");
    try {
      const [interviews, pendingProposals] = await Promise.all([
        api.myInterviews(),
        api.recruiterInterviewProposals(),
      ]);
      setItems(interviews || []);
      setProposals(pendingProposals || []);
      if (selectDefault) setFilter(pendingProposals?.length ? "pending" : "scheduled");
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load(true).finally(() => setLoading(false));
  }, []);

  async function setStatus(id, status) {
    setUpdating({ id, status });
    setError("");
    setMessage("");
    try {
      await api.updateInterviewStatus(id, status);
      await load();
      setMessage(status === "completed" ? "Đã đánh dấu lịch phỏng vấn hoàn tất." : "Đã hủy lịch phỏng vấn.");
    } catch (e) {
      setError(e.message);
    } finally {
      setUpdating(null);
    }
  }

  const counts = {
    pending: proposals.length,
    scheduled: items.filter((item) => item.status === "scheduled").length,
    completed: items.filter((item) => item.status === "completed").length,
    cancelled: items.filter((item) => item.status === "cancelled").length,
  };
  const filteredItems = items
    .filter((item) => item.status === filter)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const filters = [
    ["pending", "Chờ xác nhận", Clock3],
    ["scheduled", "Sắp tới", CalendarDays],
    ["completed", "Hoàn tất", CheckCircle2],
    ["cancelled", "Đã hủy", XCircle],
  ];
  const visibleCount = filter === "pending" ? proposals.length : filteredItems.length;

  return (
    <div className="recruiter-interviews-page">
      <section className="recruiter-interviews-hero">
        <div>
          <h1>Lịch phỏng vấn</h1>
          <p>Theo dõi lịch hẹn, xác nhận thời gian phỏng vấn và quản lý các buổi phỏng vấn với ứng viên.</p>
        </div>
        <span className="recruiter-interviews-hero-icon" aria-hidden="true">
          <CalendarDays />
          <Clock3 />
        </span>
      </section>

      <Alert type="success">{message}</Alert>
      <Alert>{error}</Alert>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <section className="recruiter-interview-summary" aria-label="Tổng quan lịch phỏng vấn">
            <InterviewSummaryCard icon={Clock3} label="Chờ ứng viên xác nhận" value={counts.pending} tone="amber" testId="interview-pending-count" />
            <InterviewSummaryCard icon={CalendarDays} label="Sắp tới" value={counts.scheduled} tone="blue" testId="interview-scheduled-count" />
            <InterviewSummaryCard icon={CheckCircle2} label="Hoàn tất" value={counts.completed} tone="green" testId="interview-completed-count" />
            <InterviewSummaryCard icon={XCircle} label="Đã hủy" value={counts.cancelled} tone="red" testId="interview-cancelled-count" />
          </section>

          <div className="recruiter-interview-filters" aria-label="Lọc lịch phỏng vấn">
            {filters.map(([status, label, Icon]) => (
              <button
                key={status}
                type="button"
                className={filter === status ? "is-active" : ""}
                aria-pressed={filter === status}
                onClick={() => setFilter(status)}
              >
                <Icon aria-hidden="true" /> {label} ({counts[status]})
              </button>
            ))}
          </div>

          <div className="recruiter-interview-layout">
            <main className="recruiter-interview-list" aria-live="polite">
              {visibleCount === 0 ? (
                <div className="recruiter-interview-empty">
                  <CalendarDays aria-hidden="true" />
                  <p>{INTERVIEW_EMPTY_LABELS[filter] || "Chưa có lịch phỏng vấn"}</p>
                </div>
              ) : filter === "pending" ? (
                proposals.map((proposal) => <RecruiterProposalCard key={proposal.id} proposal={proposal} />)
              ) : (
                filteredItems.map((interview) => (
                  <InterviewCard
                    key={interview.id}
                    interview={interview}
                    updating={updating?.id === interview.id ? updating.status : ""}
                    onStatusChange={setStatus}
                  />
                ))
              )}
            </main>
            <InterviewGuide />
          </div>
        </>
      )}
    </div>
  );
}

function InterviewSummaryCard({ icon: Icon, label, value, tone, testId }) {
  return (
    <article className={`recruiter-interview-summary-card ${tone}`}>
      <span aria-hidden="true"><Icon /></span>
      <div><h2>{label}</h2><strong data-testid={testId}>{value}</strong></div>
    </article>
  );
}

const INTERVIEW_STATUS_LABELS = {
  scheduled: "Sắp tới",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
};

const INTERVIEW_EMPTY_LABELS = {
  pending: "Không có lời mời nào đang chờ ứng viên xác nhận.",
  scheduled: "Chưa có lịch phỏng vấn sắp tới.",
  completed: "Chưa có lịch phỏng vấn hoàn tất.",
  cancelled: "Chưa có lịch phỏng vấn đã hủy.",
};

function RecruiterProposalCard({ proposal }) {
  const options = [...(proposal.options || [])].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  return (
    <article className="recruiter-proposal-card" data-testid={`recruiter-proposal-${proposal.id}`}>
      <header>
        <CandidateHeading name={proposal.candidate_name} job={proposal.job_title} />
        <span className="recruiter-proposal-status">Chờ ứng viên chọn lịch</span>
      </header>
      <div className="recruiter-proposal-meta">
        {proposal.company_name && <p><Building2 aria-hidden="true" />{proposal.company_name}</p>}
        <p><Video aria-hidden="true" />Hình thức: {proposal.mode === "online" ? "Trực tuyến" : "Trực tiếp"}</p>
        <p><Clock3 aria-hidden="true" />Thời lượng: {proposal.duration_minutes} phút</p>
        {proposal.location && <ProposalLocation location={proposal.location} />}
      </div>
      {proposal.notes && <p className="recruiter-proposal-notes"><FileText aria-hidden="true" />{proposal.notes}</p>}
      <div className="recruiter-proposal-times" aria-label="Ba mốc thời gian đã đề xuất">
        {options.map((option) => {
          const time = interviewOptionParts(option.scheduled_at, proposal.duration_minutes);
          return (
            <div key={option.id} className="recruiter-proposal-time">
              <CalendarDays aria-hidden="true" />
              <span><strong>{time.date}</strong><small>{time.range}</small></span>
            </div>
          );
        })}
      </div>
      <p className="recruiter-proposal-waiting">
        <Clock3 aria-hidden="true" />
        Đang chờ ứng viên lựa chọn một trong ba mốc thời gian đã đề xuất.
      </p>
    </article>
  );
}

function ProposalLocation({ location }) {
  const isLink = /^https?:\/\//i.test(location);
  return <p><MapPin aria-hidden="true" />{isLink ? <a href={location} target="_blank" rel="noreferrer">{location}</a> : location}</p>;
}

function CandidateHeading({ name, job }) {
  return (
    <div className="recruiter-interview-person">
      <span aria-hidden="true">{initials(name)}</span>
      <div><h2>{name || "Ứng viên"}</h2><p>{job || "Vị trí tuyển dụng"}</p></div>
    </div>
  );
}

function InterviewCard({ interview, updating, onStatusChange }) {
  const locationIsLink = /^https?:\/\//i.test(interview.location || "");
  return (
    <article className="recruiter-interview-card" data-testid={`interview-${interview.id}`}>
      <header>
        <CandidateHeading name={interview.candidate_name} job={interview.job_title} />
        <span className={`recruiter-interview-status ${interview.status}`}>
          {INTERVIEW_STATUS_LABELS[interview.status] || interview.status}
        </span>
      </header>
      <div className="recruiter-interview-details">
        {interview.scheduled_at && <p><CalendarDays aria-hidden="true" /><time dateTime={interview.scheduled_at}>{formatDateTime(interview.scheduled_at)}</time></p>}
        {interview.mode && <p><Video aria-hidden="true" /><span>Hình thức: {interview.mode === "online" ? "Trực tuyến" : "Trực tiếp"}</span></p>}
        {interview.duration_minutes != null && <p><Clock3 aria-hidden="true" /><span>Thời lượng: {interview.duration_minutes} phút</span></p>}
        {interview.location && (
          <p><MapPin aria-hidden="true" /><span>Địa điểm: {locationIsLink ? <a href={interview.location} target="_blank" rel="noreferrer">{interview.location}</a> : interview.location}</span></p>
        )}
        {interview.notes && <p><FileText aria-hidden="true" /><span>Ghi chú: {interview.notes}</span></p>}
      </div>
      {interview.status === "scheduled" && (
        <div className="recruiter-interview-actions">
          <button type="button" className="complete" disabled={Boolean(updating)} onClick={() => onStatusChange(interview.id, "completed")}>
            <CheckCircle2 aria-hidden="true" />
            {updating === "completed" ? "Đang cập nhật..." : "Đánh dấu hoàn tất"}
          </button>
          <button type="button" className="cancel" disabled={Boolean(updating)} onClick={() => onStatusChange(interview.id, "cancelled")}>
            <XCircle aria-hidden="true" />
            {updating === "cancelled" ? "Đang hủy..." : "Hủy lịch"}
          </button>
        </div>
      )}
    </article>
  );
}

function InterviewGuide() {
  const steps = [
    ["Nhà tuyển dụng đề xuất 3 mốc thời gian", "Đề xuất các khung giờ phù hợp."],
    ["Ứng viên chọn thời gian phù hợp", "Ứng viên xem và chọn 1 trong 3 mốc giờ."],
    ["Hệ thống xác nhận lịch phỏng vấn", "Lịch được tạo tự động sau khi ứng viên chọn."],
    ["Hai bên cùng theo dõi lịch", "Lịch đã xác nhận hiển thị cho cả hai vai trò."],
  ];
  return (
    <aside className="recruiter-interview-aside">
      <section className="recruiter-interview-guide">
        <header><span aria-hidden="true"><ListChecks /></span><div><h2>Quy trình đặt lịch</h2><p>Bốn bước để xếp lịch phỏng vấn.</p></div></header>
        <ol>
          {steps.map(([title, text], index) => (
            <li key={title}><span>{index + 1}</span><div><strong>{title}</strong><p>{text}</p></div></li>
          ))}
        </ol>
      </section>
      <section className="recruiter-interview-tips">
        <header><span aria-hidden="true"><Sparkles /></span><div><h2>Mẹo</h2><p>Một số gợi ý đặt lịch hiệu quả.</p></div></header>
        <ul>
          <li><CheckCircle2 aria-hidden="true" /><span><strong>Đề xuất các mốc giờ linh hoạt</strong>Giúp ứng viên dễ sắp xếp thời gian.</span></li>
          <li><CheckCircle2 aria-hidden="true" /><span><strong>Chọn khung giờ làm việc</strong>Ưu tiên các khung giờ trong giờ hành chính.</span></li>
          <li><CheckCircle2 aria-hidden="true" /><span><strong>Xác nhận sớm</strong>Theo dõi thông báo khi ứng viên đã chọn.</span></li>
        </ul>
      </section>
    </aside>
  );
}

function interviewOptionParts(value, durationMinutes) {
  const start = new Date(value);
  const end = new Date(start.getTime() + Number(durationMinutes || 0) * 60000);
  const date = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(start);
  const formatter = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return { date, range: `${formatter.format(start)} – ${formatter.format(end)}` };
}

function initials(name = "") {
  return name.trim().split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join("").toUpperCase() || "UV";
}
