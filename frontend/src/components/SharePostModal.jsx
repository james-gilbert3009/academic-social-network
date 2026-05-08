import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { API_BASE_URL } from "../api";
import { getConnections, searchUsers } from "../api/users";
import { getConversations, sendFirstMessageToUser, sendMessage } from "../api/messages";
import RoleBadge from "./RoleBadge";
import timeAgo from "../utils/timeAgo";

function uploadUrl(p) {
  if (!p) return "";
  const path = String(p);
  if (path.startsWith("/uploads")) return `${API_BASE_URL}${path}`;
  return path;
}

function otherParticipant(conversation, myId) {
  const parts = Array.isArray(conversation?.participants) ? conversation.participants : [];
  const me = String(myId || "");
  return parts.find((p) => String(p?._id || p) !== me) || parts[0] || null;
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export default function SharePostModal({ open, post, me, onClose }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState([]);
  const [recentConversations, setRecentConversations] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [connections, setConnections] = useState([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [selectedConversationIds, setSelectedConversationIds] = useState([]);

  const trimmed = useMemo(() => query.trim(), [query]);
  const isSheet = useMediaQuery("(max-width: 900px)");
  const selectedUserSet = useMemo(() => new Set(selectedUserIds.map(String)), [selectedUserIds]);
  const selectedConversationSet = useMemo(
    () => new Set(selectedConversationIds.map(String)),
    [selectedConversationIds]
  );

  const selectedUsers = useMemo(() => {
    const byId = new Map();
    for (const u of results || []) {
      if (u?._id) byId.set(String(u._id), u);
    }
    for (const u of connections || []) {
      if (u?._id) byId.set(String(u._id), u);
    }
    return selectedUserIds
      .map((id) => byId.get(String(id)))
      .filter(Boolean);
  }, [results, connections, selectedUserIds]);

  const selectedChats = useMemo(() => {
    const byId = new Map((recentConversations || []).map((c) => [String(c._id), c]));
    return selectedConversationIds
      .map((id) => byId.get(String(id)))
      .filter(Boolean);
  }, [recentConversations, selectedConversationIds]);

  const blockedUserIdSet = useMemo(() => {
    const set = new Set();
    for (const c of recentConversations || []) {
      if (!c?.isBlockedByMe) continue;
      const other = otherParticipant(c, me?._id);
      const otherId = other?._id ? String(other._id) : other ? String(other) : "";
      if (otherId) set.add(otherId);
    }
    return set;
  }, [recentConversations, me?._id]);

  useEffect(() => {
    if (!open) return;
    if (!blockedUserIdSet.size) return;
    setSelectedUserIds((prev) => (prev || []).filter((id) => !blockedUserIdSet.has(String(id))));
  }, [blockedUserIdSet, open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setError("");
    setResults([]);
    setSelectedUserIds([]);
    setSelectedConversationIds([]);

    let cancelled = false;
    async function loadRecent() {
      setLoadingRecent(true);
      try {
        const res = await getConversations();
        if (!cancelled) setRecentConversations(res.data.conversations || []);
      } catch (e) {
        if (!cancelled) setRecentConversations([]);
      } finally {
        if (!cancelled) setLoadingRecent(false);
      }
    }

    async function loadConnections() {
      if (!me?._id) return;
      setLoadingConnections(true);
      try {
        const res = await getConnections(me._id);
        if (!cancelled) setConnections(res.data.users || []);
      } catch (e) {
        if (!cancelled) setConnections([]);
      } finally {
        if (!cancelled) setLoadingConnections(false);
      }
    }
    loadRecent();
    loadConnections();
    return () => {
      cancelled = true;
    };
  }, [open, me?._id]);

  useEffect(() => {
    if (!open) return;
    if (!trimmed) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(async () => {
      try {
        const res = await searchUsers(trimmed);
        if (!cancelled) setResults(res.data.users || []);
      } catch (err) {
        if (!cancelled) setResults([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [open, trimmed]);

  if (!open || !post) return null;

  const selectedCount = selectedUserIds.length + selectedConversationIds.length;

  function toggleUser(userId) {
    const id = String(userId || "");
    if (!id) return;
    setSelectedUserIds((prev) => {
      const set = new Set((prev || []).map(String));
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set);
    });
  }

  function toggleConversation(conversationId) {
    const id = String(conversationId || "");
    if (!id) return;
    setSelectedConversationIds((prev) => {
      const set = new Set((prev || []).map(String));
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set);
    });
  }

  async function sendSharedPostToConversation(conversationId) {
    const fd = new FormData();
    fd.append("sharedPost", post._id);
    await sendMessage(conversationId, fd);
  }

  async function sendSharedPostToUser(userId) {
    // Sending a shared post counts as a real message, so we go through the
    // first-message endpoint. The server lazily creates the conversation
    // (and the message_request notification, for non-mutual users) at the
    // moment the post is actually delivered. Opening the share modal alone
    // never creates anything on the server.
    const fd = new FormData();
    fd.append("sharedPost", post._id);
    await sendFirstMessageToUser(userId, fd);
  }

  async function shareSelected() {
    if (!post?._id) return;
    if (selectedCount === 0) return;
    setBusy(true);
    setError("");
    try {
      // Conversations first, then user targets (which may create conversations).
      for (const cid of selectedConversationIds) {
        await sendSharedPostToConversation(cid);
      }
      for (const uid of selectedUserIds) {
        await sendSharedPostToUser(uid);
      }
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to share post");
    } finally {
      setBusy(false);
    }
  }

  const modal = (
    <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Share post">
      <div
        className={isSheet ? "modalCard sharePostModalCard sharePostModalCard--sheet" : "modalCard sharePostModalCard"}
        style={{
          textAlign: "left",
          maxWidth: 520,
          width: "min(520px, 94vw)",
          height: isSheet ? "75svh" : "78svh",
          maxHeight: isSheet ? "75svh" : "78svh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            background: "var(--surface)",
            paddingBottom: 10,
            marginBottom: 12,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ position: "relative", paddingTop: 2 }}>
            <h2 style={{ marginBottom: 0, paddingRight: 52 }}>Share to…</h2>
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              disabled={busy}
              aria-label="Close"
              title="Close"
              style={{ position: "absolute", top: 0, right: 0, width: 40, height: 40 }}
            >
              ×
            </button>
          </div>
        </div>

        <div style={{ padding: "0 0 10px" }}>
          {error ? <div className="alert alertError" style={{ marginBottom: 12 }}>{error}</div> : null}

          <div style={{ marginTop: 4 }}>
            <div className="section-title">Search users</div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users by name or username…"
              className="input"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text-h)",
                font: "16px/1.2 system-ui",
              }}
              disabled={busy}
            />
          </div>

          {selectedCount > 0 ? (
            <div style={{ marginTop: 10 }}>
              <div className="section-title">Selected</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {selectedChats.map((c) => {
                  const other = otherParticipant(c, me?._id) || {};
                  const avatar =
                    uploadUrl(other.profileImage) ||
                    `https://api.dicebear.com/8.x/initials/png?seed=${encodeURIComponent(other.name || "User")}&size=96`;
                  return (
                    <div
                      key={`c-${c._id}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid var(--border)",
                        background: "var(--surface-soft)",
                        maxWidth: "100%",
                      }}
                    >
                      <img
                        src={avatar}
                        alt=""
                        width={18}
                        height={18}
                        style={{ borderRadius: 999, border: "1px solid var(--border)", objectFit: "cover" }}
                      />
                      <span style={{ fontWeight: 700, color: "var(--text-h)", fontSize: 13, whiteSpace: "nowrap" }}>
                        {other.name || other.username || "Chat"}
                      </span>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Remove"
                        onClick={() => toggleConversation(c._id)}
                        disabled={busy}
                        style={{ width: 26, height: 26 }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}

                {selectedUsers.map((u) => {
                  const avatar =
                    uploadUrl(u.profileImage) ||
                    `https://api.dicebear.com/8.x/initials/png?seed=${encodeURIComponent(u.name || "User")}&size=96`;
                  return (
                    <div
                      key={`u-${u._id}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid var(--border)",
                        background: "var(--surface-soft)",
                        maxWidth: "100%",
                      }}
                    >
                      <img
                        src={avatar}
                        alt=""
                        width={18}
                        height={18}
                        style={{ borderRadius: 999, border: "1px solid var(--border)", objectFit: "cover" }}
                      />
                      <span style={{ fontWeight: 700, color: "var(--text-h)", fontSize: 13, whiteSpace: "nowrap" }}>
                        {u.name || u.username || "User"}
                      </span>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Remove"
                        onClick={() => toggleUser(u._id)}
                        disabled={busy}
                        style={{ width: 26, height: 26 }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ overflow: "auto", minHeight: 0, flex: 1, paddingBottom: 8 }}>
          {trimmed ? (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {(results || [])
              .filter((u) => String(u?._id) !== String(me?._id))
              .filter((u) => !blockedUserIdSet.has(String(u?._id)))
              .map((u) => {
              const avatar =
                uploadUrl(u.profileImage) ||
                `https://api.dicebear.com/8.x/initials/png?seed=${encodeURIComponent(u.name || "User")}&size=96`;
              const isSelected = selectedUserSet.has(String(u._id));
              return (
                <button
                  key={u._id}
                  type="button"
                  className="messagesListItem"
                  onClick={() => toggleUser(u._id)}
                  disabled={busy}
                  aria-pressed={isSelected}
                  style={{
                    ...(isSelected
                      ? {
                          borderColor: "color-mix(in srgb, var(--primary) 55%, var(--border))",
                          boxShadow: "var(--shadow)",
                        }
                      : {}),
                  }}
                >
                  <img className="messagesListItem__avatar" src={avatar} alt="" />
                  <div className="messagesListItem__meta">
                    <div className="messagesListItem__top">
                      <div className="messagesListItem__nameRow">
                        <span className="messagesListItem__name">{u.name || "User"}</span>
                        <RoleBadge role={u.role} />
                      </div>
                    </div>
                    <div className="messagesListItem__bottom">
                      <span className="muted">@{u.username || "user"}</span>
                    </div>
                  </div>
                  <span
                    aria-hidden="true"
                    style={{
                      marginLeft: "auto",
                      width: 18,
                      height: 18,
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: isSelected ? "var(--primary)" : "transparent",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontWeight: 900,
                      flexShrink: 0,
                    }}
                  >
                    {isSelected ? "✓" : ""}
                  </span>
                </button>
              );
            })}
            {(results || []).filter((u) => !blockedUserIdSet.has(String(u?._id))).length === 0 ? (
              <div className="muted">No users found.</div>
            ) : null}
            </div>
          ) : (
            <>
            <div style={{ marginTop: 12 }}>
              <div className="section-title">Recent chats</div>
              {loadingRecent ? <div className="muted">Loading…</div> : null}
              {!loadingRecent &&
              (recentConversations || []).filter((c) => {
                const other = otherParticipant(c, me?._id);
                const otherId = other?._id ? String(other._id) : other ? String(other) : "";
                return !blockedUserIdSet.has(otherId);
              }).length === 0 ? (
                <div className="muted">No recent chats.</div>
              ) : null}

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(recentConversations || [])
                  .filter((c) => {
                    const other = otherParticipant(c, me?._id);
                    const otherId = other?._id ? String(other._id) : other ? String(other) : "";
                    return !blockedUserIdSet.has(otherId);
                  })
                  .slice(0, 6)
                  .map((c) => {
                  const other = otherParticipant(c, me?._id) || {};
                  const avatar =
                    uploadUrl(other.profileImage) ||
                    `https://api.dicebear.com/8.x/initials/png?seed=${encodeURIComponent(other.name || "User")}&size=96`;
                  const last = c.lastMessageAt ? timeAgo(c.lastMessageAt) : "";
                  const isSelected = selectedConversationSet.has(String(c._id));
                  return (
                    <button
                      key={c._id}
                      type="button"
                      className="messagesListItem"
                      onClick={() => toggleConversation(c._id)}
                      disabled={busy || Boolean(c.isMessagingBlocked)}
                      title={c.isMessagingBlocked ? "Messaging unavailable" : "Share"}
                      aria-pressed={isSelected}
                      style={{
                        ...(isSelected
                          ? {
                              borderColor: "color-mix(in srgb, var(--primary) 55%, var(--border))",
                              boxShadow: "var(--shadow)",
                            }
                          : {}),
                      }}
                    >
                      <img className="messagesListItem__avatar" src={avatar} alt="" />
                      <div className="messagesListItem__meta">
                        <div className="messagesListItem__top">
                          <div className="messagesListItem__nameRow">
                            <span className="messagesListItem__name">{other.name || "User"}</span>
                            <RoleBadge role={other.role} />
                          </div>
                          <span className="muted" style={{ fontSize: 12 }}>{last}</span>
                        </div>
                        {c.isMessagingBlocked ? (
                          <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                            Messaging unavailable
                          </div>
                        ) : (
                          <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                            @{other.username || "user"}
                          </div>
                        )}
                      </div>
                      <span
                        aria-hidden="true"
                        style={{
                          marginLeft: "auto",
                          width: 18,
                          height: 18,
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          background: isSelected ? "var(--primary)" : "transparent",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "white",
                          fontWeight: 900,
                          flexShrink: 0,
                        }}
                      >
                        {isSelected ? "✓" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="section-title">Connections</div>
              {loadingConnections ? <div className="muted">Loading…</div> : null}
              {!loadingConnections &&
              (connections || []).filter((u) => !blockedUserIdSet.has(String(u?._id))).length === 0 ? (
                <div className="muted">No connections yet.</div>
              ) : null}

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(connections || []).map((u) => {
                  if (String(u?._id) === String(me?._id)) return null;
                  if (blockedUserIdSet.has(String(u?._id))) return null;
                  const avatar =
                    uploadUrl(u.profileImage) ||
                    `https://api.dicebear.com/8.x/initials/png?seed=${encodeURIComponent(u.name || "User")}&size=96`;
                  const isSelected = selectedUserSet.has(String(u._id));
                  return (
                    <button
                      key={u._id}
                      type="button"
                      className="messagesListItem"
                      onClick={() => toggleUser(u._id)}
                      disabled={busy}
                      aria-pressed={isSelected}
                      style={{
                        ...(isSelected
                          ? {
                              borderColor: "color-mix(in srgb, var(--primary) 55%, var(--border))",
                              boxShadow: "var(--shadow)",
                            }
                          : {}),
                      }}
                    >
                      <img className="messagesListItem__avatar" src={avatar} alt="" />
                      <div className="messagesListItem__meta">
                        <div className="messagesListItem__top">
                          <div className="messagesListItem__nameRow">
                            <span className="messagesListItem__name">{u.name || "User"}</span>
                            <RoleBadge role={u.role} />
                          </div>
                        </div>
                        <div className="messagesListItem__bottom">
                          <span className="muted">@{u.username || "user"}</span>
                        </div>
                      </div>
                      <span
                        aria-hidden="true"
                        style={{
                          marginLeft: "auto",
                          width: 18,
                          height: 18,
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          background: isSelected ? "var(--primary)" : "transparent",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "white",
                          fontWeight: 900,
                          flexShrink: 0,
                        }}
                      >
                        {isSelected ? "✓" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            </>
          )}
        </div>

        <div
          style={{
            position: "sticky",
            bottom: 0,
            marginTop: 14,
            paddingTop: 12,
            background: "linear-gradient(to bottom, transparent, var(--surface) 18px)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 0 2px",
            }}
          >
            <div className="muted" style={{ fontSize: 13 }}>
              Selected: <strong style={{ color: "var(--text-h)" }}>{selectedCount}</strong>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="secondary-button btn-compact"
                onClick={() => {
                  setSelectedUserIds([]);
                  setSelectedConversationIds([]);
                }}
                disabled={busy || selectedCount === 0}
              >
                Clear
              </button>
              <button
                type="button"
                className="primary-button btn-compact"
                onClick={shareSelected}
                disabled={busy || selectedCount === 0}
                aria-busy={busy ? "true" : "false"}
              >
                {busy ? "Sharing…" : `Share (${selectedCount})`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Portal prevents issues with `position: fixed` inside transformed ancestors (e.g. mobile feed slider).
  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}

