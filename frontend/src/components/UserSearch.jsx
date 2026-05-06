import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../api";
import { searchUsers } from "../api/users";
import RoleBadge from "./RoleBadge";
import { FaFilter, FaSearch } from "react-icons/fa";

function profileImageSrc(profileImage) {
  if (!profileImage) return null;
  if (String(profileImage).startsWith("/uploads")) return `${API_BASE_URL}${profileImage}`;
  return profileImage;
}

export default function UserSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const lastRequestIdRef = useRef(0);
  const inputRef = useRef(null);

  const trimmed = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    if (!trimmed) {
      setUsers([]);
      setError("");
      setLoading(false);
      return;
    }

    const requestId = ++lastRequestIdRef.current;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const res = await searchUsers(trimmed, role);
        if (lastRequestIdRef.current !== requestId) return;
        setUsers(res.data?.users || []);
      } catch (err) {
        if (lastRequestIdRef.current !== requestId) return;
        setError(err?.response?.data?.message || err?.message || "Search failed");
        setUsers([]);
      } finally {
        if (lastRequestIdRef.current === requestId) setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(handle);
  }, [trimmed, role]);

  function openProfile(userId) {
    if (!userId) return;
    setQuery("");
    setUsers([]);
    navigate(`/profile/${userId}`);
  }

  function clearSearch() {
    setQuery("");
    setUsers([]);
    setError("");
    setLoading(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div style={{ position: "relative", minWidth: 220, maxWidth: 420, flex: "1 1 300px" }}>
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 12,
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted)",
          pointerEvents: "none",
        }}
      >
        <FaSearch size={14} />
      </span>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search users..."
        aria-label="Search users"
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "10px 170px 10px 38px",
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text-h)",
          font: "14px/1.2 system-ui",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 6,
          paddingRight: 6,
        }}
      >
        <span
          aria-hidden="true"
          title="Role filter"
          style={{
            width: 28,
            height: 28,
            display: "grid",
            placeItems: "center",
            borderRadius: 8,
            color: "var(--text-h)",
            opacity: 0.9,
          }}
        >
          <FaFilter size={14} />
        </span>

        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label="Filter by role"
          style={{
            height: 32,
            padding: "0 8px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text-h)",
            font: "13px/1.2 system-ui",
          }}
        >
          <option value="all">All roles</option>
          <option value="student">Student</option>
          <option value="lecturer">Lecturer</option>
          <option value="professor">Professor</option>
        </select>
      </div>

      {query ? (
        <button
          type="button"
          className="btn"
          onClick={clearSearch}
          aria-label="Clear search"
          title="Clear"
          style={{
            position: "absolute",
            top: 6,
            right: 140,
            width: 32,
            height: 32,
            padding: 0,
            borderRadius: 10,
            display: "grid",
            placeItems: "center",
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      ) : null}

      {trimmed ? (
        <div
          className="card"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            zIndex: 30,
            padding: 10,
            maxHeight: 320,
            overflow: "auto",
          }}
        >
          {loading ? <div className="muted">Searching...</div> : null}
          {error ? <div className="alert alertError">{error}</div> : null}

          {!loading && !error && users.length === 0 ? (
            <div className="emptyState emptyState--subtle">No users found</div>
          ) : null}

          {!loading && !error
            ? users.map((u) => {
                const avatar =
                  profileImageSrc(u.profileImage) ||
                  `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(
                    u?.name || u?.username || "User"
                  )}`;
                const subtitleParts = [];
                if (u?.faculty) subtitleParts.push(u.faculty);
                if (u?.program) subtitleParts.push(u.program);
                const subtitle = subtitleParts.filter(Boolean).join(" • ");

                return (
                  <button
                    key={u._id}
                    type="button"
                    className="btn"
                    onClick={() => openProfile(u._id)}
                    style={{
                      width: "100%",
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      justifyContent: "flex-start",
                      padding: "10px 10px",
                      marginBottom: 8,
                      textAlign: "left",
                    }}
                  >
                    <img
                      src={avatar}
                      alt=""
                      width={36}
                      height={36}
                      style={{
                        borderRadius: "50%",
                        objectFit: "cover",
                        flex: "0 0 auto",
                        background: "var(--card)",
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          color: "var(--text-h)",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <span>{u?.name || u?.username || "User"}</span>
                        <RoleBadge role={u?.role} />
                      </div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        @{u?.username || "user"}
                        {subtitle ? ` · ${subtitle}` : ""}
                      </div>
                    </div>
                  </button>
                );
              })
            : null}
        </div>
      ) : null}
    </div>
  );
}

