import React, { useEffect, useId, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  Code2,
  FileText,
  MapPin,
  Search,
  Send,
  Users,
  Wallet,
  RefreshCw,
  X,
} from "lucide-react";
import api from "../api.js";
import { candidateRoutes, Link, loginPath, navigate } from "../navigation.jsx";

export function useJobs(q = "", location = "") {
  const [state, setState] = useState({ jobs: [], loading: true, error: "" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ jobs: [], loading: true, error: "" });
    api
      .listJobs({ q, location, status: "open" })
      .then((jobs) => {
        if (alive) setState({ jobs, loading: false, error: "" });
      })
      .catch(() => {
        if (alive) setState({ jobs: [], loading: false, error: "Không thể tải danh sách việc làm lúc này." });
      });
    return () => {
      alive = false;
    };
  }, [q, location, attempt]);
  return { ...state, retry: () => setAttempt((value) => value + 1) };
}

export function JobSearchBar({ q = "", location = "", locations = [] }) {
  const id = useId();
  return (
    <form
      className="home-search"
      role="search"
      action="/jobs"
      onSubmit={(event) => {
        event.preventDefault();
        const params = new URLSearchParams();
        for (const [key, value] of new FormData(event.currentTarget)) if (value.trim()) params.set(key, value.trim());
        navigate(`/jobs${params.size ? `?${params}` : ""}`);
      }}
    >
      <label className="home-search-keyword">
        <Search size={22} aria-hidden="true" />
        <span className="sr-only">Từ khóa việc làm</span>
        <input name="q" defaultValue={q} placeholder="Vị trí công việc, kỹ năng, tên công ty..." />
      </label>
      <label className="home-search-location">
        <MapPin size={20} aria-hidden="true" />
        <span className="sr-only">Địa điểm</span>
        <input name="location" defaultValue={location} list={id} placeholder="Địa điểm" autoComplete="off" />
        <datalist id={id}>
          {[...new Set(locations.filter(Boolean))].map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      </label>
      <button type="submit" className="home-button">
        <Search size={18} aria-hidden="true" />
        Tìm kiếm
      </button>
    </form>
  );
}

function employmentLabel(value) {
  return (
    {
      "full-time": "Toàn thời gian",
      "part-time": "Bán thời gian",
      contract: "Hợp đồng",
      internship: "Thực tập",
      freelance: "Tự do",
    }[value?.toLowerCase()] ||
    value ||
    "Chưa cập nhật"
  );
}

function splitSkills(value) {
  return String(value || "")
    .split(/[,;]+/)
    .map((skill) => skill.trim())
    .filter(Boolean);
}

function formatExperience(value) {
  const years = Number(value);
  if (!Number.isFinite(years) || years <= 0) return "Không yêu cầu";
  return `Tối thiểu ${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(years)} năm`;
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("vi-VN") : "Chưa cập nhật";
}

export function CompanyMark({ job }) {
  const name = job.company_name?.trim();
  return (
    <span className={`company-mark company-tone-${(job.company_id || job.id) % 4}`} aria-hidden="true">
      {name ? (
        name
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0])
          .join("")
          .toUpperCase()
      ) : (
        <Building2 size={24} />
      )}
    </span>
  );
}

export function JobCard({ job, compact = false }) {
  const skills = splitSkills(job.skills);
  return (
    <article className={`home-job-card ${compact ? "compact" : ""}`}>
      <div className="home-job-heading">
        <CompanyMark job={job} />
        <div>
          <h3>
            <Link href={`/jobs/${job.id}`}>{job.title}</Link>
          </h3>
          <p>{job.company_name || "Nhà tuyển dụng"}</p>
        </div>
        <button
          className="icon-button bookmark-button"
          type="button"
          disabled
          title="Lưu việc làm chưa được hỗ trợ"
          aria-label="Lưu việc làm chưa được hỗ trợ"
        >
          <Bookmark size={17} />
        </button>
      </div>
      <div className="home-job-meta">
        <span>
          <MapPin size={14} aria-hidden="true" />
          {job.location || "Chưa cập nhật"}
        </span>
        <span>
          <BriefcaseBusiness size={14} aria-hidden="true" />
          {employmentLabel(job.employment_type)}
        </span>
      </div>
      <p className="home-job-salary">
        <Wallet size={15} aria-hidden="true" />
        {job.salary_range || "Thỏa thuận"}
      </p>
      {!compact && (
        <div className="home-job-skills">
          {skills.slice(0, 4).map((skill, index) => (
            <span key={`${skill}-${index}`}>{skill}</span>
          ))}
        </div>
      )}
      {!compact && (
        <Link className="home-job-detail-link" href={`/jobs/${job.id}`}>
          Xem chi tiết <ArrowRight size={15} aria-hidden="true" />
        </Link>
      )}
    </article>
  );
}

