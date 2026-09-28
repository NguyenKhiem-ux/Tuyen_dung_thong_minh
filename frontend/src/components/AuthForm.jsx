import React, { useState } from "react";
import api from "../api.js";
import { Alert } from "./Common.jsx";

export default function AuthForm({ onSuccess, error, setError, initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode); // login | register
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "candidate", phone: "" });
  const [busy, setBusy] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data =
        mode === "login"
          ? await api.login({ email: form.email, password: form.password })
          : await api.register(form);
      onSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">SR</div>
          <div>
            <h1>Smart Recruitment AI</h1>
            <p>Nền tảng tuyển dụng thông minh ứng dụng AI</p>
          </div>
        </div>

        <div className="auth-tabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            Đăng nhập
          </button>
          <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
            Đăng ký
          </button>
        </div>

        <Alert>{error}</Alert>

        <form onSubmit={submit} className="auth-form">
          {mode === "register" && (
            <>
              <label>Họ và tên</label>
              <input required value={form.full_name} onChange={(e) => update("full_name", e.target.value)} />

              <label>Bạn là</label>
              <div className="role-toggle">
                <button
                  type="button"
                  className={form.role === "candidate" ? "active" : ""}
                  onClick={() => update("role", "candidate")}
                >
                  Ứng viên
                </button>
                <button
                  type="button"
                  className={form.role === "recruiter" ? "active" : ""}
                  onClick={() => update("role", "recruiter")}
                >
                  Nhà tuyển dụng
                </button>
              </div>

              <label>Số điện thoại (tùy chọn)</label>
              <input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            </>
          )}

          <label>Email</label>
          <input required type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />

          <label>Mật khẩu</label>
          <input
            required
            type="password"
            minLength={6}
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
          />

          <button type="submit" className="btn-primary btn-block" disabled={busy}>
            {busy ? "Đang xử lý..." : mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
          </button>
        </form>

        <p className="auth-hint">
          Tài khoản demo: <code>candidate1@demo.ai</code> / <code>recruiter1@demo.ai</code> / mật khẩu{" "}
          <code>Password123</code> (chạy <code>seed_demo.py</code> để tạo dữ liệu mẫu).
        </p>
      </div>
    </div>
  );
}
