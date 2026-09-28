import React, { useEffect, useRef, useState } from "react";
import {
  Home,
  Search,
  Sparkles,
  Globe,
  FileText,
  Send,
  CalendarDays,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { candidateRoutes, dashboardPath, Link } from "../navigation.jsx";

const ROLE_LABELS = { candidate: "Ứng viên", recruiter: "Nhà tuyển dụng", admin: "Quản trị viên" };
const PUBLIC_NAV = [
  ["/", "Trang chủ", Home],
  ["/jobs", "Tìm việc", Search],
];
const CANDIDATE_NAV = [
  [candidateRoutes.resume, "CV của tôi", FileText],
  [candidateRoutes.applications, "Đơn ứng tuyển", Send],
  [candidateRoutes.recommendations, "Gợi ý AI", Sparkles],
  [candidateRoutes.interviews, "Lịch phỏng vấn", CalendarDays],
];

export function Brand() {
  return (
    <Link href="/" className="site-brand" aria-label="Smart Recruitment AI - Trang chủ">
      <span className="site-logo">SR</span>
      <span>
        Smart Recruitment <strong>AI</strong>
      </span>
    </Link>
  );
}

export default function Navbar({ user, loading, onLogout, path }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef(null);
  const header = useRef(null);
  const isCandidate = user?.role === "candidate";
  const links = [
    ...PUBLIC_NAV,
    ...(isCandidate
      ? CANDIDATE_NAV
      : [
          ["/#smart-ai", "Smart AI", Sparkles],
          ["/#about", "Về chúng tôi", Globe],
        ]),
  ];
  const initials =
    user?.full_name
      ?.trim()
      .split(/\s+/)
      .slice(-2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "SR";

  function closeMenus() {
    setMenuOpen(false);
    if (menu.current) menu.current.open = false;
  }
  useEffect(closeMenus, [path, user]);
  useEffect(() => {
    const outside = (event) => {
      if (!header.current?.contains(event.target)) closeMenus();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);

  return (
    <header
      className="site-header"
      ref={header}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          const target = menuOpen
            ? header.current.querySelector(".mobile-menu-toggle")
            : menu.current?.querySelector("summary");
          closeMenus();
          target?.focus();
        }
      }}
    >
      <div className="site-container site-header-inner">
        <Brand />
        <button
          className="icon-button mobile-menu-toggle"
          type="button"
          aria-label={menuOpen ? "Đóng menu" : "Mở menu"}
          aria-expanded={menuOpen}
          aria-controls="site-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
        <div className={`site-header-content ${menuOpen ? "is-open" : ""}`} id="site-navigation">
          <nav className="site-nav" aria-label="Điều hướng chính">
            {links.map(([href, label, Icon]) => (
              <Link
                key={href}
                href={href}
                onClick={closeMenus}
                aria-current={href === path || (href === "/jobs" && path.startsWith("/jobs/")) ? "page" : undefined}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>
          {loading ? (
            <span className="header-loading" role="status" aria-label="Đang kiểm tra đăng nhập" />
          ) : user ? (
            <>
              <details className="site-user-menu" ref={menu}>
                <summary aria-label={`Tài khoản ${user.full_name}`}>
                  <span className="site-avatar">{initials}</span>
                  <span className="site-user-info">
                    <strong title={user.full_name}>{user.full_name}</strong>
                    <span>{ROLE_LABELS[user.role]}</span>
                  </span>
                  <ChevronDown size={16} aria-hidden="true" />
                </summary>
                <div className="site-user-dropdown">
                  <Link href={dashboardPath(user)} onClick={closeMenus}>
                    <LayoutDashboard size={17} />
                    Bảng điều khiển
                  </Link>
                  {isCandidate &&
                    CANDIDATE_NAV.slice(0, 2).map(([href, label, Icon]) => (
                      <Link key={href} href={href} onClick={closeMenus}>
                        <Icon size={17} />
                        {label}
                      </Link>
                    ))}
                  <hr />
                  <button
                    type="button"
                    onClick={() => {
                      closeMenus();
                      onLogout();
                    }}
                  >
                    <LogOut size={17} />
                    Đăng xuất
                  </button>
                </div>
              </details>
              <div className="mobile-account">
                <span>
                  {user.full_name} · {ROLE_LABELS[user.role]}
                </span>
                <Link href={dashboardPath(user)} onClick={closeMenus}>
                  <LayoutDashboard size={17} />
                  Bảng điều khiển
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    closeMenus();
                    onLogout();
                  }}
                >
                  <LogOut size={17} />
                  Đăng xuất
                </button>
              </div>
            </>
          ) : (
            <div className="site-auth-actions">
              <Link className="home-button secondary" href="/register" onClick={closeMenus}>
                Đăng ký
              </Link>
              <Link className="home-button" href="/login" onClick={closeMenus}>
                Đăng nhập
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