export function JobGrid({ jobs, loading, error, retry, compact = false, count = 3 }) {
  if (error)
    return (
      <div className="jobs-feedback" role="alert">
        <p>{error}</p>
        <button className="home-button secondary" onClick={retry}>
          <RefreshCw size={16} />
          Thử lại
        </button>
      </div>
    );
  if (!loading && !jobs.length)
    return (
      <div className="jobs-feedback" role="status">
        <Search size={26} aria-hidden="true" />
        <p>Hiện chưa có việc làm phù hợp.</p>
      </div>
    );
  return (
    <div className={`home-job-grid ${compact ? "latest-grid" : ""}`} aria-busy={loading}>
      {loading ? (
        <>
          <span className="sr-only" role="status">
            Đang tải việc làm...
          </span>
          {Array.from({ length: count }, (_, index) => (
            <div key={index} className={`home-job-card job-skeleton ${compact ? "compact" : ""}`} aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
          ))}
        </>
      ) : (
        jobs.map((job) => <JobCard key={job.id} job={job} compact={compact} />)
      )}
    </div>
  );
}

export function JobsPage({ search }) {
  const params = new URLSearchParams(search);
  const q = params.get("q") || "";
  const location = params.get("location") || "";
  const state = useJobs(q, location);
  return (
    <main className="job-browser">
      <section className="job-search-band">
        <div className="site-container">
          <Link className="home-text-link" href="/">
            <ArrowLeft size={16} />
            Trang chủ
          </Link>
          <h1>Tìm công việc phù hợp</h1>
          <JobSearchBar key={search} q={q} location={location} locations={state.jobs.map((job) => job.location)} />
        </div>
      </section>
      <section className="site-container public-jobs-results">
        <div className="home-section-heading">
          <div>
            <h2>{q ? `Kết quả cho "${q}"` : "Cơ hội việc làm"}</h2>
            <p role="status">
              {state.loading
                ? "Đang tìm kiếm..."
                : `${state.jobs.length} việc làm${location ? ` tại ${location}` : " đang tuyển dụng"}`}
            </p>
          </div>
          {(q || location) && (
            <Link className="home-text-link" href="/jobs">
              Xóa bộ lọc <X size={15} />
            </Link>
          )}
        </div>
        <JobGrid {...state} />
      </section>
    </main>
  );
}

