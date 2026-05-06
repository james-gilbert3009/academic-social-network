import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setAuthToken } from "../api";

const ROLE_OPTIONS = [
  {
    value: "student",
    title: "Student",
    hint: "Courses, study groups, and academic discussions.",
  },
  {
    value: "lecturer",
    title: "Lecturer",
    hint: "Teaching staff and module organizers.",
  },
  {
    value: "professor",
    title: "Professor",
    hint: "Senior academic roles and research leadership.",
  },
];

export default function Register() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    role: "student",
    birthdate: "",
  });

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleShowPassword(e) {
    // Prevent the browser from shifting focus away from the input when the
    // toggle button is clicked, so typing keeps working after toggling.
    e.preventDefault();
    setShowPassword((v) => !v);
  }

  async function submit(e) {
    e.preventDefault();
    setStatus("");

    try {
      const res = await api.post("/api/auth/register", {
        name: form.name,
        username: form.username,
        email: form.email,
        password: form.password,
        role: form.role,
        birthdate: form.birthdate,
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
    <div className="page page-container auth-page auth-page--wide">
      <header className="auth-brand">
        <span className="brand-mark">TSI CONNECT</span>
        <p className="brand-tagline">Academic networking platform</p>
      </header>

      <form className="card form auth-card" onSubmit={submit}>
        <h1 style={{ marginBottom: 16 }}>Create account</h1>

        <label className="field">
          <span>Name</span>
          <input
            autoComplete="name"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder="Jane Doe"
          />
        </label>

        <label className="field">
          <span>Username</span>
          <input
            autoComplete="username"
            value={form.username}
            onChange={(e) => updateField("username", e.target.value)}
            placeholder="janedoe"
          />
        </label>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="you@tsi.lv"
          />
        </label>

        <div className="field">
          <span className="section-title" style={{ marginBottom: 10 }}>
            Your role
          </span>
          <div className="role-picker" role="radiogroup" aria-label="Your role">
            {ROLE_OPTIONS.map((opt) => (
              <label key={opt.value} className="role-option">
                <input
                  type="radio"
                  name="role"
                  value={opt.value}
                  checked={form.role === opt.value}
                  onChange={() => updateField("role", opt.value)}
                />
                <span className="role-option__title">{opt.title}</span>
                <span className="role-option__hint">{opt.hint}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Birth date</span>
          <input
            type="date"
            value={form.birthdate}
            onChange={(e) => updateField("birthdate", e.target.value)}
          />
        </label>

        {/*
          Use a div (not <label>) here so clicking the Show/Hide button never
          gets redirected as a label-click to the password input. The styling
          stays the same because we keep the "field" class.
        */}
        <div className="field">
          <span>Password</span>
          <div className="passwordRow" style={{ display: "flex", gap: "8px" }}>
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => updateField("password", e.target.value)}
              placeholder="Min 6 characters"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="secondary-button"
              onClick={toggleShowPassword}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <button className="primary-button" type="submit">
          Create account
        </button>

        {status ? <div className="alert alertError">{status}</div> : null}
      </form>

      <p className="muted" style={{ textAlign: "center" }}>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}
