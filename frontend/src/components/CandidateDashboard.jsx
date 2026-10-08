import React, { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Building2,
  Briefcase,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Code2,
  Copy,
  ExternalLink,
  FileText,
  GraduationCap,
  Info,
  Lightbulb,
  List,
  MapPin,
  Monitor,
  Send,
  Sparkles,
  UploadCloud,
  Users,
  Video,
  X,
} from "lucide-react";
import api from "../api.js";
import { Card, EmptyState, Alert, Spinner } from "./Common.jsx";
import CandidateHero from "./CandidateHero.jsx";
import { Link } from "../navigation.jsx";

const EMPTY_STATS = {
  total_applications: 0,
  by_status: {},
  average_match_score: 0,
  resumes_uploaded: 0,
};

const TAB_COMPONENTS = {
  jobs: JobSearch,
  resume: ResumeManager,
  applications: MyApplications,
  recommendations: Recommendations,
  interviews: MyInterviews,
};

export default function CandidateDashboard({ user, activeTab = "overview", onTabChange = () => {} }) {
  const ActiveTab = TAB_COMPONENTS[activeTab];

  return (
    <div className="candidate-dashboard">
      {activeTab === "overview" || !ActiveTab ? (
        <CandidateOverview user={user} onNavigate={onTabChange} />
      ) : (
        <section className="candidate-section">
          <ActiveTab />
        </section>
      )}
    </div>
  );
}

function CandidateOverview({ user, onNavigate }) {
  const [state, setState] = useState({
    loading: true,
    stats: EMPTY_STATS,
    interviews: [],
    recommendations: [],
    errors: {},
  });

  useEffect(() => {
    let alive = true;

    async function loadOverview() {
      const [statsResult, interviewsResult, recommendationsResult] = await Promise.allSettled([
        api.candidateStats(),
        api.myInterviews(),
        api.recommendations(3),
      ]);

      if (!alive) return;

      const errors = {};
      const stats = readResult(statsResult, EMPTY_STATS, errors, "stats");
      const interviews = readResult(interviewsResult, [], errors, "interviews");

      let recommendations = [];
      if (recommendationsResult.status === "fulfilled") {
        recommendations = recommendationsResult.value || [];
      } else {
        const message = recommendationsResult.reason?.message || "Không tải được gợi ý việc làm.";
        if (!/upload|cv|resume/i.test(message)) errors.recommendations = message;
      }

      setState({ loading: false, stats: stats || EMPTY_STATS, interviews, recommendations, errors });
    }

    loadOverview();
    return () => {
      alive = false;
    };
  }, []);

  const upcomingInterviews = getUpcomingInterviews(state.interviews);

  return (
    <>
      <HeroSection user={user} onNavigate={onNavigate} />

      {state.loading ? (
        <div className="overview-loading">
          <Spinner />
        </div>
      ) : (
        <>
          {state.errors.stats && <Alert>Không tải được thống kê: {state.errors.stats}</Alert>}
          <StatCards stats={state.stats} interviewCount={upcomingInterviews.length} />
          <div className="overview-columns">
            <ApplicationStatusCard stats={state.stats} onNavigate={onNavigate} />
            <UpcomingInterviewCard interview={upcomingInterviews[0]} error={state.errors.interviews} onNavigate={onNavigate} />
            <RecommendedJobsCard items={state.recommendations} error={state.errors.recommendations} onNavigate={onNavigate} />
          </div>
        </>
      )}
    </>
  );
}

function readResult(result, fallback, errors, key) {
  if (result.status === "fulfilled") return result.value ?? fallback;
  errors[key] = result.reason?.message || "Không tải được dữ liệu.";
  return fallback;
}

function HeroSection({ user, onNavigate }) {
  return (
    <section className="candidate-hero">
      <div className="hero-copy">
        <h1>
          Chào mừng trở lại, <span>{user.full_name}</span> 👋
        </h1>
        <p>Tiếp tục hành trình tìm kiếm cơ hội phù hợp với năng lực và mục tiêu của bạn cùng Smart Recruitment AI.</p>
        <div className="hero-actions">
          <button className="btn-primary btn-with-icon" onClick={() => onNavigate("jobs")}>
            <span aria-hidden="true">⌕</span>
            Tìm việc ngay
          </button>
          <button className="btn-ghost btn-with-icon" onClick={() => onNavigate("resume")}>
            <span aria-hidden="true">▤</span>
            Cập nhật CV
          </button>
        </div>
      </div>
      <div className="hero-illustration" aria-hidden="true">
        <div className="hero-note note-left">
          <span>▣</span>
          Cơ hội phù hợp đang chờ bạn
        </div>
        <div className="hero-person">
          <div className="person-head" />
          <div className="person-body" />
          <div className="person-laptop" />
        </div>
        <div className="hero-note note-right">
          <span>✓</span>
          Tìm việc thông minh
          <span>✓</span>
          Hồ sơ nổi bật hơn
          <span>✓</span>
          Kết nối đúng cơ hội
        </div>
      </div>
    </section>
  );
}

