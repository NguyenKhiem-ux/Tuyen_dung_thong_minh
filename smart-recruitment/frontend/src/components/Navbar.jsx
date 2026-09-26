import React from "react";

const ROLE_LABELS = { candidate: "Ứng viên", recruiter: "Nhà tuyển dụng", admin: "Quản trị viên" };

const CANDIDATE_NAV = [
  { key: "overview", label: "Tổng quan", icon: "⌂" },
  { key: "jobs", label: "Tìm việc", icon: "⌕" },
  { key: "resume", label: "CV của tôi", icon: "▤" },
  { key: "applications", label: "Đơn ứng tuyển", icon: "✈" },
  { key: "recommendations", label: "Gợi ý AI", icon: "✦" },
  { key: "interviews", label: "Lịch phỏng vấn", icon: "▣" },
];

function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function Navbar({ user, onLogout, activeTab, onTabChange }) {
  const isCandidate = user.role === "candidate";

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <div className="navbar-brand" aria-label="Smart Recruitment AI">
          <div className="auth-logo small">SR</div>
          <span>
            Smart Recruitment <strong>AI</strong>
          </span>
        </div>

        {isCandidate && (
          <nav className="candidate-nav" aria-label="Điều hướng ứng viên">
            {CANDIDATE_NAV.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`nav-item ${activeTab === item.key ? "active" : ""}`}
                onClick={() => onTabChange(item.key)}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        )}

        <details className="user-menu">
          <summary className="navbar-user">
            <span className="avatar">{initials(user.full_name) || "SR"}</span>
            <span className="navbar-user-info">
              <strong>{user.full_name}</strong>
              <span className="badge role-badge">{ROLE_LABELS[user.role] || user.role}</span>
            </span>
            <span className="menu-chevron" aria-hidden="true">
              ▾
            </span>
          </summary>
          <div className="user-dropdown">
            {isCandidate && (
              <>
                <button type="button" onClick={() => onTabChange("resume")}>
                  CV của tôi
                </button>
                <button type="button" onClick={() => onTabChange("applications")}>
                  Đơn ứng tuyển
                </button>
              </>
            )}
            <button type="button" onClick={onLogout}>
              Đăng xuất
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
