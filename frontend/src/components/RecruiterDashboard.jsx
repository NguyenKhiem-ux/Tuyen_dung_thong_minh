import React, { useEffect, useState } from "react";
import { ArrowRight, BriefcaseBusiness, Eye, ListChecks, Sparkles, Users, X, XCircle } from "lucide-react";
import api from "../api.js";
import { Alert, Card, EmptyState, ScoreBar, Spinner, StatusBadge, STATUS_LABELS } from "./Common.jsx";

export default function RecruiterDashboard({ activeTab = "overview" }) {
  return (
    <div className="dashboard recruiter-dashboard" data-active-tab={activeTab}>
      {activeTab !== "overview" && <h2 className="dashboard-title">Bảng điều khiển Nhà tuyển dụng</h2>}
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

  useEffect(() => {
    api
      .myCompany()
      .then((c) => setForm({ name: c.name, description: c.description, website: c.website, location: c.location, industry: c.industry }))
      .catch(() => {});
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
    <Card title="Thông tin công ty">
      <Alert type="success">{message}</Alert>
      <Alert>{error}</Alert>
      <form onSubmit={save} className="stacked-form">
        <label>Tên công ty</label>
        <input required value={form.name} onChange={(e) => update("name", e.target.value)} />
        <label>Mô tả</label>
        <textarea rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} />
        <label>Website</label>
        <input value={form.website} onChange={(e) => update("website", e.target.value)} />
        <label>Địa điểm</label>
        <input value={form.location} onChange={(e) => update("location", e.target.value)} />
        <label>Lĩnh vực</label>
        <input value={form.industry} onChange={(e) => update("industry", e.target.value)} />
        <button className="btn-primary" disabled={busy}>
          {busy ? "Đang lưu..." : "Lưu thông tin"}
        </button>
      </form>
    </Card>
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

  function load() {
    api.myJobs().then(setJobs).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function startEdit(job) {
    setEditingId(job.id);
    setForm({
      title: job.title, description: job.description, skills: job.skills, min_experience: job.min_experience,
      location: job.location, employment_type: job.employment_type, salary_range: job.salary_range,
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyJob);
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
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(job) {
    await api.updateJob(job.id, { status: job.status === "open" ? "closed" : "open" });
    load();
  }

  async function remove(job) {
    if (!confirm(`Xóa tin "${job.title}"?`)) return;
    await api.deleteJob(job.id);
    load();
  }

  return (
    <div>
      <Card title={editingId ? "Chỉnh sửa tin tuyển dụng" : "Đăng tin tuyển dụng mới"}>
        <Alert type="success">{message}</Alert>
        <Alert>{error}</Alert>
        <form onSubmit={submit} className="stacked-form">
          <label>Chức danh</label>
          <input required value={form.title} onChange={(e) => update("title", e.target.value)} />
          <label>Mô tả công việc</label>
          <textarea required rows={4} value={form.description} onChange={(e) => update("description", e.target.value)} />
          <label>Kỹ năng yêu cầu (phân cách bởi dấu phẩy)</label>
          <input placeholder="python, fastapi, sql" value={form.skills} onChange={(e) => update("skills", e.target.value)} />
          <div className="grid grid-2">
            <div>
              <label>Kinh nghiệm tối thiểu (năm)</label>
              <input type="number" step="0.5" min="0" value={form.min_experience} onChange={(e) => update("min_experience", parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label>Địa điểm</label>
              <input value={form.location} onChange={(e) => update("location", e.target.value)} />
            </div>
            <div>
              <label>Hình thức</label>
              <input value={form.employment_type} onChange={(e) => update("employment_type", e.target.value)} />
            </div>
            <div>
              <label>Mức lương</label>
              <input value={form.salary_range} onChange={(e) => update("salary_range", e.target.value)} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn-primary" disabled={busy}>
              {busy ? "Đang lưu..." : editingId ? "Cập nhật" : "Đăng tin"}
            </button>
            {editingId && (
              <button type="button" className="btn-ghost" onClick={resetForm}>
                Hủy
              </button>
            )}
          </div>
        </form>
      </Card>

      {jobs.length === 0 ? (
        <EmptyState text="Bạn chưa đăng tin tuyển dụng nào." />
      ) : (
        <div className="grid grid-2">
          {jobs.map((job) => (
            <Card
              key={job.id}
              title={job.title}
              subtitle={`${job.location} · ${job.applicants_count} ứng viên`}
              right={<span className={`badge ${job.status === "open" ? "status-hired" : "status-rejected"}`}>{job.status === "open" ? "Đang mở" : "Đã đóng"}</span>}
            >
              <p className="job-desc">{job.description}</p>
              <p className="job-meta">Kỹ năng: {job.skills || "Chưa liệt kê"}</p>
              <div className="form-actions">
                <button className="btn-ghost" onClick={() => startEdit(job)}>
                  Sửa
                </button>
                <button className="btn-ghost" onClick={() => toggleStatus(job)}>
                  {job.status === "open" ? "Đóng tin" : "Mở lại"}
                </button>
                <button className="btn-danger" onClick={() => remove(job)}>
                  Xóa
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const PIPELINE_COLUMNS = [
  ["applied", "Đã ứng tuyển"],
  ["screening", "Sàng lọc"],
  ["interview", "Phỏng vấn"],
  ["offer", "Offer"],
  ["hired", "Đã tuyển"],
  ["rejected", "Đã từ chối"],
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

  async function confirmTransition(reason) {
    setUpdating(true);
    setError("");
    try {
      await api.updateApplicationStatus(pending.application.id, pending.status, reason);
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

  const selectedJob = jobs.find((job) => String(job.id) === selectedJobId);

  return (
    <section className="ats-section">
      <div className="ats-header">
        <div>
          <p className="ats-eyebrow">ATS Pipeline</p>
          <h2>Ứng viên & Pipeline tuyển dụng</h2>
          <p>Theo dõi ứng viên theo từng giai đoạn và điểm matching từ backend.</p>
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
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title} ({j.applicants_count} ứng viên)
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
          {selectedJob && <p className="ats-selected-job">{selectedJob.title}</p>}
          {loadingApps ? (
            <Spinner />
          ) : (
            <>
              {apps.length === 0 && <div className="ats-empty-job">Chưa có ứng viên cho tin tuyển dụng này.</div>}
              <div className="ats-board" aria-label="Pipeline tuyển dụng">
                {PIPELINE_COLUMNS.map(([status, label]) => {
                  const candidates = apps
                    .filter((application) => application.status === status)
                    .sort((a, b) => Number(b.final_score || 0) - Number(a.final_score || 0));
                  return (
                    <section className={`ats-column ats-column-${status}`} key={status}>
                      <header>
                        <h3>{label}</h3>
                        <span>{candidates.length}</span>
                      </header>
                      <div className="ats-column-body">
                        {candidates.length === 0 ? (
                          <div className="ats-column-empty">Chưa có ứng viên</div>
                        ) : (
                          candidates.map((application) => (
                            <CandidatePipelineCard
                              key={application.id}
                              application={application}
                              onDetails={() => setDetails(application)}
                              onTransition={(status) => requestTransition(application, status)}
                            />
                          ))
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {pending && (
        <TransitionModal
          key={`${pending.application.id}-${pending.status}`}
          application={pending.application}
          status={pending.status}
          busy={updating}
          error={error}
          onClose={() => !updating && setPending(null)}
          onConfirm={confirmTransition}
        />
      )}
      {details && <CandidateDetailModal application={details} onClose={() => setDetails(null)} />}
    </section>
  );
}

function CandidatePipelineCard({ application, onDetails, onTransition }) {
  const nextStatus = NEXT_STATUS[application.status];
  return (
    <article className="ats-candidate-card">
      <div className="ats-candidate-heading">
        <div>
          <h4>{application.candidate_name}</h4>
          <p>{application.job_title}</p>
        </div>
        <span className="ats-ai-score">{formatScore(application.final_score)}%</span>
      </div>
      <dl className="ats-card-scores">
        <div><dt>Kỹ năng</dt><dd>{formatScore(application.skill_score)}%</dd></div>
        <div><dt>Kinh nghiệm</dt><dd>{formatScore(application.experience_score)}%</dd></div>
      </dl>
      <p className="ats-applied-date">Ứng tuyển: <strong>{formatDate(application.created_at)}</strong></p>
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
  const rejected = status === "rejected";

  function submit(event) {
    event.preventDefault();
    if (rejected && !reason.trim()) return;
    onConfirm(reason);
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
        <label htmlFor="transition-reason">{rejected ? "Lý do từ chối" : "Lý do / ghi chú (không bắt buộc)"}</label>
        <textarea
          id="transition-reason"
          rows={4}
          required={rejected}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={rejected ? "Nhập lý do từ chối ứng viên" : "Thêm ghi chú cho lần chuyển bước này"}
        />
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
          </section>

          <section>
            <h3>Lịch sử tuyển dụng</h3>
            {loading ? <Spinner /> : error ? <Alert>{error}</Alert> : (
              <ol className="ats-history">
                <li>
                  <time>{formatDateTime(application.created_at)}</time>
                  <strong>Đã ứng tuyển</strong>
                </li>
                {history.map((item) => (
                  <li key={item.id}>
                    <time>{formatDateTime(item.changed_at)}</time>
                    <strong>{STATUS_LABELS[item.old_status]} → {STATUS_LABELS[item.new_status]}</strong>
                    <span>Người thực hiện: {item.changed_by_name || `#${item.changed_by}`}</span>
                    {item.reason && <p>{item.reason}</p>}
                  </li>
                ))}
              </ol>
            )}
            <Alert type="success">{message}</Alert>
            <div className="ats-detail-actions">
              {application.status === "interview" && (
                <button className="btn-ghost" type="button" onClick={() => setForm(form === "interview" ? "" : "interview")}>Tạo lịch phỏng vấn</button>
              )}
              <button className="btn-ghost" type="button" onClick={() => setForm(form === "evaluation" ? "" : "evaluation")}>Đánh giá ứng viên</button>
            </div>
            {form === "interview" && <ScheduleInterviewForm applicationId={application.id} onDone={() => { setForm(""); setMessage("Đã tạo lịch phỏng vấn."); }} />}
            {form === "evaluation" && <EvaluateForm applicationId={application.id} onDone={() => { setForm(""); setMessage("Đã lưu đánh giá ứng viên."); }} />}
          </section>
        </div>
      </section>
    </div>
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
  const [error, setError] = useState("");

  function load() {
    api.myInterviews().then(setItems).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function setStatus(id, status) {
    await api.updateInterviewStatus(id, status);
    load();
  }

  if (error) return <Alert>{error}</Alert>;
  if (items.length === 0) return <EmptyState text="Chưa có lịch phỏng vấn nào." />;

  return (
    <div className="grid grid-2">
      {items.map((i) => (
        <Card key={i.id} title={`${i.candidate_name} — ${i.job_title}`} subtitle={new Date(i.scheduled_at).toLocaleString()}>
          <p className="job-meta">
            {i.mode === "online" ? "Trực tuyến" : "Trực tiếp"} · {i.duration_minutes} phút · {i.location || "Chưa cập nhật"}
          </p>
          {i.notes && <p className="job-meta">{i.notes}</p>}
          <div className="form-actions">
            <button className="btn-ghost" onClick={() => setStatus(i.id, "completed")}>
              Đánh dấu hoàn tất
            </button>
            <button className="btn-ghost" onClick={() => setStatus(i.id, "cancelled")}>
              Hủy lịch
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
