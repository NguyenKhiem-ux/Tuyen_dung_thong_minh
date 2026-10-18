import React, { useEffect, useState } from "react";
import { BriefcaseBusiness, Building2, FileText, LayoutDashboard, Users as UsersIcon } from "lucide-react";
import api from "../api.js";
import { Card, EmptyState, Alert, Spinner } from "./Common.jsx";

const ROLE_LABELS = { candidate: "Ứng viên", recruiter: "Nhà tuyển dụng", admin: "Quản trị viên" };
const ROLE_ORDER = ["admin", "recruiter", "candidate"];
const ROLE_COLORS = { admin: "#f59e0b", recruiter: "#00b14f", candidate: "#2878f0" };
const APPLICATION_STATUSES = [
  ["applied", "Đã ứng tuyển", "#2878f0"],
  ["screening", "Sàng lọc", "#f59e0b"],
  ["interview", "Phỏng vấn", "#8b5cf6"],
  ["offer", "Đề nghị", "#a855f7"],
  ["hired", "Đã tuyển", "#00b14f"],
  ["rejected", "Đã từ chối", "#ef4444"],
];

export default function AdminDashboard({ activeTab = "overview" }) {
  return (
    <div className="dashboard admin-dashboard" data-active-tab={activeTab}>
      {activeTab === "overview" && <Overview />}
      {activeTab === "users" && <Users />}
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

function Users() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");

  function load() {
    api.adminUsers().then(setUsers).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function toggleActive(u) {
    await api.adminUpdateUser(u.id, { is_active: !u.is_active });
    load();
  }

  async function changeRole(u, role) {
    await api.adminUpdateUser(u.id, { role });
    load();
  }

  if (error) return <Alert>{error}</Alert>;

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Họ tên</th>
            <th>Email</th>
            <th>Vai trò</th>
            <th>Trạng thái</th>
            <th>Hành động</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.full_name}</td>
              <td>{u.email}</td>
              <td>
                <select value={u.role} onChange={(e) => changeRole(u, e.target.value)}>
                  <option value="candidate">Ứng viên</option>
                  <option value="recruiter">Nhà tuyển dụng</option>
                  <option value="admin">Quản trị viên</option>
                </select>
              </td>
              <td>
                <span className={`badge ${u.is_active ? "status-hired" : "status-rejected"}`}>
                  {u.is_active ? "Hoạt động" : "Đã khóa"}
                </span>
              </td>
              <td>
                <button className="btn-ghost" onClick={() => toggleActive(u)}>
                  {u.is_active ? "Khóa" : "Mở khóa"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Jobs() {
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.adminJobs().then(setJobs).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (jobs.length === 0) return <EmptyState text="Chưa có tin tuyển dụng nào." />;

  return (
    <div className="grid grid-2">
      {jobs.map((job) => (
        <Card
          key={job.id}
          title={job.title}
          subtitle={`${job.company_name || "—"} · ${job.location}`}
          right={<span className={`badge ${job.status === "open" ? "status-hired" : "status-rejected"}`}>{job.status}</span>}
        >
          <p className="job-meta">{job.applicants_count} ứng viên</p>
          <p className="job-meta">Kỹ năng: {job.skills || "Chưa liệt kê"}</p>
        </Card>
      ))}
    </div>
  );
}

function Companies() {
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.companies().then(setCompanies).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (companies.length === 0) return <EmptyState text="Chưa có công ty nào." />;

  return (
    <div className="grid grid-2">
      {companies.map((c) => (
        <Card key={c.id} title={c.name} subtitle={`${c.industry || "—"} · ${c.location || "—"}`}>
          <p className="job-desc">{c.description}</p>
          {c.website && <p className="job-meta">{c.website}</p>}
        </Card>
      ))}
    </div>
  );
}
