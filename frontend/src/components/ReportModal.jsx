import { useMemo, useState } from "react";
import { createReport } from "../api/reports";

const REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "inappropriate_content", label: "Inappropriate content" },
  { value: "misinformation", label: "False or misleading information" },
  { value: "fake_profile", label: "Fake profile" },
  { value: "other", label: "Other" },
];

export default function ReportModal({
  isOpen,
  targetType,
  targetLabel,
  postId,
  commentId,
  reportedUserId,
  conversationId,
  onClose,
  onSuccess,
}) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => Boolean(reason) && !busy, [reason, busy]);

  if (!isOpen) return null;

  async function submit(e) {
    e.preventDefault();
    if (!reason) {
      setError("Please select a reason.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload =
        targetType === "post"
          ? { targetType: "post", postId, reason, details }
          : targetType === "comment"
            ? { targetType: "comment", postId, commentId, reason, details }
            : { targetType: "user", reportedUserId, conversationId, reason, details };

      const res = await createReport(payload);
      onSuccess?.(res?.data?.report);
      onClose?.();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to submit report";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
      <div className="modalCard" style={{ textAlign: "left", maxWidth: 560 }}>
        <div className="topbar" style={{ marginBottom: 10 }}>
          <h2 id="report-modal-title" style={{ marginBottom: 0 }}>
            Report
          </h2>
          <button
            className="secondary-button btn-compact"
            type="button"
            onClick={onClose}
            aria-label="Close report modal"
            disabled={busy}
          >
            Close
          </button>
        </div>

        <div className="muted" style={{ marginBottom: 10 }}>
          Reporting: <strong style={{ color: "var(--text-h)" }}>{targetLabel || "content"}</strong>
        </div>

        {error ? <div className="alert alertError" style={{ marginBottom: 12 }}>{error}</div> : null}

        <form onSubmit={submit}>
          <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            <span style={{ color: "var(--text-h)", fontWeight: 700 }}>Reason</span>
            <select
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
              aria-label="Report reason"
            >
              <option value="">Select a reason…</option>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            <span style={{ color: "var(--text-h)", fontWeight: 700 }}>Details (optional)</span>
            <textarea
              className="input"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              disabled={busy}
              rows={4}
              maxLength={1000}
              aria-label="Report details"
              style={{ resize: "vertical", padding: 10 }}
              placeholder="Add extra context (optional)…"
            />
          </label>

          <div className="actionsRow">
            <button className="primary-button btn-compact" type="submit" disabled={!canSubmit}>
              {busy ? "Submitting…" : "Submit report"}
            </button>
            <button className="secondary-button btn-compact" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