function StatCards({ stats, interviewCount }) {
  const cards = [
    {
      title: "Tổng đơn ứng tuyển",
      value: number(stats.total_applications),
      hint: "Đã ứng tuyển vào các vị trí",
      tone: "green",
      icon: "✈",
    },
    {
      title: "Điểm phù hợp trung bình",
      value: formatPercent(stats.average_match_score),
      hint: "Dựa trên phân tích AI",
      tone: "mint",
      icon: "▮",
    },
    {
      title: "CV đã tải lên",
      value: number(stats.resumes_uploaded),
      hint: "Hồ sơ của bạn",
      tone: "blue",
      icon: "▤",
    },
    {
      title: "Phỏng vấn",
      value: interviewCount,
      hint: "Lịch phỏng vấn sắp tới",
      tone: "purple",
      icon: "▣",
    },
  ];

  return (
    <section className="stat-grid">
      {cards.map((card) => (
        <article key={card.title} className="stat-card">
          <div className={`stat-icon ${card.tone}`}>{card.icon}</div>
          <div>
            <h3>{card.title}</h3>
            <strong>{card.value}</strong>
            <p>{card.hint}</p>
          </div>
        </article>
      ))}
    </section>
  );
}

function ApplicationStatusCard({ stats, onNavigate }) {
  const total = number(stats.total_applications);
  const byStatus = stats.by_status || {};
  const rows = [
    { label: "Tổng số đơn", count: total, tone: "neutral" },
    { label: "Đang xét duyệt", count: number(byStatus.applied) + number(byStatus.screening), tone: "blue" },
    { label: "Phỏng vấn", count: number(byStatus.interview), tone: "green" },
    { label: "Đã từ chối", count: number(byStatus.rejected), tone: "red" },
  ];

  return (
    <section className="overview-panel">
      <PanelHeader title="Trạng thái đơn ứng tuyển" action="Xem tất cả" onClick={() => onNavigate("applications")} />
      <div className="status-list">
        {rows.map((row) => (
          <div key={row.label} className={`overview-status-row ${row.tone}`}>
            <span className="status-dot" />
            <span>{row.label}</span>
            <strong>{row.count}</strong>
            {row.count > 0 && total > 0 && row.label !== "Tổng số đơn" && (
              <div className="status-progress">
                <span style={{ width: `${Math.min(100, (row.count / total) * 100)}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function UpcomingInterviewCard({ interview, error, onNavigate }) {
  const hasLink = isUrl(interview?.location);

  return (
    <section className="overview-panel">
      <PanelHeader title="Phỏng vấn sắp tới" action="Xem tất cả" onClick={() => onNavigate("interviews")} />
      {error && <Alert>{error}</Alert>}
      {!interview ? (
        <EmptyState text="Bạn chưa có lịch phỏng vấn sắp tới." />
      ) : (
        <div className="interview-card">
          <div className="interview-tags">
            <span className="pill green">Sắp diễn ra</span>
            <span className="pill blue">{interview.mode === "online" ? "Trực tuyến" : "Trực tiếp"}</span>
          </div>
          <h3>{interview.job_title || "Buổi phỏng vấn"}</h3>
          <p>{interview.candidate_name || "Smart Recruitment AI"}</p>
          <dl className="interview-meta">
            <div>
              <dt>Ngày</dt>
              <dd>{formatDate(interview.scheduled_at)}</dd>
            </div>
            <div>
              <dt>Thời gian</dt>
              <dd>{formatTimeRange(interview)}</dd>
            </div>
            <div>
              <dt>Địa điểm</dt>
              <dd>{interview.location || "Chưa cập nhật"}</dd>
            </div>
          </dl>
          {interview.notes && <p className="interview-note">{interview.notes}</p>}
          <div className="panel-actions">
            {hasLink ? (
              <a className="btn-primary btn-link" href={interview.location} target="_blank" rel="noreferrer">
                Tham gia phỏng vấn
              </a>
            ) : (
              <button className="btn-primary" disabled>
                Tham gia phỏng vấn
              </button>
            )}
            <a className="btn-ghost btn-link" href={calendarUrl(interview)} target="_blank" rel="noreferrer">
              Thêm vào lịch
            </a>
          </div>
        </div>
      )}
    </section>
  );
}

function RecommendedJobsCard({ items, error, onNavigate }) {
  return (
    <section className="overview-panel">
      <PanelHeader title="Việc làm đề xuất cho bạn" action="Xem thêm" onClick={() => onNavigate("recommendations")} />
      {error && <Alert>{error}</Alert>}
      {items.length === 0 ? (
        <EmptyState text="Chưa có gợi ý phù hợp. Hãy tải CV lên để nhận đề xuất từ AI." />
      ) : (
        <div className="recommended-list">
          {items.map((item) => {
            const job = item.job || {};
            return (
              <button key={job.id || job.title} className="recommended-job" type="button" onClick={() => onNavigate("recommendations")}>
                <span className="job-icon">▥</span>
                <span className="job-summary">
                  <span className="job-title-line">
                    <strong>{job.title || "Công việc phù hợp"}</strong>
                    <em>{formatPercent(item.final_score)} phù hợp</em>
                  </span>
                  <span className="job-company">
                    {job.company_name || "Chưa cập nhật"} · {job.location || "Remote"}
                  </span>
                  <span className="skill-tags">
                    {splitSkills(job.skills)
                      .slice(0, 5)
                      .map((skill) => (
                        <span key={skill}>{skill}</span>
                      ))}
                  </span>
                  <span className="job-foot">
                    {job.employment_type || "Toàn thời gian"} · {job.location || "Remote"}
                  </span>
                </span>
                <span className="chevron">›</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PanelHeader({ title, action, onClick }) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      <button type="button" onClick={onClick}>
        {action} →
      </button>
    </div>
  );
}

function getUpcomingInterviews(items) {
  const now = Date.now();
  return (items || [])
    .filter((item) => item.status !== "cancelled" && new Date(item.scheduled_at).getTime() >= now)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
}

function number(value) {
  return Number(value) || 0;
}

function formatPercent(value) {
  return `${number(value).toFixed(2).replace(/\.?0+$/, "")}%`;
}

function splitSkills(skills = "") {
  return skills
    .split(/[,;]+/)
    .map((skill) => skill.trim())
    .filter(Boolean);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa cập nhật";
  return date.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTimeRange(interview) {
  const start = new Date(interview.scheduled_at);
  if (Number.isNaN(start.getTime())) return "Chưa cập nhật";
  const end = new Date(start.getTime() + number(interview.duration_minutes || 45) * 60000);
  return `${start.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  })} (${interview.duration_minutes || 45} phút)`;
}

function isUrl(value = "") {
  return /^https?:\/\//i.test(value);
}

function calendarUrl(interview) {
  const start = new Date(interview.scheduled_at);
  if (Number.isNaN(start.getTime())) return "#";
  const end = new Date(start.getTime() + number(interview.duration_minutes || 45) * 60000);
  const format = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: interview.job_title || "Phỏng vấn",
    dates: `${format(start)}/${format(end)}`,
    details: interview.notes || "",
    location: interview.location || "",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function JobSearch() {
  const [q, setQ] = useState("");
  const [location, setLocation] = useState("");
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState(null);

  async function search() {
    setError("");
    try {
      const data = await api.listJobs({ q, location, status: "open" });
      setJobs(data);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function apply(jobId) {
    setBusyId(jobId);
    setMessage("");
    setError("");
    try {
      const res = await api.applyToJob(jobId);
      setMessage(`Ứng tuyển thành công! Điểm phù hợp AI: ${res.match.final_score}%`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="search-bar">
        <input placeholder="Từ khóa, kỹ năng, chức danh..." value={q} onChange={(e) => setQ(e.target.value)} />
        <input placeholder="Địa điểm" value={location} onChange={(e) => setLocation(e.target.value)} />
        <button className="btn-primary" onClick={search}>
          Tìm kiếm
        </button>
      </div>
      <Alert type="success">{message}</Alert>
      <Alert>{error}</Alert>
      {jobs.length === 0 ? (
        <EmptyState text="Không tìm thấy công việc phù hợp." />
      ) : (
        <div className="grid grid-2">
          {jobs.map((job) => (
            <Card
              key={job.id}
              title={job.title}
              subtitle={`${job.company_name || "—"} · ${job.location} · ${job.employment_type}`}
              right={
                <button className="btn-primary" disabled={busyId === job.id} onClick={() => apply(job.id)}>
                  {busyId === job.id ? "Đang gửi..." : "Ứng tuyển"}
                </button>
              }
            >
              <p className="job-desc">{job.description}</p>
              <p className="job-meta">
                Kỹ năng yêu cầu: <strong>{job.skills || "Chưa liệt kê"}</strong>
              </p>
              <p className="job-meta">
                Kinh nghiệm tối thiểu: <strong>{job.min_experience} năm</strong> · Lương: {job.salary_range || "Thỏa thuận"}
              </p>
              <p className="job-meta">{job.applicants_count} ứng viên đã ứng tuyển</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ResumeManager() {
  const [resumes, setResumes] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  function load() {
    setLoading(true);
    api
      .myResumes()
      .then((data) => {
        setResumes(data || []);
        setError("");
      })
      .catch((e) => setError(e.message || "Không tải được dữ liệu CV."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function upload(file) {
    if (!file) return;
    setError("");
    setMessage("");
    if (!isResumeFile(file)) {
      setError("Vui lòng chọn file PDF hoặc DOCX.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("File vượt quá giới hạn 8 MB.");
      return;
    }
    setBusy(true);
    try {
      await api.uploadResume(file);
      setMessage("Tải CV thành công. AI đã phân tích kỹ năng và kinh nghiệm.");
      load();
    } catch (err) {
      setError(friendlyUploadError(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onUpload(e) {
    upload(e.target.files[0]);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (!busy) upload(e.dataTransfer.files[0]);
  }

  const current = resumes[0];
  const skills = Array.isArray(current?.skills) ? current.skills.filter(Boolean) : [];
  const education = Array.isArray(current?.education) ? current.education.filter(Boolean) : [];
  const projects = Array.isArray(current?.projects) ? current.projects.filter(Boolean) : [];
  const experience = Number(current?.experience_years || 0);
  const lastUpdated = current?.updated_at || current?.created_at;

  return (
    <div className="resume-page">
      <CandidateHero title="CV của tôi" description="Quản lý CV và để AI phân tích hồ sơ của bạn.">
          <div className="candidate-hero-badge top">
            <UploadCloud size={20} />
            <span>Tải CV lên để AI phân tích</span>
          </div>
          <div className="candidate-hero-badge side">
            <CheckCircle2 size={17} />
            <span>Phân tích kỹ năng</span>
            <CheckCircle2 size={17} />
            <span>Gợi ý việc phù hợp</span>
          </div>
      </CandidateHero>

      <div className="resume-layout">
        <section className="resume-card resume-upload-card">
          <div
            className={`resume-dropzone ${dragging ? "is-dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <span className="resume-upload-icon">
              <UploadCloud size={34} aria-hidden="true" />
            </span>
            <h2>Tải CV lên để AI phân tích</h2>
            <p>Hỗ trợ định dạng PDF hoặc DOCX</p>
            <input ref={inputRef} type="file" accept=".pdf,.docx" onChange={onUpload} disabled={busy} hidden />
            <button className="btn-primary btn-with-icon" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
              <FileText size={18} aria-hidden="true" />
              {busy ? "Đang tải..." : "Chọn CV"}
            </button>
            <small>Hoặc kéo thả file CV vào đây</small>
          </div>
          <Alert type="success">{message}</Alert>
          <Alert>{error}</Alert>
          <div className="resume-info-bar">
            <Info size={17} aria-hidden="true" />
            <span>CV mới nhất bạn tải lên sẽ được sử dụng khi ứng tuyển.</span>
          </div>
        </section>

        <aside className="resume-card resume-overview-card">
          <div className="resume-card-title">
            <span className="resume-section-icon">
              <BarChart3 size={22} aria-hidden="true" />
            </span>
            <h2>Tổng quan từ CV</h2>
          </div>
          <div className="resume-metric-grid">
            <div className="resume-metric">
              <FileText size={22} aria-hidden="true" />
              <span>Số kỹ năng</span>
              <strong>{current ? skills.length : "--"}</strong>
            </div>
            <div className="resume-metric purple">
              <Briefcase size={22} aria-hidden="true" />
              <span>Kinh nghiệm</span>
              <strong>{current && experience > 0 ? `${formatNumber(experience)} năm` : "--"}</strong>
            </div>
          </div>
          <div className="resume-tip">
            <Lightbulb size={23} aria-hidden="true" />
            <div>
              <h3>Mẹo để có CV tốt hơn</h3>
              <p>Hãy cập nhật CV thường xuyên để AI có thể phân tích chính xác và gợi ý những cơ hội phù hợp nhất cho bạn.</p>
            </div>
          </div>
        </aside>
      </div>

      {loading ? (
        <Spinner />
      ) : !current ? (
        <div className="resume-empty-panel">
          <Sparkles size={22} aria-hidden="true" />
          <span>Bạn chưa tải lên CV nào. Hãy chọn file PDF hoặc DOCX để AI phân tích hồ sơ.</span>
        </div>
      ) : (
        <section className="resume-card resume-current-card">
          <header className="resume-current-header">
            <div className="resume-file-heading">
              <span className={`resume-file-icon ${fileKind(current.filename)}`}>
                <FileText size={24} aria-hidden="true" />
              </span>
              <div>
                <h2>{current.filename}</h2>
                <span className="resume-active-badge">
                  <CheckCircle2 size={15} aria-hidden="true" />
                  CV đang sử dụng
                </span>
              </div>
            </div>
            <p>{lastUpdated ? `Cập nhật lần cuối: ${formatDate(lastUpdated)}` : "Cập nhật lần cuối: --"}</p>
          </header>

          <div className="resume-analysis-strip">
            <Sparkles size={20} aria-hidden="true" />
            <span>CV phân tích tự động: {skills.length} kỹ năng, {formatNumber(experience)} năm kinh nghiệm.</span>
          </div>

          <div className="resume-details-grid">
            <section className="resume-detail-block">
              <div className="resume-detail-title">
                <Code2 size={21} aria-hidden="true" />
                <h3>Kỹ năng</h3>
              </div>
              {skills.length ? (
                <div className="resume-skill-list">
                  {skills.map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))}
                </div>
              ) : (
                <p>Chưa phát hiện kỹ năng từ CV.</p>
              )}
            </section>

            <section className="resume-detail-block">
              <div className="resume-detail-title">
                <Briefcase size={21} aria-hidden="true" />
                <h3>Kinh nghiệm làm việc</h3>
              </div>
              <p>{experience > 0 ? `${formatNumber(experience)} năm kinh nghiệm` : "Chưa xác định được kinh nghiệm."}</p>
            </section>

            <section className="resume-detail-block">
              <div className="resume-detail-title">
                <GraduationCap size={21} aria-hidden="true" />
                <h3>Học vấn</h3>
              </div>
              {education.length ? education.map((item) => <p key={item}>{item}</p>) : <p>Chưa xác định được học vấn.</p>}
            </section>

            <section className="resume-detail-block">
              <div className="resume-detail-title">
                <FileText size={21} aria-hidden="true" />
                <h3>Dự án</h3>
              </div>
              {projects.length ? projects.map((item) => <p key={item}>{item}</p>) : <p>Chưa phát hiện thông tin dự án.</p>}
            </section>
          </div>
        </section>
      )}
    </div>
  );
}

function isResumeFile(file) {
  return /\.(pdf|docx)$/i.test(file?.name || "");
}

function friendlyUploadError(err) {
  const message = err?.message || "";
  if (err?.status === 413 || /too large|maximum size|8 mb/i.test(message)) return "File vượt quá giới hạn 8 MB.";
  if (/pdf|docx|supported/i.test(message)) return "Vui lòng chọn file PDF hoặc DOCX.";
  return message || "Không thể tải CV. Vui lòng thử lại.";
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
}

function fileKind(filename = "") {
  return filename.toLowerCase().endsWith(".pdf") ? "pdf" : "docx";
}

function MyApplications() {
  const [state, setState] = useState({ loading: true, apps: [], jobs: {}, interviews: [], histories: {} });
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let alive = true;

    async function loadApplications() {
      try {
        const apps = await api.myApplications();
        const [jobsResult, interviewsResult, historiesResult] = await Promise.allSettled([
          Promise.all((apps || []).map((app) => api.getJob(app.job_id).catch(() => null))),
          api.myInterviews(),
          Promise.all(
            (apps || []).map(async (app) => [app.id, await api.applicationStatusHistory(app.id).catch(() => [])])
          ),
        ]);
        if (!alive) return;

        const jobs = {};
        if (jobsResult.status === "fulfilled") {
          jobsResult.value.filter(Boolean).forEach((job) => {
            jobs[job.id] = job;
          });
        }
        setState({
          loading: false,
          apps: apps || [],
          jobs,
          interviews: interviewsResult.status === "fulfilled" ? interviewsResult.value || [] : [],
          histories: historiesResult.status === "fulfilled" ? Object.fromEntries(historiesResult.value) : {},
        });
      } catch (e) {
        if (!alive) return;
        setError(e.message || "Không tải được đơn ứng tuyển.");
        setState((current) => ({ ...current, loading: false }));
      }
    }

    loadApplications();
    return () => {
      alive = false;
    };
  }, []);

  const counts = applicationFilterCounts(state.apps);
  const filters = APPLICATION_FILTERS.map((item) => ({ ...item, count: counts[item.key] || 0 }));
  const visibleApps = state.apps.filter((app) => applicationFilterMatch(app.status, filter));
  const interviewsByApplication = Object.fromEntries(
    state.interviews.filter((item) => item.status !== "cancelled").map((item) => [item.application_id, item])
  );

  if (state.loading) return <Spinner />;
  if (error) return <Alert>{error}</Alert>;

  return (
    <div className="applications-page">
      <CandidateHero
        title="Đơn ứng tuyển của tôi"
        description="Theo dõi trạng thái các đơn ứng tuyển và xem chi tiết quá trình tuyển dụng."
      />

      <div className="application-filters" role="tablist" aria-label="Lọc đơn ứng tuyển">
        {filters.map(({ key, label, count, icon: Icon }) => (
          <button
            key={key}
            type="button"
            className={filter === key ? "is-active" : ""}
            onClick={() => setFilter(key)}
            aria-selected={filter === key}
            role="tab"
          >
            <Icon size={18} aria-hidden="true" />
            {label} ({count})
          </button>
        ))}
      </div>

      {state.apps.length === 0 ? (
        <section className="application-empty-card">
          <Send size={28} aria-hidden="true" />
          <h2>Bạn chưa có đơn ứng tuyển nào.</h2>
          <p>Khám phá các công việc phù hợp và bắt đầu ứng tuyển.</p>
          <Link className="btn-primary btn-with-icon" href="/jobs">
            <MapPin size={17} aria-hidden="true" />
            Tìm việc ngay
          </Link>
        </section>
      ) : visibleApps.length === 0 ? (
        <section className="application-empty-card">
          <Info size={26} aria-hidden="true" />
          <h2>Không có đơn ứng tuyển trong bộ lọc này.</h2>
          <p>Chọn trạng thái khác để xem các đơn ứng tuyển còn lại.</p>
        </section>
      ) : (
        <div className="application-list">
          {visibleApps.map((app) => (
            <ApplicationCard
              key={app.id}
              application={app}
              job={state.jobs[app.job_id]}
              interview={interviewsByApplication[app.id]}
              history={state.histories[app.id] || []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const APPLICATION_FILTERS = [
  { key: "all", label: "Tất cả", icon: List },
  { key: "processing", label: "Đang xử lý", icon: Clock3 },
  { key: "interview", label: "Phỏng vấn", icon: Users },
  { key: "offer", label: "Offer", icon: FileText },
  { key: "rejected", label: "Không phù hợp", icon: X },
];

const APPLICATION_STATUS_LABELS = {
  applied: "Đang xử lý",
  screening: "Đang xử lý",
  interview: "Phỏng vấn",
  offer: "Offer",
  hired: "Đã tuyển",
  rejected: "Không phù hợp",
};

const APPLICATION_STAGES = [
  { key: "applied", label: "Đã ứng tuyển", icon: Check },
  { key: "screening", label: "Sàng lọc", icon: Check },
  { key: "interview", label: "Phỏng vấn", icon: Users },
  { key: "offer", label: "Offer", icon: FileText },
  { key: "result", label: "Kết quả", icon: Check },
];

function ApplicationCard({ application, job, interview, history }) {
  const status = application.status || "applied";
  const company = job?.company_name || "Nhà tuyển dụng";
  const location = job?.location || "Chưa cập nhật";
  const employmentType = job?.employment_type || "Chưa cập nhật";
  const hasInterview = status === "interview" && interview;

  return (
    <article className={`application-card application-status-${status}`}>
      <header className="application-card-header">
        <div className="application-heading">
          <span className="application-company-icon">
            <Building2 size={30} aria-hidden="true" />
          </span>
          <div>
            <h2>{application.job_title || job?.title || "Công việc"}</h2>
            <p>{company}</p>
            <div className="application-meta">
              <span>
                <CalendarDays size={17} aria-hidden="true" />
                Ứng tuyển ngày {shortDate(application.created_at)}
              </span>
              <span>
                <MapPin size={17} aria-hidden="true" />
                {location}
              </span>
              <span>
                <Briefcase size={17} aria-hidden="true" />
                {employmentType}
              </span>
            </div>
          </div>
        </div>
        <div className="application-actions">
          <span className={`application-status-badge ${status}`}>{APPLICATION_STATUS_LABELS[status] || status}</span>
          <div>
            <Link className="btn-ghost btn-with-icon" href={`/jobs/${application.job_id}`}>
              <ExternalLink size={17} aria-hidden="true" />
              Xem chi tiết công việc
            </Link>
            {hasInterview && (
              <Link className="btn-primary btn-with-icon" href="/candidate/interviews">
                <CalendarDays size={17} aria-hidden="true" />
                Xem lịch phỏng vấn
              </Link>
            )}
          </div>
        </div>
      </header>

      <ApplicationTimeline application={application} history={history} />

      <div className="application-panels">
        <section className="application-panel">
          <h3>
            <BarChart3 size={22} aria-hidden="true" />
            Phân tích mức độ phù hợp bởi AI
          </h3>
          <ApplicationScore label="Điểm tổng" value={application.final_score} green />
          <ApplicationScore label="Kỹ năng" value={application.skill_score} />
          <ApplicationScore label="Kinh nghiệm" value={application.experience_score} />
          <ApplicationScore label="Ngữ nghĩa" value={application.semantic_score} pale />
          <ApplicationScore label="Dự án" value={application.project_score} pale />
        </section>

        <section className="application-panel">
          <h3>
            <Sparkles size={22} aria-hidden="true" />
            Nhận xét từ AI
          </h3>
          <div className="application-ai-summary">
            <CheckCircle2 size={22} aria-hidden="true" />
            Phù hợp {formatPercent(application.final_score)}
          </div>
          <p className="application-explanation">{application.explanation || "Chưa có nhận xét từ AI."}</p>
          {application.missing_skills?.length > 0 && (
            <div className="application-missing-skills">
              <strong>Kỹ năng còn thiếu</strong>
              <div>
                {application.missing_skills.map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </article>
  );
}

export function buildApplicationTimeline(application, history = []) {
  const terminalStatus = ["hired", "rejected"].includes(application.status) ? application.status : null;
  const rejectedEvent = history.find((item) => item.new_status === "rejected");
  const visibleStages =
    terminalStatus === "rejected"
      ? APPLICATION_STAGES.filter(
          (stage) =>
            stage.key === "applied" ||
            stage.key === "result" ||
            history.some((item) => item.new_status === stage.key)
        )
      : APPLICATION_STAGES;

  return {
    stages: visibleStages.map((stage) => {
      const status = stage.key === "result" ? terminalStatus : stage.key;
      const event = status ? history.find((item) => item.new_status === status) : null;
      return {
        ...stage,
        date: shortDate(event?.changed_at || (status === "applied" ? application.created_at : null)),
        done: Boolean(event || (status === "applied" && application.created_at)) && status !== application.status,
        current: status === application.status,
        result:
          stage.key === "result" && terminalStatus
            ? terminalStatus === "hired"
              ? "Đã tuyển"
              : "Không phù hợp"
            : null,
        rejected: stage.key === "result" && terminalStatus === "rejected",
      };
    }),
    rejectionReason: terminalStatus === "rejected" ? rejectedEvent?.reason : null,
  };
}

function ApplicationTimeline({ application, history }) {
  const { stages, rejectionReason } = buildApplicationTimeline(application, history);

  return (
    <section className="application-timeline">
      <h3>
        <BarChart3 size={22} aria-hidden="true" />
        Tiến trình ứng tuyển
      </h3>
      <div className="application-stage-row" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
        {stages.map(({ key, label, icon: StageIcon, date, done, current, result, rejected }) => {
          const Icon = rejected ? X : done ? Check : StageIcon;

          return (
            <div key={key} className={`application-stage ${done ? "is-done" : ""} ${current ? "is-current" : ""}`}>
              <span className="application-stage-circle">
                <Icon size={19} aria-hidden="true" />
              </span>
              <strong>{label}</strong>
              {result && <span>{result}</span>}
              <small>{date}</small>
            </div>
          );
        })}
      </div>
      {rejectionReason && <p className="application-reason">Lý do: {rejectionReason}</p>}
    </section>
  );
}

function ApplicationScore({ label, value, green = false, pale = false }) {
  const pct = Math.max(0, Math.min(100, number(value)));
  return (
    <div className="application-score-row">
      <span>{label}</span>
      <div>
        <span className="application-score-track">
          <span className={`${green ? "green" : ""} ${pale ? "pale" : ""}`} style={{ width: `${pct}%` }} />
        </span>
        <strong>{formatPercent(value)}</strong>
      </div>
    </div>
  );
}

function applicationFilterCounts(apps) {
  return apps.reduce(
    (counts, app) => {
      counts.all += 1;
      if (["applied", "screening"].includes(app.status)) counts.processing += 1;
      if (app.status === "interview") counts.interview += 1;
      if (app.status === "offer") counts.offer += 1;
      if (app.status === "rejected") counts.rejected += 1;
      return counts;
    },
    { all: 0, processing: 0, interview: 0, offer: 0, rejected: 0 }
  );
}

function applicationFilterMatch(status, filter) {
  if (filter === "all") return true;
  if (filter === "processing") return ["applied", "screening"].includes(status);
  return status === filter;
}

function shortDate(value) {
  if (!value) return "Chưa có thông tin";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có thông tin";
  return date.toLocaleDateString("vi-VN");
}

function Recommendations() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .recommendations(6)
      .then((d) => {
        setItems(d);
        setLoaded(true);
      })
      .catch((e) => {
        setError(e.message);
        setLoaded(true);
      });
  }, []);

  return (
    <div className="recommendations-page">
      <CandidateHero
        title="Gợi ý AI"
        description="Khám phá các công việc phù hợp dựa trên CV, kỹ năng và kinh nghiệm của bạn."
      />

      {!loaded ? (
        <Spinner />
      ) : error ? (
        <Alert>{error}</Alert>
      ) : items.length === 0 ? (
        <EmptyState text="Chưa có gợi ý — hãy tải CV lên để nhận đề xuất từ AI." />
      ) : (
        <div className="grid grid-2">
          {items.map((item) => (
            <Card
              key={item.job.id}
              title={item.job.title}
              subtitle={`${item.job.company_name || "—"} · ${item.job.location}`}
              right={<span className="badge score-badge">{formatPercent(item.final_score)} phù hợp</span>}
            >
              <p className="job-desc">{item.job.description}</p>
              {item.missing_skills.length > 0 && (
                <p className="job-meta missing-skills">
                  <strong>Kỹ năng còn thiếu:</strong> {item.missing_skills.join(", ")}
                </p>
              )}
              <p className="job-meta explanation">{item.explanation}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MyInterviews() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("scheduled");
  const [copiedId, setCopiedId] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .myInterviews()
      .then((data) => {
        setItems(data || []);
        setLoaded(true);
      })
      .catch((e) => {
        setError(e.message || "Không tải được lịch phỏng vấn.");
        setLoaded(true);
      });
  }, []);

  async function copyLink(interview) {
    if (!isUrl(interview.location)) return;
    try {
      await navigator.clipboard.writeText(interview.location);
      setCopiedId(interview.id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setError("Không thể sao chép link. Vui lòng copy thủ công.");
    }
  }

  const counts = interviewCounts(items);
  const visible = sortInterviews(items.filter((item) => item.status === filter), filter);

  if (!loaded) return <Spinner />;
  if (error) return <Alert>{error}</Alert>;

  return (
    <div className="interviews-page">
      <CandidateHero
        title="Lịch phỏng vấn"
        description="Theo dõi và quản lý lịch phỏng vấn của bạn. Đừng bỏ lỡ cơ hội để tiến gần hơn đến công việc mơ ước!"
      >
        <div className="candidate-hero-checklist">
          {["Chuẩn bị kỹ càng", "Tham gia đúng giờ", "Tạo ấn tượng tốt"].map((text) => (
            <span key={text}>
              <CheckCircle2 size={18} />
              {text}
            </span>
          ))}
        </div>
      </CandidateHero>

      <div className="interview-filters" role="tablist" aria-label="Lọc lịch phỏng vấn">
        {INTERVIEW_FILTERS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            className={filter === key ? "is-active" : ""}
            onClick={() => setFilter(key)}
            aria-selected={filter === key}
            role="tab"
          >
            <Icon size={18} aria-hidden="true" />
            {label} ({counts[key] || 0})
          </button>
        ))}
      </div>

      <div className="interviews-layout">
        <main className="interview-list">
          {visible.length === 0 ? (
            <section className="interview-empty-card">
              <CalendarDays size={28} aria-hidden="true" />
              <h2>{INTERVIEW_EMPTY_TEXT[filter].title}</h2>
              <p>{INTERVIEW_EMPTY_TEXT[filter].subtitle}</p>
            </section>
          ) : (
            visible.map((interview) => (
              <InterviewScheduleCard
                key={interview.id}
                interview={interview}
                copied={copiedId === interview.id}
                onCopy={() => copyLink(interview)}
              />
            ))
          )}
        </main>

        <InterviewTips />
      </div>
    </div>
  );
}

const INTERVIEW_FILTERS = [
  { key: "scheduled", label: "Sắp tới", icon: CalendarDays },
  { key: "completed", label: "Đã hoàn thành", icon: CheckCircle2 },
  { key: "cancelled", label: "Đã hủy", icon: X },
];

const INTERVIEW_STATUS_LABELS = {
  scheduled: "Đã lên lịch",
  completed: "Đã hoàn thành",
  cancelled: "Đã hủy",
};

const INTERVIEW_EMPTY_TEXT = {
  scheduled: {
    title: "Bạn chưa có lịch phỏng vấn sắp tới.",
    subtitle: "Các lịch phỏng vấn mới sẽ xuất hiện tại đây.",
  },
  completed: {
    title: "Chưa có buổi phỏng vấn nào hoàn thành.",
    subtitle: "Các buổi đã hoàn thành sẽ được lưu lại tại đây.",
  },
  cancelled: {
    title: "Không có lịch phỏng vấn đã hủy.",
    subtitle: "Những lịch bị hủy sẽ xuất hiện tại đây.",
  },
};

function InterviewScheduleCard({ interview, copied, onCopy }) {
  const date = interviewDateParts(interview.scheduled_at);
  const online = interview.mode === "online";
  const meetingLink = isUrl(interview.location) ? interview.location : "";
  const scheduled = interview.status === "scheduled";

  return (
    <article className={`interview-schedule-card ${interview.status}`}>
      <aside className="interview-date-panel">
        <span>{date.weekday}</span>
        <strong>{date.day}</strong>
        <span>Tháng {date.month}</span>
        <em>{date.year}</em>
      </aside>

      <div className="interview-card-main">
        <header className="interview-card-header">
          <div>
            <h2>{interview.job_title || "Buổi phỏng vấn"}</h2>
            <p>{interview.company_name || "Chưa cập nhật công ty"}</p>
          </div>
          <span className={`interview-status-badge ${interview.status}`}>
            <CalendarDays size={17} aria-hidden="true" />
            {INTERVIEW_STATUS_LABELS[interview.status] || interview.status}
          </span>
        </header>

        <div className="interview-facts">
          <InterviewFact icon={Clock3} title={timeOnly(interview.scheduled_at)} text={durationText(interview)} />
          <InterviewFact icon={online ? Video : MapPin} title={online ? "Trực tuyến" : "Trực tiếp"} text={interview.location || "--"} />
          {interview.notes && <InterviewFact icon={Users} title="Nội dung phỏng vấn" text={interview.notes} />}
        </div>

        <div className="interview-location-box">
          <span className="interview-location-icon">
            {online ? <Video size={30} aria-hidden="true" /> : <MapPin size={30} aria-hidden="true" />}
          </span>
          <div>
            <span>{online ? "Địa điểm / Link họp" : "Địa điểm phỏng vấn"}</span>
            <strong>{interview.location || "--"}</strong>
          </div>
          {online && meetingLink && (
            <button className="btn-ghost btn-with-icon" type="button" onClick={onCopy}>
              <Copy size={18} aria-hidden="true" />
              {copied ? "Đã sao chép" : "Sao chép link"}
            </button>
          )}
        </div>

        <div className="interview-actions">
          {scheduled && online && meetingLink && (
            <a className="btn-primary btn-link" href={meetingLink} target="_blank" rel="noreferrer">
              <Video size={18} aria-hidden="true" />
              Tham gia cuộc họp
            </a>
          )}
          <a className="btn-ghost btn-link" href={calendarUrl(interview)} target="_blank" rel="noreferrer">
            <CalendarDays size={18} aria-hidden="true" />
            Thêm vào lịch
          </a>
        </div>
      </div>
    </article>
  );
}

function InterviewFact({ icon: Icon, title, text }) {
  return (
    <div className="interview-fact">
      <Icon size={26} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
    </div>
  );
}

function InterviewTips() {
  const tips = [
    [FileText, "Ôn tập kiến thức chuyên môn", "Rà soát các kiến thức, dự án liên quan đến vị trí ứng tuyển."],
    [Monitor, "Kiểm tra thiết bị", "Đảm bảo kết nối mạng ổn định, camera và mic hoạt động tốt."],
    [Users, "Tạo ấn tượng chuyên nghiệp", "Ăn mặc lịch sự, tham gia đúng giờ và thể hiện sự tự tin."],
  ];

  return (
    <aside className="interview-tips-card">
      <h2>
        <Lightbulb size={24} aria-hidden="true" />
        Mẹo phỏng vấn
      </h2>
      {tips.map(([Icon, title, text]) => (
        <div className="interview-tip-item" key={title}>
          <span>
            <Icon size={27} aria-hidden="true" />
          </span>
          <div>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        </div>
      ))}
    </aside>
  );
}

function interviewCounts(items) {
  return items.reduce(
    (counts, item) => {
      if (counts[item.status] !== undefined) counts[item.status] += 1;
      return counts;
    },
    { scheduled: 0, completed: 0, cancelled: 0 }
  );
}

function sortInterviews(items, status) {
  return [...items].sort((a, b) => {
    const diff = new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
    return status === "scheduled" ? diff : -diff;
  });
}

function interviewDateParts(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { weekday: "--", day: "--", month: "--", year: "--" };
  return {
    weekday: date.toLocaleDateString("vi-VN", { weekday: "short" }),
    day: date.toLocaleDateString("vi-VN", { day: "2-digit" }),
    month: date.toLocaleDateString("vi-VN", { month: "2-digit" }),
    year: date.toLocaleDateString("vi-VN", { year: "numeric" }),
  };
}

function timeOnly(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function durationText(interview) {
  const start = new Date(interview.scheduled_at);
  const duration = number(interview.duration_minutes || 45);
  if (Number.isNaN(start.getTime())) return `${duration} phút`;
  const end = new Date(start.getTime() + duration * 60000);
  return `${timeOnly(start)} - ${timeOnly(end)} (${duration} phút)`;
}
