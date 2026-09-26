import React from "react";

const STATUS_LABELS = {
  applied: "Đã ứng tuyển",
  screening: "Sàng lọc",
  interview: "Phỏng vấn",
  offer: "Đề nghị",
  hired: "Đã tuyển",
  rejected: "Từ chối",
};

const STATUS_ORDER = ["applied", "screening", "interview", "offer", "hired", "rejected"];

export function StatusBadge({ status }) {
  return <span className={`badge status-${status}`}>{STATUS_LABELS[status] || status}</span>;
}

export function StatusSelect({ value, onChange, disabled }) {
  return (
    <select className="status-select" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {STATUS_ORDER.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

export function ScoreBar({ label, value, color = "#6366f1" }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="score-bar-row">
      <div className="score-bar-label">
        <span>{label}</span>
        <span>{pct.toFixed(1)}%</span>
      </div>
      <div className="score-bar-track">
        <div className="score-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function Card({ title, subtitle, right, children, className = "" }) {
  return (
    <div className={`card ${className}`}>
      {(title || right) && (
        <div className="card-header">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.key} className={`tab ${active === t.key ? "tab-active" : ""}`} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>;
}

export function Alert({ type = "error", children }) {
  if (!children) return null;
  return <div className={`alert alert-${type}`}>{children}</div>;
}

export function Spinner() {
  return <div className="spinner">Đang tải...</div>;
}

export { STATUS_LABELS, STATUS_ORDER };
