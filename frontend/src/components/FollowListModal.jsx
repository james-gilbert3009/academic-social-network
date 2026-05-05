import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../api";

function profileImageSrc(profileImage) {
  if (!profileImage) return null;
  if (profileImage.startsWith("/uploads")) return `${API_BASE_URL}${profileImage}`;
  return profileImage;
}

function displaySubline(user) {
  const faculty = String(user?.faculty || "").trim();
  const program = String(user?.program || "").trim();
  if (faculty && program) return `${faculty} • ${program}`;
  if (faculty) return faculty;
  if (program) return program;
  return "";
}

export default function FollowListModal({
  open,
  title,
  users,
  loading,
  onClose,
  me,
  onToggleFollow,
  busyUserIds,
}) {
  const navigate = useNavigate();

  const safeUsers = useMemo(() => (Array.isArray(users) ? users : []), [users]);
  const busySet = useMemo(() => new Set(busyUserIds || []), [busyUserIds]);

  if (!open) return null;

  const meFollowing = Array.isArray(me?.following) ? me.following.map((id) => String(id)) : [];
  const meFollowers = Array.isArray(me?.followers) ? me.followers.map((id) => String(id)) : [];

  function relationshipLabel(userId) {
    if (!userId || !me?._id) return "";
    if (String(userId) === String(me._id)) return "";

    const isFollowing = meFollowing.includes(String(userId));
    const isFollower = meFollowers.includes(String(userId));
    const isFriend = Boolean(isFollowing && isFollower);

    if (isFriend) return "Friends";
    if (isFollower && !isFollowing) return "Follow Back";
    if (isFollowing) return "Following";
    return "Follow";
  }

  function handleOpenProfile(userId) {
    if (!userId) return;
    onClose?.();
    navigate(`/profile/${userId}`);
  }

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()} style={{ textAlign: "left" }}>
        <div className="topbar" style={{ marginBottom: 10 }}>
          <h2 style={{ marginBottom: 0 }}>{title || "Users"}</h2>
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {loading ? <div className="muted">Loading...</div> : null}

        {!loading && safeUsers.length === 0 ? (
          <div className="emptyState emptyState--subtle">No users to show.</div>
        ) : null}

        {!loading && safeUsers.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {safeUsers.map((u) => {
              const avatar =
                profileImageSrc(u?.profileImage) ||
                `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(
                  u?.name || "User"
                )}`;
              const sub = displaySubline(u);
              const label = relationshipLabel(u?._id);
              const showAction =
                Boolean(onToggleFollow) && Boolean(me?._id) && Boolean(label) && u?._id;
              const isBusy = busySet.has(String(u?._id));

              return (
                <button
                  key={u._id}
                  type="button"
                  className="btn"
                  onClick={() => handleOpenProfile(u._id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    textAlign: "left",
                    padding: 12,
                    width: "100%",
                  }}
                >
                  <img
                    src={avatar}
                    alt={u?.name || "User"}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 999,
                      objectFit: "cover",
                      border: "1px solid var(--border)",
                      flexShrink: 0,
                    }}
                  />

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 650, color: "var(--text-h)" }}>
                        {u?.name || "User"}
                      </div>
                      {u?.role ? <span className="chip">{u.role}</span> : null}
                    </div>
                    <div className="muted" style={{ marginTop: 2 }}>
                      @{u?.username || "unknown"}
                      {sub ? <span> • {sub}</span> : null}
                    </div>
                  </div>

                  {showAction ? (
                    <button
                      type="button"
                      className={`btn ${label === "Follow" || label === "Follow Back" ? "btnPrimary" : ""}`}
                      disabled={isBusy}
                      aria-busy={isBusy ? "true" : "false"}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFollow?.(u._id, label);
                      }}
                      style={{ flexShrink: 0 }}
                    >
                      {isBusy ? "..." : label}
                    </button>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

