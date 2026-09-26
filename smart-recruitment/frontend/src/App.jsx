import React, { useEffect, useState } from "react";
import api, { setToken, setStoredUser, getStoredUser } from "./api.js";
import AuthForm from "./components/AuthForm.jsx";
import Navbar from "./components/Navbar.jsx";
import CandidateDashboard from "./components/CandidateDashboard.jsx";
import RecruiterDashboard from "./components/RecruiterDashboard.jsx";
import AdminDashboard from "./components/AdminDashboard.jsx";

export default function App() {
  const [user, setUser] = useState(getStoredUser());
  const [candidateTab, setCandidateTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function bootstrap() {
      if (getStoredUser()) {
        try {
          const me = await api.me();
          setUser(me);
          setStoredUser(me);
        } catch {
          handleLogout();
        }
      }
      setLoading(false);
    }
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleAuthSuccess(data) {
    setToken(data.access_token);
    setStoredUser(data.user);
    setUser(data.user);
    setError("");
  }

  function handleLogout() {
    setToken(null);
    setStoredUser(null);
    setUser(null);
  }

  if (loading) {
    return <div className="center-screen">Đang tải Smart Recruitment AI...</div>;
  }

  if (!user) {
    return <AuthForm onSuccess={handleAuthSuccess} error={error} setError={setError} />;
  }

  return (
    <div className="app-shell">
      <Navbar user={user} onLogout={handleLogout} activeTab={candidateTab} onTabChange={setCandidateTab} />
      <main className="app-main">
        {user.role === "candidate" && <CandidateDashboard user={user} activeTab={candidateTab} onTabChange={setCandidateTab} />}
        {user.role === "recruiter" && <RecruiterDashboard />}
        {user.role === "admin" && <AdminDashboard />}
      </main>
    </div>
  );
}
