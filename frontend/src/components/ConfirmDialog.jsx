import { useState } from "react";

/**
 * In-app confirm modal (replaces window.confirm for destructive actions).
 * Renders above other modals via .confirmDialogOverlay z-index.
 */
export default function ConfirmDialog({
  open,
  title = "Confirm",
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onCancel,
  onConfirm,
}) {
  const [working, setWorking] = useState(false);

  if (!open) return null;

  async function handleConfirm() {
    setWorking(true);
    try {
      await Promise.resolve(onConfirm?.());
    } finally {
      setWorking(false);
    }
  }

  return (
    <div
      className="modalOverlay confirmDialogOverlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={onCancel}
    >
      <div className="modalCard confirmDialogCard" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-dialog-title" style={{ marginTop: 0, marginBottom: 12, fontSize: "1.15rem" }}>
          {title}
        </h2>
        <p style={{ margin: "0 0 20px", lineHeight: 1.45, color: "var(--text-h)" }}>{message}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn" type="button" onClick={onCancel} disabled={working}>
            {cancelLabel}
          </button>
          <button className="btn btnDanger" type="button" onClick={handleConfirm} disabled={working}>
            {working ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
