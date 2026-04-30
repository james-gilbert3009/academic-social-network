import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function requestToken(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await api.post("/api/auth/forgot-password", { email });
      setResetToken(res.data.resetToken || "");
      setSuccess("Reset token generated. Copy it below and set a new password.");
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Could not generate reset token");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await api.post("/api/auth/reset-password", {
        token: resetToken,
        newPassword,
      });
      setSuccess(res.data.message || "Password updated. Redirecting to login...");
      setTimeout(() => navigate("/login", { replace: true }), 1500);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Could not reset password");
    } finally {
      setLoading(false);
    }
  }

  function toggleShowPassword(e) {
    e.preventDefault();
    setShowPassword((v) => !v);
  }

  return (
    <div className="page">
      <h1>Forgot password</h1>

      {/* Step 1: request a reset token by email */}
      <form className="card form" onSubmit={requestToken}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@uni.edu"
          />
        </label>

        <button className="btn btnPrimary" type="submit" disabled={loading}>
          {loading ? "Working..." : "Send reset token"}
        </button>
      </form>

      {/* Step 2: appears once a token has been issued */}
      {resetToken ? (
        <form className="card form" onSubmit={resetPassword} style={{ marginTop: "16px" }}>
          <label className="field">
            <span>Reset token (demo: shown here instead of emailed)</span>
            <input
              value={resetToken}
              onChange={(e) => setResetToken(e.target.value)}
            />
          </label>

          <div className="field">
            <span>New password</span>
            <div className="passwordRow" style={{ display: "flex", gap: "8px" }}>
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 6 characters"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn"
                onClick={toggleShowPassword}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button className="btn btnPrimary" type="submit" disabled={loading}>
            {loading ? "Updating..." : "Update password"}
          </button>
        </form>
      ) : null}

      {success ? <div className="alert">{success}</div> : null}
      {error ? <div className="alert alertError">{error}</div> : null}

      <p className="muted">
        Remembered it? <Link to="/login">Back to login</Link>
      </p>
    </div>
  );
}
