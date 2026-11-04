import React, { useEffect, useState } from "react";
import {
  Archive,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  MapPin,
  RotateCcw,
  Search,
  UnlockKeyhole,
  Users as UsersIcon,
  X,
} from "lucide-react";
import api from "../api.js";
import { EmptyState, Alert, Spinner } from "./Common.jsx";

const ROLE_LABELS = { candidate: "Ứng viên", recruiter: "Nhà tuyển dụng", admin: "Quản trị viên" };
const ROLE_ORDER = ["admin", "recruiter", "candidate"];
const ROLE_COLORS = { admin: "#f59e0b", recruiter: "#00b14f", candidate: "#2878f0" };
const PAGE_SIZE = 10;
const APPLICATION_STATUSES = [
  ["applied", "Đã ứng tuyển", "#2878f0"],
  ["screening", "Sàng lọc", "#f59e0b"],
  ["interview", "Phỏng vấn", "#8b5cf6"],
  ["offer", "Đề nghị", "#a855f7"],
  ["hired", "Đã tuyển", "#00b14f"],
  ["rejected", "Đã từ chối", "#ef4444"],
];

export default function AdminDashboard({ activeTab = "overview", currentUser }) {
  return (
    <div className="dashboard admin-dashboard" data-active-tab={activeTab}>
      {activeTab === "overview" && <Overview />}
      {activeTab === "users" && <Users currentUser={currentUser} />}
      {activeTab === "jobs" && <Jobs />}
      {activeTab === "companies" && <Companies />}
    </div>
  );
}

function percentage(value, total) {
  if (!total) return 0;
  return Math.min(100, Math.max(0, (value / total) * 100));
}

function formatPercentage(value) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value);
}

function Overview() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.adminStats().then(setStats).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="admin-overview">
      <section className="admin-overview-hero">
        <div>
          <p className="admin-overview-eyebrow">Quản trị nền tảng</p>
          <h1>Tổng quan hệ thống</h1>
          <p>Thống kê hoạt động và tình hình tuyển dụng trên toàn nền tảng.</p>
        </div>
        <span className="admin-overview-hero-icon" aria-hidden="true">
          <LayoutDashboard />
        </span>
      </section>

      {error && <Alert>{error}</Alert>}
      {!error && !stats && <Spinner />}
      {stats && (
        <>
          <section className="admin-metric-grid" aria-label="Chỉ số tổng quan hệ thống">
            <MetricCard
              icon={UsersIcon}
              label="Tổng người dùng"
              value={stats.total_users}
              tone="blue"
              testId="admin-total-users"
            />
            <MetricCard
              icon={BriefcaseBusiness}
              label="Tổng tin tuyển dụng"
              value={stats.total_jobs}
              detail={`${stats.open_jobs ?? 0} đang mở`}
              tone="green"
              testId="admin-total-jobs"
            />
            <MetricCard
              icon={Building2}
              label="Tổng công ty"
              value={stats.total_companies}
              tone="amber"
              testId="admin-total-companies"
            />
            <MetricCard
              icon={FileText}
              label="Tổng đơn ứng tuyển"
              value={stats.total_applications}
              tone="purple"
              testId="admin-total-applications"
            />
          </section>

          <section className="admin-chart-grid">
            <RoleDistribution stats={stats} />
            <ApplicationDistribution stats={stats} />
          </section>
        </>
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, detail, tone, testId }) {
  return (
    <article className={`admin-metric-card admin-metric-card-${tone}`}>
      <span className="admin-metric-icon" aria-hidden="true">
        <Icon />
      </span>
      <div>
        <p>{label}</p>
        <strong data-testid={testId}>{value}</strong>
        {detail && <span>{detail}</span>}
      </div>
    </article>
  );
}