function DetailSection({ icon: Icon, title, children }) {
  return (
    <section className="job-detail-card">
      <div className="job-detail-card-heading">
        <span>
          <Icon size={20} aria-hidden="true" />
        </span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function JobFact({ icon: Icon, label, value, strong = false }) {
  return (
    <div>
      <dt>
        <Icon size={17} aria-hidden="true" />
        {label}
      </dt>
      <dd className={strong ? "is-strong" : undefined}>{value}</dd>
    </div>
  );
}

function JobDetailSkeleton() {
  return (
    <main className="job-browser">
      <section className="job-detail-hero">
        <div className="site-container">
          <div className="job-detail-shell job-detail-skeleton" role="status" aria-label="Đang tải chi tiết công việc">
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>
      <div className="site-container job-detail-layout">
        <div className="job-detail-card job-detail-skeleton">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="job-detail-card job-detail-skeleton">
          <span />
          <span />
          <span />
        </div>
      </div>
    </main>
  );
}

function JobDetailError({ missing = false, retry }) {
  return (
    <main className="job-browser">
      <div className="site-container public-job-detail">
        <div className="jobs-feedback" role="alert">
          <Search size={28} aria-hidden="true" />
          <h1>{missing ? "Không tìm thấy công việc" : "Không thể tải chi tiết công việc"}</h1>
          <p>
            {missing
              ? "Công việc có thể đã bị xóa hoặc không còn tồn tại."
              : "Đã có lỗi khi tải dữ liệu. Vui lòng thử lại sau."}
          </p>
          <div className="job-error-actions">
            <Link className="home-button" href="/jobs">
              Quay lại danh sách việc làm
            </Link>
            {!missing && (
              <button className="home-button secondary" type="button" onClick={retry}>
                <RefreshCw size={16} />
                Thử lại
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function applyErrorModal(error) {
  const message = `${error?.message || ""}`.toLowerCase();
  if (error?.status === 400 && /cv|resume|upload/.test(message)) {
    return {
      kind: "cv",
      title: "Bạn chưa có CV",
      body: "Bạn cần tải CV lên trước khi ứng tuyển vào công việc này.",
    };
  }
  if (error?.status === 409 || /already applied|đã ứng tuyển/.test(message)) {
    return {
      kind: "duplicate",
      title: "Bạn đã ứng tuyển công việc này.",
      body: "Hồ sơ của bạn đã có trong danh sách ứng tuyển cho vị trí này.",
    };
  }
  if (error?.status === 400 && /no longer|closed|ngừng|đóng/.test(message)) {
    return {
      kind: "closed",
      title: "Công việc đã ngừng tuyển",
      body: "Vị trí này hiện không còn nhận hồ sơ ứng tuyển.",
    };
  }
  if (error?.status === 403) {
    return {
      kind: "role",
      title: "Tài khoản không phù hợp",
      body: "Chỉ tài khoản ứng viên mới có thể ứng tuyển công việc.",
    };
  }
  if (error?.status === 404) {
    return {
      kind: "missing",
      title: "Không tìm thấy công việc",
      body: "Công việc có thể đã bị xóa hoặc không còn tồn tại.",
    };
  }
  return {
    kind: "error",
    title: "Chưa thể gửi hồ sơ",
    body: "Đã có lỗi khi gửi hồ sơ. Vui lòng thử lại sau.",
  };
}

function ApplyModal({ modal, onClose }) {
  if (!modal) return null;
  return (
    <div className="apply-modal-backdrop" role="presentation">
      <div className="apply-modal" role="dialog" aria-modal="true" aria-labelledby="apply-modal-title">
        <button className="icon-button apply-modal-close" type="button" onClick={onClose} aria-label="Đóng">
          <X size={18} />
        </button>
        <span className={`apply-modal-icon ${modal.kind}`}>
          {modal.kind === "success" ? <CheckCircle2 size={30} /> : <FileText size={30} />}
        </span>
        <h2 id="apply-modal-title">{modal.title}</h2>
        <p>{modal.body}</p>
        <div className="apply-modal-actions">
          {modal.kind === "success" ? (
            <>
              <Link className="home-button secondary" href="/jobs">
                Tiếp tục tìm việc
              </Link>
              <Link className="home-button" href={candidateRoutes.applications}>
                Xem đơn ứng tuyển
              </Link>
            </>
          ) : modal.kind === "cv" ? (
            <>
              <button className="home-button secondary" type="button" onClick={onClose}>
                Để sau
              </button>
              <Link className="home-button" href={candidateRoutes.resume}>
                Tải CV ngay
              </Link>
            </>
          ) : (
            <button className="home-button" type="button" onClick={onClose}>
              Đã hiểu
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function JobDetailPage({ id, user, authLoading }) {
  const [state, setState] = useState({ job: null, loading: true, error: null });
  const [attempt, setAttempt] = useState(0);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [closedByServer, setClosedByServer] = useState(false);
  const [modal, setModal] = useState(null);

  useEffect(() => {
    let alive = true;
    setState({ job: null, loading: true, error: null });
    api
      .getJob(id)
      .then((job) => {
        if (alive) setState({ job, loading: false, error: null });
      })
      .catch((error) => {
        if (alive) setState({ job: null, loading: false, error });
      });
    return () => {
      alive = false;
    };
  }, [id, attempt]);

  if (state.loading) return <JobDetailSkeleton />;
  if (state.error)
    return <JobDetailError missing={state.error.status === 404} retry={() => setAttempt((value) => value + 1)} />;

  const job = state.job;
  const skills = splitSkills(job.skills);
  const open = job.status === "open" && !closedByServer;
  const company = job.company_name || "Nhà tuyển dụng";
  const wrongRole = user && user.role !== "candidate";

  async function apply() {
    if (!open || applying || applied || wrongRole) return;
    if (!user) return navigate(loginPath(`/jobs/${id}`));
    setApplying(true);
    try {
      await api.applyToJob(id);
      setApplied(true);
      setModal({
        kind: "success",
        title: "Ứng tuyển thành công",
        body: "Hồ sơ của bạn đã được gửi tới nhà tuyển dụng.",
      });
    } catch (error) {
      if (error.status === 401) return navigate(loginPath(`/jobs/${id}`));
      const nextModal = applyErrorModal(error);
      if (nextModal.kind === "duplicate") setApplied(true);
      if (nextModal.kind === "closed") setClosedByServer(true);
      setModal(nextModal);
    } finally {
      setApplying(false);
    }
  }

  let applyLabel = "Ứng tuyển ngay";
  if (authLoading) applyLabel = "Đang kiểm tra...";
  else if (!open) applyLabel = "Đã ngừng tuyển";
  else if (applied) applyLabel = "Đã ứng tuyển";
  else if (applying) applyLabel = "Đang gửi hồ sơ...";
  else if (wrongRole) applyLabel = "Chỉ ứng viên có thể ứng tuyển";

  return (
    <main className="job-browser">
      <section className="job-detail-hero">
        <div className="site-container">
          <Link className="home-text-link" href="/jobs">
            <ArrowLeft size={16} />
            Quay lại danh sách việc làm
          </Link>
          <h1>Chi tiết công việc</h1>
          <p>Xem thông tin chi tiết về vị trí và ứng tuyển ngay để nắm bắt cơ hội phù hợp với bạn.</p>
          <div className="job-detail-shell">
            <CompanyMark job={job} />
            <div className="job-detail-title">
              <h2>{job.title}</h2>
              <p>{company}</p>
              <div className="home-job-meta">
                <span>
                  <MapPin size={16} aria-hidden="true" />
                  {job.location || "Chưa cập nhật"}
                </span>
                <span>
                  <BriefcaseBusiness size={16} aria-hidden="true" />
                  {employmentLabel(job.employment_type)}
                </span>
                <span className="job-detail-money">
                  <Wallet size={16} aria-hidden="true" />
                  {job.salary_range || "Thỏa thuận"}
                </span>
                <span>
                  <Users size={16} aria-hidden="true" />
                  {formatExperience(job.min_experience)}
                </span>
              </div>
            </div>
            <button
              className="icon-button bookmark-button detail-bookmark"
              type="button"
              disabled
              title="Lưu việc làm chưa được hỗ trợ"
              aria-label="Lưu việc làm chưa được hỗ trợ"
            >
              <Bookmark size={18} />
            </button>
            <button
              className="home-button detail-apply-button"
              type="button"
              disabled={authLoading || applying || applied || !open || wrongRole}
              onClick={apply}
            >
              <Send size={18} aria-hidden="true" />
              {applyLabel}
            </button>
          </div>
        </div>
      </section>

      <div className="site-container job-detail-layout">
        <div className="job-detail-main">
          <DetailSection icon={FileText} title="Mô tả công việc">
            <p className="job-detail-description-text">{job.description || "Chưa cập nhật mô tả công việc."}</p>
          </DetailSection>
          <DetailSection icon={Code2} title="Kỹ năng yêu cầu">
            {skills.length ? (
              <div className="home-job-skills">
                {skills.map((skill, index) => (
                  <span key={`${skill}-${index}`}>{skill}</span>
                ))}
              </div>
            ) : (
              <p className="job-detail-muted">Chưa cập nhật kỹ năng</p>
            )}
          </DetailSection>
        </div>

        <aside className="job-detail-sidebar">
          <section className="job-detail-card">
            <div className="job-detail-card-heading">
              <span>
                <BriefcaseBusiness size={20} aria-hidden="true" />
              </span>
              <h2>Thông tin công việc</h2>
            </div>
            <dl className="job-detail-facts">
              <JobFact icon={MapPin} label="Địa điểm" value={job.location || "Chưa cập nhật"} />
              <JobFact icon={BriefcaseBusiness} label="Hình thức" value={employmentLabel(job.employment_type)} />
              <JobFact icon={Wallet} label="Mức lương" value={job.salary_range || "Thỏa thuận"} strong />
              <JobFact icon={Users} label="Kinh nghiệm" value={formatExperience(job.min_experience)} />
              <JobFact icon={CalendarDays} label="Ngày đăng" value={formatDate(job.created_at)} />
              <JobFact icon={Users} label="Ứng viên" value={`${Number(job.applicants_count) || 0} hồ sơ`} />
              <JobFact icon={CheckCircle2} label="Trạng thái" value={open ? "Đang tuyển" : "Đã ngừng tuyển"} strong />
            </dl>
          </section>

          <section className="job-detail-card">
            <div className="job-detail-card-heading">
              <span>
                <Building2 size={20} aria-hidden="true" />
              </span>
              <h2>Thông tin công ty</h2>
            </div>
            <div className="job-company-card">
              <CompanyMark job={job} />
              <div>
                <h3>{company}</h3>
                <p>Thông tin công ty chi tiết chưa được cập nhật.</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
      <ApplyModal modal={modal} onClose={() => setModal(null)} />
    </main>
  );
}

