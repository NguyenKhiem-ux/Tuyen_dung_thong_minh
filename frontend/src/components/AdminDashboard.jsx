import React, { useEffect, useState } from "react";
import api from "../api.js";
import { Card, Tabs, EmptyState, Alert, Spinner } from "./Common.jsx";

const ROLE_LABELS = { candidate: "Ứng viên", recruiter: "Nhà tuyển dụng", admin: "Quản trị viên" };

export default function AdminDashboard() {
  const [tab, setTab] = useState("overview");

  return (
    <div className="dashboard">
      <h2 className="dashboard-title">Bảng điều khiển Quản trị viên</h2>
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "overview", label: "Thống kê hệ thống" },
          { key: "users", label: "Người dùng" },
          { key: "jobs", label: "Tin tuyển dụng" },
          { key: "companies", label: "Công ty" },
        ]}
      />
      {tab === "overview" && <Overview />}
      {tab === "users" && <Users />}
      {tab === "jobs" && <Jobs />}
      {tab === "companies" && <Companies />}
    </div>
  );
}

function Overview() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.adminStats().then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!stats) return <Spinner />;

  return (
    <div className="grid grid-4">
      <Card title="Tổng người dùng">
        <div className="stat-number">{stats.total_users}</div>
      </Card>
      <Card title="Tổng tin tuyển dụng">
        <div className="stat-number">{stats.total_jobs}</div>
        <p className="job-meta">{stats.open_jobs} đang mở</p>
      </Card>
      <Card title="Tổng công ty">
        <div className="stat-number">{stats.total_companies}</div>
      </Card>
      <Card title="Tổng đơn ứng tuyển">
        <div className="stat-number">{stats.total_applications}</div>
      </Card>
      <Card title="Người dùng theo vai trò" className="span-2">
        {Object.entries(stats.users_by_role).map(([k, v]) => (
          <div key={k} className="status-row">
            <span>{ROLE_LABELS[k] || k}</span>
            <strong>{v}</strong>
          </div>
        ))}
      </Card>
      <Card title="Đơn ứng tuyển theo trạng thái" className="span-2">
        {Object.keys(stats.applications_by_status).length === 0 ? (
          <EmptyState text="Chưa có dữ liệu." />
        ) : (
          Object.entries(stats.applications_by_status).map(([k, v]) => (
            <div key={k} className="status-row">
              <span>{k}</span>
              <strong>{v}</strong>
            </div>
          ))
        )}
      </Card>
    </div>
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
