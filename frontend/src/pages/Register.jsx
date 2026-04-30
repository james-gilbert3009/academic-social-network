import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setAuthToken } from "../api";

export default function Register() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  async function submit(e) {
    e.preventDefault();
    setStatus("");

    try {
      const res = await api.post("/api/auth/register", {
        name: form.name,
        email: form.email,
        password: form.password,
      });

      const token = res.data.token;
      localStorage.setItem("token", token);
      setAuthToken(token);
      navigate("/profile-setup", { replace: true });
    } catch (err) {
      setStatus(err?.response?.data?.message || err?.message || "Registration failed");
    }
  }

  return (
    <div className="page">
      <h1>Register</h1>

      <form className="card form" onSubmit={submit}>
        <label className="field">
          <span>Name</span>
          <input
            autoComplete="name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Jane Doe"
          />
        </label>

        <label className="field">
          <span>Email</span>
          <input
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="you@uni.edu"
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="Min 6 characters"
          />
        </label>

        <button className="btn btnPrimary" type="submit">
          Create account
        </button>

        {status ? <div className="alert alertError">{status}</div> : null}
      </form>

      <p className="muted">
        Already have an account? <Link to="/login">Login</Link>
      </p>
    </div>
  );
}

