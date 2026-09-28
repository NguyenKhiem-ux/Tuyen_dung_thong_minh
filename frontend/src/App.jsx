import React, { useEffect, useState } from "react";
import api, { setToken, setStoredUser, getToken } from "./api.js";
import AuthForm from "./components/AuthForm.jsx";
import Navbar from "./components/Navbar.jsx";
import CandidateDashboard from "./components/CandidateDashboard.jsx";
import RecruiterDashboard from "./components/RecruiterDashboard.jsx";
import AdminDashboard from "./components/AdminDashboard.jsx";
import HomePage, { Footer } from "./components/HomePage.jsx";
import { JobDetailPage, JobsPage } from "./components/PublicJobs.jsx";
import { candidateRoutes, dashboardPath, Link, loginPath, navigate, Redirect, useLocation } from "./navigation.jsx";
import "./public.css";

export default function App() {
  const [user, setUser] = useState(null);
  const location = useLocation();
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function bootstrap() {
      if (getToken()) {
        try {
          const me = await api.me();
          if (!alive) return;
          setUser(me);
          setStoredUser(me);
        } catch {
          if (!alive) return;
          setToken(null);
          setStoredUser(null);
        }
      }
      if (alive) setLoading(false);
    }
    bootstrap();
    return () => {
      alive = false;
    };
  }, []);

  function handleAuthSuccess(data) {
    setToken(data.access_token);
    setStoredUser(data.user);
    setUser(data.user);
    setError("");
    navigate(authDestination(), true);
  }

  function authDestination() {
    const redirect = location.searchParams.get("redirect") || "/";
    return redirect.startsWith("/") && !redirect.startsWith("//")
      ? redirect
      : "/";
  }

  function handleLogout() {
    setToken(null);
    setStoredUser(null);
    setUser(null);
    setError("");
    navigate("/", true);
  }

  const candidateTab = Object.keys(candidateRoutes).find((tab) => candidateRoutes[tab] === path);
  const requiredRole =
    candidateTab && candidateTab !== "jobs"
      ? "candidate"
      : path === "/recruiter/dashboard"
        ? "recruiter"
        : path === "/admin/dashboard"
          ? "admin"
          : null;
  const authPage = path === "/login" || path === "/register";
  const jobId = path.match(/^\/jobs\/(\d+)$/)?.[1];
  let content;
  if (path === "/") content = <HomePage user={user} />;
  else if (path === "/jobs") content = <JobsPage search={location.search} user={user} />;
  else if (jobId) content = <JobDetailPage id={jobId} user={user} authLoading={loading} />;
  else if (loading)
    content = (
      <div className="public-loading" role="status">
        Đang tải...
      </div>
    );
  else if (authPage)
    content = user ? (
      <Redirect to={authDestination()} />
    ) : (
      <AuthForm
        key={path}
        initialMode={path === "/register" ? "register" : "login"}
        onSuccess={handleAuthSuccess}
        error={error}
        setError={setError}
      />
    );
  else if (requiredRole && !user) content = <Redirect to={loginPath(path)} />;
  else if (requiredRole && user.role !== requiredRole)
    content = (
      <div className="public-loading">
        <p>Trang này không dành cho vai trò của bạn.</p>
        <Link className="home-button" href={dashboardPath(user)}>
          Bảng điều khiển
        </Link>
      </div>
    );
  else if (requiredRole)
    content = (
      <main className="app-main">
        {requiredRole === "candidate" && (
          <CandidateDashboard
            user={user}
            activeTab={candidateTab}
            onTabChange={(tab) => navigate(candidateRoutes[tab])}
          />
        )}
        {requiredRole === "recruiter" && <RecruiterDashboard />}
        {requiredRole === "admin" && <AdminDashboard />}
      </main>
    );
  else
    content = (
      <main className="public-loading">
        <h1>Không tìm thấy trang</h1>
        <Link className="home-button" href="/">
          Về trang chủ
        </Link>
      </main>
    );

  return (
    <div className="app-shell">
      <Navbar user={user} loading={loading} onLogout={handleLogout} path={path} />
      {content}
      {(path === "/" || path === "/jobs" || jobId) && <Footer user={user} />}
    </div>
  );
}
