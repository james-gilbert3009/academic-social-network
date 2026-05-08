import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getNotifications, markAllNotificationsRead, markNotificationRead } from "../api/notifications";
import { Bell, ICON_SIZE } from "../utils/icons";
import ClickableAvatar from "./ClickableAvatar";
import timeAgo from "../utils/timeAgo";

function getNotificationActionText(n) {
  switch (n?.type) {
    case "follow":
      return "followed you";
    case "follow_back":
      return "followed you back";
    case "like":
      return "liked your post";
    case "comment_like":
      return "liked your comment";
    case "comment":
      return "commented on your post";
    case "post":
      return "created a new post";
    case "message_request":
      return "sent you a message request";
    default:
      return "sent you a notification";
  }
}

export default function NotificationsDropdown() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notifications, setNotifications] = useState([]);
  const rootRef = useRef(null);

  const unreadCount = useMemo(
    () => (notifications || []).filter((n) => !n?.isRead).length,
    [notifications]
  );

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getNotifications();
      setNotifications(res.data.notifications || []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch on mount so unread badge shows immediately after login/refresh.
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    // Optional polling while mounted (simple thesis demo approach).
    const intervalMs = 45_000; // 45s (within 30–60s requirement)
    const id = setInterval(() => {
      loadNotifications();
    }, intervalMs);
    return () => clearInterval(id);
  }, [loadNotifications]);

  useEffect(() => {
    function onRefresh() {
      loadNotifications();
    }
    window.addEventListener("notifications:refresh", onRefresh);
    return () => window.removeEventListener("notifications:refresh", onRefresh);
  }, [loadNotifications]);

  useEffect(() => {
    // Still refresh when opening dropdown to show latest list.
    if (!open) return;
    loadNotifications();
  }, [open, loadNotifications]);

  useEffect(() => {
    function onDocClick(e) {
      if (!open) return;
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => (prev || []).map((n) => ({ ...n, isRead: true })));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to mark all as read");
    }
  }

  async function handleNotificationClick(n) {
    if (!n?._id) return;

    // Optimistic UI
    setNotifications((prev) =>
      (prev || []).map((x) => (x._id === n._id ? { ...x, isRead: true } : x))
    );

    try {
      if (!n.isRead) await markNotificationRead(n._id);
    } catch (err) {
      // If it fails, we keep it simple and don't revert.
    }

    const senderId = n?.sender?._id || n?.sender;

    if (n.type === "follow" || n.type === "follow_back" || n.type === "friend") {
      // Tag the navigation with `focusProfileCard` so Profile.jsx scrolls
      // back to the top of the card on arrival — otherwise clicking a
      // notification while a previous Profile view was scrolled into a
      // posts grid would silently land in the new user's posts.
      if (senderId) navigate(`/profile/${senderId}`, { state: { focusProfileCard: true } });
      setOpen(false);
      return;
    }

    if (n.type === "message_request") {
      const conversationId = n?.conversation?._id || n?.conversation;
      if (conversationId) {
        navigate(`/messages/${conversationId}`, { state: { openRequest: true } });
      } else {
        navigate("/messages");
      }
      setOpen(false);
      return;
    }

    // For like/comment/post: open post details directly (global modal host).
    const postId = n?.post?._id || n?.post;
    if (n.type === "like" || n.type === "comment" || n.type === "comment_like" || n.type === "post") {
      if (postId) {
        window.dispatchEvent(
          new CustomEvent("open-post-details", {
            detail: { postId: String(postId) },
          })
        );
        setOpen(false);
        return;
      }
      // Fallback: post missing from notification payload.
      navigate("/feed");
      setOpen(false);
      return;
    }

    // Default fallback behavior.
    navigate("/feed");
    setOpen(false);
  }

  const showBadge = unreadCount > 0;

  return (
    <div ref={rootRef} className="notif">
      <button
        className="btn notif__btn notif__btn--icon"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Notifications"
        title="Notifications"
        data-tooltip="Notifications"
      >
        <Bell size={ICON_SIZE.lg} aria-hidden />
        {showBadge ? (
          <span className="notif__badge">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="notif__menu"
        >
          <div
            className="topbar"
            style={{ padding: 10, borderBottom: "1px solid var(--border)", alignItems: "center" }}
          >
            <strong>Notifications</strong>
            <div className="notif__menuActions">
              <button className="btn" type="button" onClick={loadNotifications} disabled={loading}>
                {loading ? "Loading..." : "Refresh"}
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleMarkAllRead}
                disabled={loading || unreadCount === 0}
              >
                Mark all as read
              </button>
            </div>
          </div>

          {error ? (
            <div className="alert alertError" style={{ margin: 10 }}>
              {error}
            </div>
          ) : null}

          <div className="notif__list">
            {!loading && notifications.length === 0 ? (
              <div className="muted" style={{ padding: 14 }}>
                No notifications yet.
              </div>
            ) : null}

            {(notifications || []).map((n) => {
              const unread = !n?.isRead;
              const senderName = n?.sender?.name || n?.sender?.username || "User";
              const actionText = getNotificationActionText(n);
              return (
                <button
                  key={n._id}
                  type="button"
                  onClick={() => handleNotificationClick(n)}
                  className={`notif__item ${unread ? "notif__item--unread" : ""}`}
                >
                  <div className="notif__itemRow">
                    <ClickableAvatar
                      user={n?.sender}
                      className="notif__avatarWrap"
                      imgClassName="notif__avatar"
                    />

                    <div className="notif__content">
                      <div className="notif__headline">
                        <div className="notif__itemText">
                          {n?.type === "friend" ? (
                            <>
                              <span className="notif__message">You and </span>
                              <strong className="notif__senderName">{senderName}</strong>
                              <span className="notif__message"> are now friends</span>
                            </>
                          ) : (
                            <>
                              <strong className="notif__senderName">{senderName}</strong>{" "}
                              <span className="notif__message">{actionText}</span>
                            </>
                          )}
                        </div>
                        <div className="muted notif__itemTime">{timeAgo(n?.createdAt)}</div>
                      </div>

                      {n?.type === "comment" && n?.commentText ? (
                        <div className="muted notif__commentSnippet">
                          “{n.commentText}”
                        </div>
                      ) : null}
                    </div>

                    <span className="srOnly">{senderName}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

