import React, { useEffect, useRef, useState } from "react";
import {
  Home,
  Search,
  Sparkles,
  Globe,
  FileText,
  Send,
  CalendarDays,
  Building2,
  BriefcaseBusiness,
  Bell,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  X,
} from "lucide-react";
import api from "../api.js";
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
const RECRUITER_NAV = [
  ["overview", "Thống kê", LayoutDashboard],
  ["company", "Công ty", Building2],
  ["jobs", "Tin tuyển dụng", BriefcaseBusiness],
  ["applications", "Ứng viên & ATS", Users],
  ["interviews", "Lịch phỏng vấn", CalendarDays],
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

export default function Navbar({
  user,
  loading,
  onLogout,
  path,
  recruiterTab = "overview",
  onRecruiterTabChange = () => {},
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationError, setNotificationError] = useState("");
  const menu = useRef(null);
  const notificationMenu = useRef(null);
  const header = useRef(null);
  const isCandidate = user?.role === "candidate";
  const isRecruiter = user?.role === "recruiter";
  const canReceiveNotifications = user && (isCandidate || user.role === "recruiter");
  const links = isRecruiter
    ? RECRUITER_NAV.map(([tab, label, Icon]) => ["/recruiter/dashboard", label, Icon, tab])
    : [
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
    if (notificationMenu.current) notificationMenu.current.open = false;
  }
  useEffect(closeMenus, [path, user]);
  useEffect(() => {
    const outside = (event) => {
      if (!header.current?.contains(event.target)) closeMenus();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  useEffect(() => {
    let alive = true;
    if (!canReceiveNotifications) {
      setNotifications([]);
      setUnreadCount(0);
      setNotificationError("");
      return () => {
        alive = false;
      };
    }

    async function loadNotifications() {
      try {
        const [items, unread] = await Promise.all([api.notifications(), api.notificationUnreadCount()]);
        if (!alive) return;
        setNotifications(items);
        setUnreadCount(unread.count);
        setNotificationError("");
      } catch (error) {
        if (alive) setNotificationError(error.message);
      }
    }

    loadNotifications();
    const timer = window.setInterval(loadNotifications, 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [user?.id, user?.role]);

  async function markRead(notification) {
    if (notification.is_read) return;
    try {
      await api.markNotificationRead(notification.id);
      setNotifications((items) =>
        items.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item)),
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      setNotificationError("");
    } catch (error) {
      setNotificationError(error.message);
    }
  }

  async function markAllRead() {
    try {
      await api.markAllNotificationsRead();
      setNotifications((items) => items.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
      setNotificationError("");
    } catch (error) {
      setNotificationError(error.message);
    }
  }

  function notificationHref(notification) {
    if (notification.type === "application_received") return "/recruiter/dashboard";
    if (notification.type.startsWith("interview_")) return "/candidate/interviews";
    if (notification.type.startsWith("application_")) return "/candidate/applications";
    return dashboardPath(user);
  }

  return (
    <header
      className="site-header"
      ref={header}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          const target = menuOpen
            ? header.current.querySelector(".mobile-menu-toggle")
            : notificationMenu.current?.open
              ? notificationMenu.current.querySelector("summary")
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
          <nav className={`site-nav ${isRecruiter ? "recruiter-nav" : ""}`} aria-label="Điều hướng chính">
            {links.map(([href, label, Icon, tab]) => (
              <Link
                key={tab || href}
                href={href}
                onClick={() => {
                  if (tab) onRecruiterTabChange(tab);
                  closeMenus();
                }}
                aria-current={
                  tab
                    ? path === "/recruiter/dashboard" && tab === recruiterTab
                      ? "page"
                      : undefined
                    : href === path || (href === "/jobs" && path.startsWith("/jobs/"))
                      ? "page"
                      : undefined
                }
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
              {canReceiveNotifications && (
                <details
                  ref={notificationMenu}
                  onToggle={(event) => {
                    if (event.currentTarget.open && menu.current) menu.current.open = false;
                  }}
                  style={{ position: "relative" }}
                >
                  <summary
                    aria-label={`Thông báo${unreadCount ? `, ${unreadCount} chưa đọc` : ""}`}
                    style={{
                      alignItems: "center",
                      cursor: "pointer",
                      display: "flex",
                      height: 42,
                      justifyContent: "center",
                      listStyle: "none",
                      position: "relative",
                      width: 42,
                    }}
                  >
                    <Bell size={21} aria-hidden="true" />
                    {unreadCount > 0 && (
                      <span
                        style={{
                          alignItems: "center",
                          background: "#dc2626",
                          borderRadius: 12,
                          color: "white",
                          display: "flex",
                          fontSize: 10,
                          fontWeight: 700,
                          height: 18,
                          justifyContent: "center",
                          minWidth: 18,
                          padding: "0 4px",
                          position: "absolute",
                          right: 0,
                          top: 0,
                        }}
                      >
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </summary>
                  <div
                    style={{
                      background: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: 12,
                      boxShadow: "0 12px 30px rgba(15, 23, 42, 0.16)",
                      maxHeight: "min(70vh, 520px)",
                      overflowY: "auto",
                      position: "absolute",
                      right: 0,
                      top: "calc(100% + 10px)",
                      width: "min(380px, calc(100vw - 32px))",
                      zIndex: 100,
                    }}
                  >
                    <div
                      style={{
                        alignItems: "center",
                        borderBottom: "1px solid #e5e7eb",
                        display: "flex",
                        gap: 12,
                        justifyContent: "space-between",
                        padding: "12px 14px",
                      }}
                    >
                      <strong>Thông báo</strong>
                      <button
                        type="button"
                        disabled={unreadCount === 0}
                        onClick={markAllRead}
                        style={{ background: "none", border: 0, color: "#15803d", cursor: "pointer", padding: 0 }}
                      >
                        Đánh dấu tất cả đã đọc
                      </button>
                    </div>
                    {notificationError && (
                      <p role="alert" style={{ color: "#b91c1c", margin: 0, padding: 14 }}>
                        {notificationError}
                      </p>
                    )}
                    {!notificationError && notifications.length === 0 && (
                      <p style={{ color: "#64748b", margin: 0, padding: 18 }}>Bạn chưa có thông báo nào.</p>
                    )}
                    {notifications.map((notification) => (
                      <article
                        key={notification.id}
                        style={{
                          background: notification.is_read ? "white" : "#F0FFF6",
                          borderBottom: "1px solid #f1f5f9",
                          padding: "12px 14px",
                        }}
                      >
                        <Link
                          href={notificationHref(notification)}
                          onClick={() => {
                            markRead(notification);
                            closeMenus();
                          }}
                          style={{ color: "inherit", display: "block", textDecoration: "none" }}
                        >
                          <strong style={{ display: "block", fontWeight: notification.is_read ? 500 : 700 }}>
                            {notification.title}
                          </strong>
                          <span style={{ display: "block", fontSize: 14, marginTop: 4 }}>{notification.message}</span>
                          <time style={{ color: "#64748b", display: "block", fontSize: 12, marginTop: 6 }}>
                            {new Date(notification.created_at).toLocaleString("vi-VN")}
                          </time>
                        </Link>
                        {!notification.is_read && (
                          <button
                            type="button"
                            onClick={() => markRead(notification)}
                            style={{
                              background: "none",
                              border: 0,
                              color: "#15803d",
                              cursor: "pointer",
                              fontSize: 12,
                              marginTop: 8,
                              padding: 0,
                            }}
                          >
                            Đánh dấu đã đọc
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                </details>
              )}
              <details
                className="site-user-menu"
                ref={menu}
                onToggle={(event) => {
                  if (event.currentTarget.open && notificationMenu.current) notificationMenu.current.open = false;
                }}
              >
                <summary aria-label={`Tài khoản ${user.full_name}`}>
                  <span className="site-avatar">{initials}</span>
                  <span className="site-user-info">
                    <strong title={user.full_name}>{user.full_name}</strong>
                    <span>{ROLE_LABELS[user.role]}</span>
                  </span>
                  <ChevronDown size={16} aria-hidden="true" />
                </summary>
                <div className="site-user-dropdown">
                  <Link
                    href={dashboardPath(user)}
                    onClick={() => {
                      if (isRecruiter) onRecruiterTabChange("overview");
                      closeMenus();
                    }}
                  >
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
                <Link
                  href={dashboardPath(user)}
                  onClick={() => {
                    if (isRecruiter) onRecruiterTabChange("overview");
                    closeMenus();
                  }}
                >
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