function RoleDistribution({ stats }) {
  const total = Number(stats.total_users) || 0;
  const roleData = stats.users_by_role || {};

  return (
    <article className="admin-chart-card" aria-labelledby="admin-role-title">
      <header>
        <span className="admin-chart-icon admin-chart-icon-blue" aria-hidden="true">
          <UsersIcon />
        </span>
        <div>
          <h2 id="admin-role-title">Người dùng theo vai trò</h2>
          <p>Cơ cấu tài khoản đang có trên hệ thống.</p>
        </div>
      </header>
      <div className="admin-distribution-list">
        {ROLE_ORDER.map((role) => {
          const count = Number(roleData[role]) || 0;
          const share = percentage(count, total);
          return (
            <div className="admin-distribution-row" key={role} data-testid={`admin-role-${role}`}>
              <div className="admin-distribution-label">
                <span className="admin-chart-dot" style={{ background: ROLE_COLORS[role] }} />
                <span>{ROLE_LABELS[role]}</span>
                <strong>{count}</strong>
                <em>{formatPercentage(share)}%</em>
              </div>
              <div
                className="admin-distribution-track"
                role="progressbar"
                aria-label={`Tỷ lệ ${ROLE_LABELS[role]}`}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={Math.round(share * 10) / 10}
              >
                <span style={{ background: ROLE_COLORS[role], width: `${share}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function ApplicationDistribution({ stats }) {
  const statusData = stats.applications_by_status || {};
  const total = APPLICATION_STATUSES.reduce((sum, [status]) => sum + (Number(statusData[status]) || 0), 0);

  return (
    <article className="admin-chart-card" aria-labelledby="admin-status-title">
      <header>
        <span className="admin-chart-icon admin-chart-icon-green" aria-hidden="true">
          <FileText />
        </span>
        <div>
          <h2 id="admin-status-title">Đơn ứng tuyển theo trạng thái</h2>
          <p>Phân bổ hồ sơ theo từng giai đoạn ATS.</p>
        </div>
        <strong className="admin-chart-total">{stats.total_applications}</strong>
      </header>
      <div className="admin-distribution-list admin-status-list">
        {APPLICATION_STATUSES.map(([status, label, color]) => {
          const count = Number(statusData[status]) || 0;
          const share = percentage(count, total);
          return (
            <div className="admin-distribution-row" key={status} data-testid={`admin-status-${status}`}>
              <div className="admin-distribution-label">
                <span className="admin-chart-dot" style={{ background: color }} />
                <span>{label}</span>
                <strong>{count}</strong>
                <em>{formatPercentage(share)}%</em>
              </div>
              <div
                className="admin-distribution-track"
                role="progressbar"
                aria-label={`Tỷ lệ ${label}`}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={Math.round(share * 10) / 10}
              >
                <span style={{ background: color, width: `${share}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function Users({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pendingAction, setPendingAction] = useState(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(showLoading = true) {
    if (showLoading) setLoading(true);
    setError("");
    try {
      setUsers(await api.adminUsers());
    } catch (e) {
      setError(e.message || "Không thể tải danh sách người dùng.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    setPage(1);
  }, [query, roleFilter, statusFilter]);

  function requestRoleChange(user, role) {
    if (role === user.role || user.id === currentUser?.id) return;
    setActionError("");
    setPendingAction({ type: "role", user, role });
  }

  function requestStatusChange(user) {
    if (user.id === currentUser?.id) return;
    setActionError("");
    setPendingAction({ type: "status", user, isActive: !user.is_active });
  }

  async function confirmAction() {
    if (!pendingAction || pendingAction.user.id === currentUser?.id) return;
    const isRoleChange = pendingAction.type === "role";
    setBusy(true);
    setActionError("");
    try {
      await api.adminUpdateUser(
        pendingAction.user.id,
        isRoleChange ? { role: pendingAction.role } : { is_active: pendingAction.isActive },
      );
      await load(false);
      setSuccess(isRoleChange ? "Đã cập nhật vai trò người dùng." : "Đã cập nhật trạng thái tài khoản.");
      setPendingAction(null);
    } catch (e) {
      setActionError(e.message || "Không thể cập nhật người dùng.");
    } finally {
      setBusy(false);
    }
  }

  function resetFilters() {
    setQuery("");
    setRoleFilter("all");
    setStatusFilter("all");
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filteredUsers = users.filter((user) => {
    const matchesQuery =
      !normalizedQuery ||
      user.full_name?.toLowerCase().includes(normalizedQuery) ||
      user.email?.toLowerCase().includes(normalizedQuery);
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    const matchesStatus =
      statusFilter === "all" || (statusFilter === "active" ? user.is_active : !user.is_active);
    return matchesQuery && matchesRole && matchesStatus;
  });
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const visiblePage = Math.min(page, totalPages);
  const pageStart = (visiblePage - 1) * PAGE_SIZE;
  const pageUsers = filteredUsers.slice(pageStart, pageStart + PAGE_SIZE);
  const hasFilters = Boolean(query || roleFilter !== "all" || statusFilter !== "all");

  return (
    <div className="admin-users-page">
      <section className="admin-overview-hero admin-users-hero">
        <div>
          <p className="admin-overview-eyebrow">Quản trị nền tảng</p>
          <h1>Quản lý người dùng</h1>
          <p>Theo dõi tài khoản, vai trò và trạng thái hoạt động trên hệ thống.</p>
        </div>
        <span className="admin-overview-hero-icon" aria-hidden="true">
          <UsersIcon />
        </span>
      </section>

      <section className="admin-users-filters" aria-label="Bộ lọc người dùng">
        <label className="admin-user-search">
          <span className="sr-only">Tìm kiếm theo họ tên hoặc email</span>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo họ tên hoặc email..."
            aria-label="Tìm kiếm người dùng"
          />
        </label>
        <label>
          <span className="sr-only">Lọc theo vai trò</span>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Lọc theo vai trò">
            <option value="all">Tất cả vai trò</option>
            <option value="candidate">Ứng viên</option>
            <option value="recruiter">Nhà tuyển dụng</option>
            <option value="admin">Quản trị viên</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Lọc theo trạng thái</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Lọc theo trạng thái"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Hoạt động</option>
            <option value="locked">Bị khóa</option>
          </select>
        </label>
        <button type="button" className="admin-filter-reset" onClick={resetFilters} disabled={!hasFilters}>
          <RotateCcw size={17} aria-hidden="true" />
          Xóa bộ lọc
        </button>
      </section>

      {success && <Alert type="success">{success}</Alert>}
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <div className="admin-users-loading">
          <Spinner />
        </div>
      ) : !error ? (
        <section className="admin-users-card" aria-label="Danh sách người dùng">
          <div className="admin-users-table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>Người dùng</th>
                  <th>Email</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {pageUsers.length === 0 ? (
                  <tr className="admin-users-empty-row">
                    <td colSpan="5">
                      <EmptyState text="Không tìm thấy người dùng phù hợp." />
                    </td>
                  </tr>
                ) : (
                  pageUsers.map((user) => {
                    const isCurrentUser = user.id === currentUser?.id;
                    return (
                      <tr key={user.id} data-testid={`admin-user-${user.id}`}>
                        <td data-label="Người dùng">
                          <div className="admin-user-identity">
                            <span className={`admin-user-avatar role-${user.role}`}>{userInitials(user.full_name)}</span>
                            <strong>{user.full_name}</strong>
                          </div>
                        </td>
                        <td data-label="Email" className="admin-user-email">{user.email}</td>
                        <td data-label="Vai trò">
                          <select
                            value={user.role}
                            onChange={(event) => requestRoleChange(user, event.target.value)}
                            aria-label={`Vai trò của ${user.full_name}`}
                            disabled={isCurrentUser}
                            title={isCurrentUser ? "Không thể đổi vai trò của tài khoản đang đăng nhập" : undefined}
                          >
                            <option value="candidate">Ứng viên</option>
                            <option value="recruiter">Nhà tuyển dụng</option>
                            <option value="admin">Quản trị viên</option>
                          </select>
                        </td>
                        <td data-label="Trạng thái">
                          <span className={`admin-user-status ${user.is_active ? "is-active" : "is-locked"}`}>
                            <i aria-hidden="true" />
                            {user.is_active ? "Hoạt động" : "Bị khóa"}
                          </span>
                        </td>
                        <td data-label="Hành động">
                          {isCurrentUser ? (
                            <span className="admin-current-user">Tài khoản hiện tại</span>
                          ) : (
                            <button
                              type="button"
                              className={`admin-user-action ${user.is_active ? "is-lock" : "is-unlock"}`}
                              onClick={() => requestStatusChange(user)}
                            >
                              {user.is_active ? <LockKeyhole size={15} /> : <UnlockKeyhole size={15} />}
                              {user.is_active ? "Khóa" : "Mở khóa"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <footer className="admin-users-pagination">
            <span>
              Hiển thị {filteredUsers.length ? pageStart + 1 : 0}–{Math.min(pageStart + PAGE_SIZE, filteredUsers.length)} / {filteredUsers.length} tài khoản
            </span>
            <div>
              <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={visiblePage === 1}>
                <ChevronLeft size={16} aria-hidden="true" />
                Trước
              </button>
              <strong aria-label={`Trang ${visiblePage} trên ${totalPages}`}>{visiblePage}</strong>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                disabled={visiblePage === totalPages}
              >
                Tiếp theo
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </footer>
        </section>
      ) : null}

      {pendingAction && (
        <AdminUserConfirmModal
          action={pendingAction}
          error={actionError}
          busy={busy}
          onCancel={() => {
            if (!busy) setPendingAction(null);
          }}
          onConfirm={confirmAction}
        />
      )}
    </div>
  );
}

function userInitials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return `${parts[0][0]}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}

function AdminUserConfirmModal({ action, error, busy, onCancel, onConfirm }) {
  const isRoleChange = action.type === "role";
  const isLocking = !isRoleChange && !action.isActive;
  const title = isRoleChange ? "Xác nhận đổi vai trò" : isLocking ? "Khóa tài khoản" : "Mở khóa tài khoản";
  const confirmLabel = isRoleChange ? "Xác nhận đổi vai trò" : isLocking ? "Khóa tài khoản" : "Mở khóa tài khoản";

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [busy, onCancel]);

  return (
    <div
      className="admin-user-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section className="admin-user-modal" role="dialog" aria-modal="true" aria-labelledby="admin-user-modal-title">
        <button type="button" className="admin-user-modal-close" onClick={onCancel} disabled={busy} aria-label="Đóng">
          <X size={19} />
        </button>
        <span className={`admin-user-modal-icon ${isLocking ? "is-danger" : ""}`} aria-hidden="true">
          {isLocking ? <LockKeyhole /> : isRoleChange ? <UsersIcon /> : <UnlockKeyhole />}
        </span>
        <h2 id="admin-user-modal-title">{title}</h2>
        <p>
          Tài khoản <strong>{action.user.full_name}</strong> ({action.user.email})
        </p>
        {isRoleChange ? (
          <div className="admin-role-change-summary">
            <span>{ROLE_LABELS[action.user.role]}</span>
            <strong>→</strong>
            <span>{ROLE_LABELS[action.role]}</span>
          </div>
        ) : (
          <p className="admin-user-modal-warning">
            {isLocking
              ? "Tài khoản này có thể không đăng nhập được sau khi bị khóa."
              : "Tài khoản sẽ có thể đăng nhập và hoạt động trở lại."}
          </p>
        )}
        {error && <Alert>{error}</Alert>}
        <div className="admin-user-modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>Hủy</button>
          <button type="button" className={isLocking ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={busy}>
            {busy ? "Đang xử lý..." : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function Jobs() {
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.adminJobs()
      .then(setJobs)
      .catch((e) => setError(e.message || "Không thể tải danh sách tin tuyển dụng."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    setPage(1);
  }, [query, companyFilter, statusFilter]);

  const companies = [...new Set(jobs.map((job) => job.company_name).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "vi"),
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredJobs = jobs.filter((job) => {
    const matchesQuery = !normalizedQuery || job.title?.toLowerCase().includes(normalizedQuery);
    const matchesCompany = companyFilter === "all" || job.company_name === companyFilter;
    const matchesStatus = statusFilter === "all" || job.status === statusFilter;
    return matchesQuery && matchesCompany && matchesStatus;
  });
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE));
  const visiblePage = Math.min(page, totalPages);
  const pageStart = (visiblePage - 1) * PAGE_SIZE;
  const pageJobs = filteredJobs.slice(pageStart, pageStart + PAGE_SIZE);
  const openJobs = jobs.filter((job) => job.status === "open").length;
  const closedJobs = jobs.filter((job) => job.status === "closed").length;
  const totalApplicants = jobs.reduce((sum, job) => sum + (Number(job.applicants_count) || 0), 0);
  const hasFilters = Boolean(query || companyFilter !== "all" || statusFilter !== "all");

  function resetFilters() {
    setQuery("");
    setCompanyFilter("all");
    setStatusFilter("all");
  }

  return (
    <div className="admin-users-page admin-jobs-page">
      <section className="admin-overview-hero admin-jobs-hero">
        <div>
          <p className="admin-overview-eyebrow">Quản trị nền tảng</p>
          <h1>Quản lý tin tuyển dụng</h1>
          <p>Theo dõi các vị trí tuyển dụng đang được đăng tải trên toàn hệ thống.</p>
        </div>
        <span className="admin-overview-hero-icon" aria-hidden="true">
          <BriefcaseBusiness />
        </span>
      </section>

      {!loading && !error && (
        <section className="admin-metric-grid" aria-label="Thống kê tin tuyển dụng">
          <MetricCard icon={FileText} label="Tổng tin tuyển dụng" value={jobs.length} tone="green" testId="admin-jobs-total" />
          <MetricCard icon={BriefcaseBusiness} label="Tin đang mở" value={openJobs} tone="green" testId="admin-jobs-open" />
          <MetricCard icon={Archive} label="Tin đã đóng" value={closedJobs} tone="amber" testId="admin-jobs-closed" />
          <MetricCard icon={UsersIcon} label="Tổng lượt ứng tuyển" value={totalApplicants} tone="blue" testId="admin-jobs-applicants" />
        </section>
      )}

      <section className="admin-users-filters admin-jobs-filters" aria-label="Bộ lọc tin tuyển dụng">
        <label className="admin-user-search">
          <span className="sr-only">Tìm theo tên công việc</span>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo tên công việc..."
            aria-label="Tìm kiếm tin tuyển dụng"
          />
        </label>
        <label>
          <span className="sr-only">Lọc theo công ty</span>
          <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} aria-label="Lọc theo công ty">
            <option value="all">Tất cả công ty</option>
            {companies.map((company) => <option value={company} key={company}>{company}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Lọc theo trạng thái tin tuyển dụng</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Lọc theo trạng thái tin tuyển dụng">
            <option value="all">Tất cả trạng thái</option>
            <option value="open">Đang mở</option>
            <option value="closed">Đã đóng</option>
          </select>
        </label>
        <button type="button" className="admin-filter-reset" onClick={resetFilters} disabled={!hasFilters}>
          <RotateCcw size={17} aria-hidden="true" />
          Xóa bộ lọc
        </button>
      </section>

      {error && <Alert>{error}</Alert>}
      {loading ? (
        <div className="admin-users-loading admin-jobs-loading"><Spinner /></div>
      ) : !error ? (
        <section className="admin-users-card admin-jobs-card" aria-label="Danh sách tin tuyển dụng">
          <div className="admin-users-table-wrap">
            <table className="admin-users-table admin-jobs-table">
              <thead>
                <tr>
                  <th>Tên công việc</th>
                  <th>Công ty</th>
                  <th>Địa điểm</th>
                  <th>Ứng viên</th>
                  <th>Trạng thái</th>
                  <th>Ngày đăng</th>
                </tr>
              </thead>
              <tbody>
                {pageJobs.length === 0 ? (
                  <tr className="admin-users-empty-row">
                    <td colSpan="6"><EmptyState text={jobs.length ? "Không tìm thấy tin tuyển dụng phù hợp." : "Chưa có tin tuyển dụng nào."} /></td>
                  </tr>
                ) : (
                  pageJobs.map((job) => (
                    <tr key={job.id} data-testid={`admin-job-${job.id}`}>
                      <td data-label="Tên công việc">
                        <div className="admin-job-title">
                          <strong>{job.title}</strong>
                          {(job.description || job.skills) && (
                            <details>
                              <summary>Xem mô tả &amp; kỹ năng</summary>
                              {job.description && <p>{job.description}</p>}
                              {job.skills && <p><b>Kỹ năng:</b> {job.skills}</p>}
                            </details>
                          )}
                        </div>
                      </td>
                      <td data-label="Công ty">
                        <span className="admin-job-company"><Building2 size={16} aria-hidden="true" />{job.company_name || "—"}</span>
                      </td>
                      <td data-label="Địa điểm">
                        <span className="admin-job-meta"><MapPin size={16} aria-hidden="true" />{job.location || "—"}</span>
                      </td>
                      <td data-label="Ứng viên"><strong className="admin-job-applicants">{Number(job.applicants_count) || 0}</strong></td>
                      <td data-label="Trạng thái">
                        <span className={`admin-job-status ${job.status === "open" ? "is-open" : "is-closed"}`}>
                          <i aria-hidden="true" />{job.status === "open" ? "Đang mở" : "Đã đóng"}
                        </span>
                      </td>
                      <td data-label="Ngày đăng">
                        <span className="admin-job-meta"><CalendarDays size={16} aria-hidden="true" />{formatJobDate(job.created_at)}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <footer className="admin-users-pagination">
            <span>Hiển thị {filteredJobs.length ? pageStart + 1 : 0}–{Math.min(pageStart + PAGE_SIZE, filteredJobs.length)} / {filteredJobs.length} tin tuyển dụng</span>
            <div>
              <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={visiblePage === 1}>
                <ChevronLeft size={16} aria-hidden="true" />Trước
              </button>
              <strong aria-label={`Trang ${visiblePage} trên ${totalPages}`}>{visiblePage}</strong>
              <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={visiblePage === totalPages}>
                Tiếp theo<ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </footer>
        </section>
      ) : null}
    </div>
  );
}

function formatJobDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("vi-VN").format(date);
}

function Companies() {
  const [companies, setCompanies] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedCompany, setSelectedCompany] = useState(null);

  useEffect(() => {
    Promise.all([api.companies(), api.adminJobs()])
      .then(([companyData, jobData]) => {
        setCompanies(companyData);
        setJobs(jobData);
      })
      .catch((e) => setError(e.message || "Không thể tải danh sách công ty."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    setPage(1);
  }, [query, industryFilter, locationFilter]);

  const industries = [...new Set(companies.map((company) => company.industry).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "vi"),
  );
  const locations = [...new Set(companies.map((company) => company.location).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "vi"),
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredCompanies = companies.filter((company) => {
    const matchesQuery = !normalizedQuery || company.name?.toLowerCase().includes(normalizedQuery);
    const matchesIndustry = industryFilter === "all" || company.industry === industryFilter;
    const matchesLocation = locationFilter === "all" || company.location === locationFilter;
    return matchesQuery && matchesIndustry && matchesLocation;
  });
  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / PAGE_SIZE));
  const visiblePage = Math.min(page, totalPages);
  const pageStart = (visiblePage - 1) * PAGE_SIZE;
  const pageCompanies = filteredCompanies.slice(pageStart, pageStart + PAGE_SIZE);
  const hasFilters = Boolean(query || industryFilter !== "all" || locationFilter !== "all");

  function resetFilters() {
    setQuery("");
    setIndustryFilter("all");
    setLocationFilter("all");
  }

  return (
    <div className="admin-users-page admin-companies-page">
      <section className="admin-overview-hero admin-companies-hero">
        <div>
          <p className="admin-overview-eyebrow">Quản trị nền tảng</p>
          <h1>Quản lý công ty</h1>
          <p>Theo dõi thông tin các doanh nghiệp đang hoạt động trên hệ thống.</p>
        </div>
        <span className="admin-overview-hero-icon" aria-hidden="true"><Building2 /></span>
      </section>

      {!loading && !error && (
        <section className="admin-company-metrics" aria-label="Thống kê công ty">
          <MetricCard icon={Building2} label="Tổng số công ty" value={companies.length} tone="green" testId="admin-companies-total" />
          <MetricCard icon={BriefcaseBusiness} label="Tổng tin tuyển dụng" value={jobs.length} tone="blue" testId="admin-companies-jobs" />
        </section>
      )}

      <section className="admin-users-filters admin-companies-filters" aria-label="Bộ lọc công ty">
        <label className="admin-user-search">
          <span className="sr-only">Tìm theo tên công ty</span>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo tên công ty..."
            aria-label="Tìm kiếm công ty"
          />
        </label>
        <label>
          <span className="sr-only">Lọc theo lĩnh vực</span>
          <select value={industryFilter} onChange={(event) => setIndustryFilter(event.target.value)} aria-label="Lọc theo lĩnh vực">
            <option value="all">Tất cả lĩnh vực</option>
            {industries.map((industry) => <option value={industry} key={industry}>{industry}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Lọc theo địa điểm công ty</span>
          <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} aria-label="Lọc theo địa điểm công ty">
            <option value="all">Tất cả địa điểm</option>
            {locations.map((location) => <option value={location} key={location}>{location}</option>)}
          </select>
        </label>
        <button type="button" className="admin-filter-reset" onClick={resetFilters} disabled={!hasFilters}>
          <RotateCcw size={17} aria-hidden="true" />Xóa bộ lọc
        </button>
      </section>

      {error && <Alert>{error}</Alert>}
      {loading ? (
        <div className="admin-users-loading admin-companies-loading"><Spinner /></div>
      ) : !error ? (
        <>
          {pageCompanies.length ? (
            <section className="admin-company-grid" aria-label="Danh sách công ty">
              {pageCompanies.map((company) => {
                const websiteUrl = safeWebsiteUrl(company.website);
                return (
                  <article className="admin-company-card" key={company.id} data-testid={`admin-company-${company.id}`}>
                    <header>
                      <span className="admin-company-icon" aria-hidden="true"><Building2 /></span>
                      <div>
                        <h2>{company.name}</h2>
                        <span>{company.industry || "Chưa cập nhật lĩnh vực"}</span>
                      </div>
                      <strong>{companyJobCount(company, jobs)} tin</strong>
                    </header>
                    <p className="admin-company-location"><MapPin size={17} aria-hidden="true" />{company.location || "Chưa cập nhật địa điểm"}</p>
                    <p className="admin-company-description">{company.description || "Chưa có mô tả công ty."}</p>
                    {company.website && (
                      websiteUrl ? (
                        <a className="admin-company-website" href={websiteUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink size={15} aria-hidden="true" />{company.website}
                        </a>
                      ) : <span className="admin-company-website is-disabled">{company.website}</span>
                    )}
                    <button type="button" className="admin-company-detail-button" onClick={() => setSelectedCompany(company)}>
                      Xem thông tin
                    </button>
                  </article>
                );
              })}
            </section>
          ) : <div className="admin-company-empty"><EmptyState text={companies.length ? "Không tìm thấy công ty phù hợp." : "Chưa có công ty nào."} /></div>}

          <footer className="admin-users-pagination admin-company-pagination">
            <span>Hiển thị {filteredCompanies.length ? pageStart + 1 : 0}–{Math.min(pageStart + PAGE_SIZE, filteredCompanies.length)} / {filteredCompanies.length} công ty</span>
            <div>
              <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={visiblePage === 1}>
                <ChevronLeft size={16} aria-hidden="true" />Trước
              </button>
              <strong aria-label={`Trang ${visiblePage} trên ${totalPages}`}>{visiblePage}</strong>
              <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={visiblePage === totalPages}>
                Tiếp theo<ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </footer>
        </>
      ) : null}

      {selectedCompany && <CompanyDetailsModal company={selectedCompany} jobs={jobs} onClose={() => setSelectedCompany(null)} />}
    </div>
  );
}

function companyJobCount(company, jobs) {
  const companyName = company.name?.trim().toLowerCase();
  return jobs.filter((job) =>
    job.company_id != null ? job.company_id === company.id : job.company_name?.trim().toLowerCase() === companyName,
  ).length;
}

function safeWebsiteUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function CompanyDetailsModal({ company, jobs, onClose }) {
  const websiteUrl = safeWebsiteUrl(company.website);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="admin-user-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="admin-user-modal admin-company-modal" role="dialog" aria-modal="true" aria-labelledby="admin-company-modal-title">
        <button type="button" className="admin-user-modal-close" onClick={onClose} aria-label="Đóng hộp thoại"><X size={19} /></button>
        <span className="admin-user-modal-icon" aria-hidden="true"><Building2 /></span>
        <h2 id="admin-company-modal-title">{company.name}</h2>
        <div className="admin-company-modal-meta">
          <p><strong>Lĩnh vực</strong><span>{company.industry || "Chưa cập nhật"}</span></p>
          <p><strong>Địa điểm</strong><span>{company.location || "Chưa cập nhật"}</span></p>
          <p><strong>Tin tuyển dụng</strong><span>{companyJobCount(company, jobs)}</span></p>
        </div>
        <div className="admin-company-modal-description">
          <strong>Mô tả công ty</strong>
          <p>{company.description || "Chưa có mô tả công ty."}</p>
        </div>
        {company.website && (
          <div className="admin-company-modal-website">
            <strong>Website</strong>
            {websiteUrl ? (
              <a href={websiteUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden="true" />{company.website}</a>
            ) : <span>{company.website}</span>}
          </div>
        )}
        <button type="button" className="btn-primary admin-company-modal-done" onClick={onClose}>Đóng</button>
      </section>
    </div>
  );
}
