import React, { useEffect, useState } from "react";
import api from "../api.js";
import { Card, Tabs, StatusBadge, StatusSelect, ScoreBar, EmptyState, Alert, Spinner } from "./Common.jsx";

export default function RecruiterDashboard() {
  const [tab, setTab] = useState("overview");

  return (
    <div className="dashboard">
      <h2 className="dashboard-title">Bảng điều khiển Nhà tuyển dụng</h2>
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "overview", label: "Thống kê" },
          { key: "company", label: "Công ty" },
          { key: "jobs", label: "Tin tuyển dụng" },
          { key: "applications", label: "Ứng viên & Xếp hạng AI" },
          { key: "interviews", label: "Lịch phỏng vấn" },
        ]}
      />
      {tab === "overview" && <Overview />}
      {tab === "company" && <CompanyProfile />}
      {tab === "jobs" && <JobManager />}
      {tab === "applications" && <ApplicationsRanking />}
      {tab === "interviews" && <InterviewList />}
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

  return (
    <div className="grid grid-4">
      <Card title="Tin tuyển dụng">
        <div className="stat-number">{stats.total_jobs}</div>
        <p className="job-meta">{stats.open_jobs} đang mở</p>
      </Card>
      <Card title="Tổng ứng viên">
        <div className="stat-number">{stats.total_applications}</div>
      </Card>
      <Card title="Điểm phù hợp trung bình">
        <div className="stat-number">{stats.average_match_score}%</div>
      </Card>
      <Card title="Theo trạng thái" className="span-2">
        {Object.keys(stats.by_status).length === 0 && <EmptyState text="Chưa có ứng viên." />}
        {Object.entries(stats.by_status).map(([k, v]) => (
          <div key={k} className="status-row">
            <StatusBadge status={k} /> <span>{v}</span>
          </div>
        ))}
      </Card>
      <Card title="Ứng viên hàng đầu" className="span-2">
        {stats.top_candidates.length === 0 ? (
          <EmptyState text="Chưa có dữ liệu." />
        ) : (
          stats.top_candidates.map((c, idx) => (
            <div key={idx} className="status-row">
              <span>
                {c.candidate_name} — {c.job_title}
              </span>
              <strong>{c.final_score}%</strong>
            </div>
          ))
        )}
      </Card>
    </div>
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

function ApplicationsRanking() {
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [apps, setApps] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [interviewForm, setInterviewForm] = useState(null); // application id being scheduled
  const [evalForm, setEvalForm] = useState(null); // application id being evaluated

  useEffect(() => {
    api.myJobs().then((data) => {
      setJobs(data);
      if (data.length > 0) setSelectedJobId(String(data[0].id));
    });
  }, []);

  useEffect(() => {
    if (!selectedJobId) return;
    loadApps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId]);

  function loadApps() {
    api
      .jobApplications(selectedJobId)
      .then(setApps)
      .catch((e) => setError(e.message));
  }

  async function changeStatus(appId, status) {
    try {
      await api.updateApplicationStatus(appId, status);
      loadApps();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <Card title="Chọn tin tuyển dụng để xem xếp hạng AI">
        <select value={selectedJobId} onChange={(e) => setSelectedJobId(e.target.value)}>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title} ({j.applicants_count} ứng viên)
            </option>
          ))}
        </select>
      </Card>

      <Alert type="success">{message}</Alert>
      <Alert>{error}</Alert>

      {apps.length === 0 ? (
        <EmptyState text="Chưa có ứng viên nào cho tin này." />
      ) : (
        apps.map((a, idx) => (
          <Card
            key={a.id}
            title={`#${idx + 1} ${a.candidate_name}`}
            subtitle={a.candidate_email}
            right={<StatusSelect value={a.status} onChange={(s) => changeStatus(a.id, s)} />}
          >
            <ScoreBar label="Điểm tổng (AI Ranking)" value={a.final_score} color="#22c55e" />
            <ScoreBar label="Kỹ năng" value={a.skill_score} />
            <ScoreBar label="Kinh nghiệm" value={a.experience_score} />
            <ScoreBar label="Ngữ nghĩa" value={a.semantic_score} />
            <ScoreBar label="Dự án" value={a.project_score} />
            {a.missing_skills.length > 0 && (
              <p className="job-meta missing-skills">
                <strong>Kỹ năng còn thiếu:</strong> {a.missing_skills.join(", ")}
              </p>
            )}
            <p className="job-meta explanation">{a.explanation}</p>

            <div className="form-actions">
              <button className="btn-ghost" onClick={() => setInterviewForm(interviewForm === a.id ? null : a.id)}>
                Lên lịch phỏng vấn
              </button>
              <button className="btn-ghost" onClick={() => setEvalForm(evalForm === a.id ? null : a.id)}>
                Đánh giá ứng viên
              </button>
            </div>

            {interviewForm === a.id && (
              <ScheduleInterviewForm
                applicationId={a.id}
                onDone={() => {
                  setInterviewForm(null);
                  setMessage("Đã lên lịch phỏng vấn.");
                  loadApps();
                }}
              />
            )}
            {evalForm === a.id && (
              <EvaluateForm
                applicationId={a.id}
                onDone={() => {
                  setEvalForm(null);
                  setMessage("Đã lưu đánh giá ứng viên.");
                }}
              />
            )}
          </Card>
        ))
      )}
    </div>
  );
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
      setError(err.message);
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
