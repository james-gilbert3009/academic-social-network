import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { API_BASE_URL } from "../api";
import { getBlockedUsers, unblockUser } from "../api/users";
import RoleBadge from "./RoleBadge";
import { ICON_SIZE, Unlock, X } from "../utils/icons";

function profileImageSrc(profileImage) {
  if (!profileImage) return null;
  const value = String(profileImage);
  if (value.startsWith("/uploads")) return `${API_BASE_URL}${value}`;
  return value;
}

/**
 * Settings → "Blocked users".
 *
 * Lists every user the current account has globally blocked (via
 * `User.blockedUsers`) and offers a one-click Unblock per row. After each
 * unblock the list is rebuilt from the server so the source of truth stays
 * with the backend. The chat / notifications surfaces are told to refresh
 * so any open conversation or stale badge updates instantly.
 */
export default function BlockedUsersModal({ open, onClose }) {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyUserIds, setBusyUserIds] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getBlockedUsers();
      setUsers(res?.data?.users || []);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to load blocked users"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, load]);

  // Close on Escape, like the rest of the app's modals.
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleUnblock(user) {
    const userId = user?._id;
    if (!userId) return;
    const key = String(userId);
    setBusyUserIds((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setError("");
    try {
      await unblockUser(userId);
      // Optimistic local removal so the row disappears immediately.
      setUsers((prev) => (prev || []).filter((u) => String(u?._id) !== key));
      // Tell the rest of the app (Messages page, AppHeader badges,
      // notifications) to re-poll so any banners / counts update instantly.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("messages:unread-refresh"));
        window.dispatchEvent(new Event("notifications:refresh"));
      }
      // Reconcile with the server in the background just in case.
      load();
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to unblock user"
      );
    } finally {
      setBusyUserIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  function handleOpenProfile(userId) {
    if (!userId) return;
    onClose?.();
    // Restricted profiles still want to land at the top card so the
    // user immediately sees the "You blocked this user" / "Unblock"
    // surface instead of any stale scroll position.
    navigate(`/profile/${userId}`, { state: { focusProfileCard: true } });
  }

  return (
    <div
      className="modalOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Blocked users"
      onClick={onClose}
    >
      <div
        className="modalCard blockedUsersModal"
        onClick={(e) => e.stopPropagation()}
        style={{ textAlign: "left" }}
      >
        <div className="topbar" style={{ marginBottom: 8 }}>
          <h2 style={{ marginBottom: 0 }}>Blocked users</h2>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close blocked users"
          >
            <X size={ICON_SIZE.md} aria-hidden />
          </button>
        </div>

        <div className="muted" style={{ marginBottom: 12 }}>
          People you have blocked. While blocked you can't see each other's
          profile, posts, or messages. Unblocking lets you both interact again —
          they aren't notified either way.
        </div>

        {loading ? <div className="muted">Loading…</div> : null}
        {error ? (
          <div className="alert alertError" style={{ marginBottom: 10 }}>
            {error}
          </div>
        ) : null}

        {!loading && users.length === 0 && !error ? (
          <div className="emptyState emptyState--subtle">
            You haven't blocked anyone.
          </div>
        ) : null}

        {!loading && users.length > 0 ? (
          <div className="blockedUsersModal__list">
            {users.map((u) => {
              const avatar =
                profileImageSrc(u?.profileImage) ||
                `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(
                  u?.name || u?.username || "User"
                )}`;
              const isBusy = busyUserIds.has(String(u?._id));

              return (
                <div key={u._id} className="blockedUsersModal__row">
                  <button
                    type="button"
                    className="blockedUsersModal__main"
                    onClick={() => handleOpenProfile(u._id)}
                    aria-label={`Open ${u?.name || "user"} profile`}
                  >
                    <img
                      src={avatar}
                      alt=""
                      aria-hidden="true"
                      className="blockedUsersModal__avatar"
                    />
                    <div className="blockedUsersModal__meta">
                      <div className="blockedUsersModal__nameRow">
                        <span className="blockedUsersModal__name">
                          {u?.name || "User"}
                        </span>
                        <RoleBadge role={u?.role} />
                      </div>
                      <div className="muted blockedUsersModal__handle">
                        @{u?.username || "user"}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="outline-button btn-compact btnWithIcon"
                    onClick={() => handleUnblock(u)}
                    disabled={isBusy}
                    aria-busy={isBusy ? "true" : "false"}
                  >
                    <Unlock size={ICON_SIZE.sm} aria-hidden />
                    {isBusy ? "Unblocking…" : "Unblock"}
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
