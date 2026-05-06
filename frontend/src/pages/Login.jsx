import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setAuthToken } from "../api";

export default function Login() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ identifier: "", password: "" });

  async function submit(e) {
    e.preventDefault();
    setStatus("");

    try {
      const res = await api.post("/api/auth/login", {
        identifier: form.identifier,
        password: form.password,
      });

      const token = res.data.token;
      localStorage.setItem("token", token);
      setAuthToken(token);
      navigate("/feed", { replace: true });
    } catch (err) {
      setStatus(err?.response?.data?.message || err?.message || "Login failed");
    }
  }

  return (
    <div className="page page-container auth-page">
      <header className="auth-brand">
        <span className="brand-mark">TSI CONNECT</span>
        <p className="brand-tagline">Academic networking platform</p>
      </header>

      <form className="card form auth-card" onSubmit={submit}>
        <h1 style={{ marginBottom: 16 }}>Sign in</h1>

        <label className="field">
          <span>Email or username</span>
          <input
            autoComplete="username"
            value={form.identifier}
            onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))}
            placeholder="you@tsi.lv or username"
          />
        </label>

        <label className="field">
          <span>Password</span>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Your password"
              style={{ flex: 1 }}
            />
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        <p className="muted" style={{ marginTop: "-4px" }}>
          <Link to="/forgot-password">Forgot password?</Link>
        </p>

        <button className="primary-button" type="submit">
          Sign in
        </button>

        {status ? <div className="alert alertError">{status}</div> : null}
      </form>

      <p className="muted" style={{ textAlign: "center" }}>
        No account? <Link to="/register">Create one</Link>
      </p>
    </div>
  );
}
