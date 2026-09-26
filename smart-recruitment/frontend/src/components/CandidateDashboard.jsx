import React, { useEffect, useState } from "react";
import api from "../api.js";
import { Card, StatusBadge, ScoreBar, EmptyState, Alert, Spinner } from "./Common.jsx";

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

  function load() {
    api.myResumes().then(setResumes).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function onUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setError("File vượt quá giới hạn 8 MB.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.uploadResume(file);
      setMessage("Tải CV thành công! AI đã phân tích kỹ năng và kinh nghiệm.");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div>
      <Card title="Tải lên CV (PDF hoặc DOCX, tối đa 8 MB)">
        <input type="file" accept=".pdf,.docx" onChange={onUpload} disabled={busy} />
        <Alert type="success">{message}</Alert>
        <Alert>{error}</Alert>
      </Card>

      {resumes.length === 0 ? (
        <EmptyState text="Bạn chưa tải lên CV nào." />
      ) : (
        resumes.map((r) => (
          <Card key={r.id} title={r.filename} subtitle={`${r.experience_years} năm kinh nghiệm`}>
            <p>{r.summary}</p>
            <p className="job-meta">
              <strong>Kỹ năng:</strong> {r.skills.join(", ") || "Chưa phát hiện"}
            </p>
            {r.education.length > 0 && (
              <p className="job-meta">
                <strong>Học vấn:</strong> {r.education.join(" · ")}
              </p>
            )}
            {r.projects.length > 0 && (
              <p className="job-meta">
                <strong>Dự án:</strong> {r.projects.join(" · ")}
              </p>
            )}
          </Card>
        ))
      )}
    </div>
  );
}

function MyApplications() {
  const [apps, setApps] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.myApplications().then(setApps).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (apps.length === 0) return <EmptyState text="Bạn chưa ứng tuyển công việc nào." />;

  return (
    <div className="grid grid-2">
      {apps.map((a) => (
        <Card key={a.id} title={a.job_title} subtitle={`Ứng tuyển ngày ${new Date(a.created_at).toLocaleDateString()}`} right={<StatusBadge status={a.status} />}>
          <ScoreBar label="Điểm tổng" value={a.final_score} color="#00b14f" />
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
        </Card>
      ))}
    </div>
  );
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

  if (!loaded) return <Spinner />;
  if (error) return <Alert>{error}</Alert>;
  if (items.length === 0) return <EmptyState text="Chưa có gợi ý — hãy tải CV lên để nhận đề xuất từ AI." />;

  return (
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
  );
}

function MyInterviews() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.myInterviews().then(setItems).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (items.length === 0) return <EmptyState text="Bạn chưa có lịch phỏng vấn nào." />;

  return (
    <div className="grid grid-2">
      {items.map((i) => (
        <Card key={i.id} title={i.job_title} subtitle={new Date(i.scheduled_at).toLocaleString()}>
          <p className="job-meta">
            Hình thức: <strong>{i.mode === "online" ? "Trực tuyến" : "Trực tiếp"}</strong> · {i.duration_minutes} phút
          </p>
          <p className="job-meta">Địa điểm/Link: {i.location || "Chưa cập nhật"}</p>
          {i.notes && <p className="job-meta">{i.notes}</p>}
          <span className={`badge status-${i.status === "completed" ? "hired" : i.status === "cancelled" ? "rejected" : "interview"}`}>
            {i.status}
          </span>
        </Card>
      ))}
    </div>
  );
}
