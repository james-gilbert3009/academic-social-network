import { useEffect, useMemo, useState } from "react";

import { getProfile } from "../api/profile";
import {
  deleteAdminPost,
  getAdminPostById,
  getAdminStats,
  listAdminPosts,
  listAdminUsers,
  updateAdminReportStatus,
  updateAdminUserRole,
} from "../api/admin";
import { getAdminReports } from "../api/reports";
import AppHeader from "../components/AppHeader";
import ConfirmDialog from "../components/ConfirmDialog";
import PostDetailsModal from "../components/PostDetailsModal";
import timeAgo from "../utils/timeAgo";

const ROLE_OPTIONS = ["student", "lecturer", "professor", "admin"];
const REPORT_STATUS_OPTIONS = ["open", "reviewed", "dismissed"];

function clampInt(value, fallback, { min = 1, max = 100 } = {}) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function StatCard({ label, value, helper }) {
  return (
    <div className="adminStatCard">
      <div className="adminStatCard__label">{label}</div>
      <div className="adminStatCard__value">{value}</div>
      {helper ? <div className="adminStatCard__helper">{helper}</div> : null}
    </div>
  );
}

export default function AdminDashboard() {
  const [me, setMe] = useState(null);
  const [activeTab, setActiveTab] = useState("overview"); // overview | users | posts | reports

  const [status, setStatus] = useState("");

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [usersQ, setUsersQ] = useState("");
  const [usersRole, setUsersRole] = useState("");
  const [usersPage, setUsersPage] = useState(1);
  const [usersLimit, setUsersLimit] = useState(20);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersPayload, setUsersPayload] = useState({ users: [], total: 0, totalPages: 1 });
  const [roleBusyById, setRoleBusyById] = useState({});

  const [postsQ, setPostsQ] = useState("");
  const [postsPage, setPostsPage] = useState(1);
  const [postsLimit, setPostsLimit] = useState(20);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsPayload, setPostsPayload] = useState({ posts: [], total: 0, totalPages: 1 });
  const [pendingDeletePost, setPendingDeletePost] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [reportsStatus, setReportsStatus] = useState("");
  const [reportsPage, setReportsPage] = useState(1);
  const [reportsLimit, setReportsLimit] = useState(20);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsPayload, setReportsPayload] = useState({ reports: [], total: 0, totalPages: 1 });
  const [reportBusyById, setReportBusyById] = useState({});
  const [reviewPost, setReviewPost] = useState(null);
  const [reviewReportId, setReviewReportId] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  const isAdmin = String(me?.role || "").toLowerCase() === "admin";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getProfile();
        if (cancelled) return;
        setMe(res?.data?.user || null);
      } catch {
        if (!cancelled) setMe(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadStats() {
    setStatsLoading(true);
    setStatus("");
    try {
      const res = await getAdminStats();
      setStats(res?.data || null);
    } catch (err) {
      setStatus(err?.response?.data?.message || err?.message || "Failed to load stats");
    } finally {
      setStatsLoading(false);
    }
  }

  async function loadUsers({ page = usersPage, limit = usersLimit } = {}) {
    setUsersLoading(true);
    setStatus("");
    try {
      const res = await listAdminUsers({ q: usersQ, role: usersRole, page, limit });
      setUsersPayload(res?.data || { users: [], total: 0, totalPages: 1 });
    } catch (err) {
      setStatus(err?.response?.data?.message || err?.message || "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }

  async function loadPosts({ page = postsPage, limit = postsLimit } = {}) {
    setPostsLoading(true);
    setStatus("");
    try {
      const res = await listAdminPosts({ q: postsQ, page, limit });
      setPostsPayload(res?.data || { posts: [], total: 0, totalPages: 1 });
    } catch (err) {
      setStatus(err?.response?.data?.message || err?.message || "Failed to load posts");
    } finally {
      setPostsLoading(false);
    }
  }

  async function loadReports({ page = reportsPage, limit = reportsLimit } = {}) {
    setReportsLoading(true);
    setStatus("");
    try {
      const res = await getAdminReports({ status: reportsStatus, page, limit });
      setReportsPayload(res?.data || { reports: [], total: 0, totalPages: 1 });
    } catch (err) {
      setStatus(err?.response?.data?.message || err?.message || "Failed to load reports");
    } finally {
      setReportsLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    loadStats();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    if (activeTab !== "users") return;
    loadUsers({ page: usersPage, limit: usersLimit });
  }, [isAdmin, activeTab, usersPage, usersLimit]);

  useEffect(() => {
    if (!isAdmin) return;
    if (activeTab !== "posts") return;
    loadPosts({ page: postsPage, limit: postsLimit });
  }, [isAdmin, activeTab, postsPage, postsLimit]);

  useEffect(() => {
    if (!isAdmin) return;
    if (activeTab !== "reports") return;
    loadReports({ page: reportsPage, limit: reportsLimit });
  }, [isAdmin, activeTab, reportsPage, reportsLimit]);

  const overviewCards = useMemo(() => {
    const s = stats || {};
    const openReports = Array.isArray(reportsPayload?.reports)
      ? (reportsPayload.reports || []).filter((r) => r?.status === "open").length
      : 0;
    return [
      { label: "Total users", value: s.usersCount ?? "—" },
      { label: "Total posts", value: s.postsCount ?? "—" },
      { label: "Total comments", value: s.commentsCount ?? "—" },
      { label: "Total messages", value: s.messagesCount ?? "—" },
      { label: "Total reports", value: s.reportsCount ?? "—", helper: openReports ? `${openReports} open on this page` : "" },
    ];
  }, [stats, reportsPayload?.reports]);

  async function handleChangeRole(userId, nextRole) {
    const id = String(userId || "");
    if (!id) return;
    const role = String(nextRole || "").toLowerCase();
    if (!ROLE_OPTIONS.includes(role)) return;

    if (String(me?._id || "") === id && role !== "admin") {
      window.alert("You can't remove your own admin role.");
      return;
    }

    setRoleBusyById((prev) => ({ ...(prev || {}), [id]: true }));
    setStatus("");
    try {
      const res = await updateAdminUserRole(id, role);
      const updated = res?.data?.user;
      setUsersPayload((prev) => {
        const arr = Array.isArray(prev?.users) ? prev.users : [];
        return {
          ...(prev || {}),
          users: arr.map((u) => (String(u?._id) === id ? { ...u, ...(updated || {}) } : u)),
        };
      });
    } catch (err) {
      setStatus(err?.response?.data?.message || err?.message || "Failed to update role");
    } finally {
      setRoleBusyById((prev) => {
        const next = { ...(prev || {}) };
        delete next[id];
        return next;
      });
    }
  }

  function requestDeletePost(post) {
    setPendingDeletePost(post || null);
  }

  function cancelDeletePost() {
    setPendingDeletePost(null);
  }

  async function confirmDeletePost() {
    const post = pendingDeletePost;
    if (!post?._id) return;
    if (deleteBusy) return;

    setDeleteBusy(true);
    setStatus("");
    try {
      await deleteAdminPost(post._id);
      setPendingDeletePost(null);
      await loadPosts({ page: postsPage, limit: postsLimit });
      await loadStats();
    } catch (err) {
      setStatus(err?.response?.data?.message || err?.message || "Failed to delete post");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleUpdateReportStatus(reportId, nextStatus) {
    const id = String(reportId || "");
    const statusNext = String(nextStatus || "").toLowerCase();
    if (!id) return;
    if (!REPORT_STATUS_OPTIONS.includes(statusNext)) return;

    setReportBusyById((prev) => ({ ...(prev || {}), [id]: true }));
    setStatus("");
    try {
      const res = await updateAdminReportStatus(id, statusNext);
      const updated = res?.data?.report;
      setReportsPayload((prev) => {
        const arr = Array.isArray(prev?.reports) ? prev.reports : [];
        return {
          ...(prev || {}),
          reports: arr.map((r) => (String(r?._id) === id ? (updated || r) : r)),
        };
      });
      await loadStats();
    } catch (err) {
      setStatus(err?.response?.data?.message || err?.message || "Failed to update report");
    } finally {
      setReportBusyById((prev) => {
        const next = { ...(prev || {}) };
        delete next[id];
        return next;
      });
    }
  }

  async function openReviewForReport(r) {
    if (!r) return;
    if (r.targetType !== "post") return;

    const reportId = String(r._id || "");
    setReviewReportId(reportId);

    const populatedPost = r?.post && typeof r.post === "object" ? r.post : null;
    if (populatedPost?._id) {
      setReviewPost(populatedPost);
      return;
    }

    const postId = String(r?.post || "");
    if (!postId) {
      window.alert("Post unavailable or deleted.");
      return;
    }

    setReviewBusy(true);
    setStatus("");
    try {
      const res = await getAdminPostById(postId);
      setReviewPost(res?.data?.post || null);
    } catch (err) {
      setStatus(err?.response?.data?.message || err?.message || "Failed to load reported post");
      setReviewPost(null);
    } finally {
      setReviewBusy(false);
    }
  }

  async function deleteReportedPost(postId) {
    if (!postId) return;
    const ok = window.confirm("Delete this post for everyone?");
    if (!ok) return;
    setStatus("");
    try {
      await deleteAdminPost(postId);
      // Mark local report post as unavailable
      setReportsPayload((prev) => {
        const arr = Array.isArray(prev?.reports) ? prev.reports : [];
        return {
          ...(prev || {}),
          reports: arr.map((r) => (r?.post && String(r.post?._id) === String(postId) ? { ...r, post: null } : r)),
        };
      });
      // Optionally mark the active report reviewed
      if (reviewReportId) {
        await handleUpdateReportStatus(reviewReportId, "reviewed");
      }
      setReviewPost(null);
      await loadStats();
    } catch (err) {
      setStatus(err?.response?.data?.message || err?.message || "Failed to delete post");
    }
  }

  function normalizeLimit(raw) {
    return clampInt(raw, 20, { min: 5, max: 100 });
  }

  return (
    <div className="page adminPage">
      <AppHeader activePage="admin" currentUser={me} />

      <div className="adminShell">
        <section className="card adminHeaderCard">
          <div className="topbar" style={{ padding: 0, alignItems: "flex-start" }}>
            <div>
              <h2 style={{ marginBottom: 6 }}>Admin Dashboard</h2>
              <div className="muted">Moderation + basic platform health for the MVP demo.</div>
            </div>
            <div className="actionsRow">
              <button
                type="button"
                className="secondary-button btn-compact"
                onClick={() => {
                  if (activeTab === "overview") loadStats();
                  if (activeTab === "users") loadUsers({ page: usersPage, limit: usersLimit });
                  if (activeTab === "posts") loadPosts({ page: postsPage, limit: postsLimit });
                  if (activeTab === "reports") loadReports({ page: reportsPage, limit: reportsLimit });
                }}
                disabled={!isAdmin}
              >
                Refresh
              </button>
            </div>
          </div>

          {!isAdmin ? (
            <div className="alert alertError" style={{ marginTop: 12 }}>
              Access denied.
            </div>
          ) : null}

          {status ? (
            <div className="alert alertError" style={{ marginTop: 12 }}>
              {status}
            </div>
          ) : null}
        </section>

        <div className="adminTabs" role="tablist" aria-label="Admin tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "overview"}
            className={activeTab === "overview" ? "adminTabBtn adminTabBtn--active" : "adminTabBtn"}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "users"}
            className={activeTab === "users" ? "adminTabBtn adminTabBtn--active" : "adminTabBtn"}
            onClick={() => setActiveTab("users")}
          >
            Users
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "posts"}
            className={activeTab === "posts" ? "adminTabBtn adminTabBtn--active" : "adminTabBtn"}
            onClick={() => setActiveTab("posts")}
          >
            Posts
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "reports"}
            className={activeTab === "reports" ? "adminTabBtn adminTabBtn--active" : "adminTabBtn"}
            onClick={() => setActiveTab("reports")}
          >
            Reports
          </button>
        </div>

        {activeTab === "overview" ? (
          <section className="card">
            <div className="topbar" style={{ padding: 0 }}>
              <h2 style={{ marginBottom: 0 }}>Overview</h2>
              <div className="muted" style={{ fontSize: "0.92rem" }}>
                {statsLoading ? "Loading…" : "Live counts (best-effort)."}
              </div>
            </div>

            <div className="adminStatsGrid" aria-busy={statsLoading ? "true" : "false"}>
              {overviewCards.map((c) => (
                <StatCard key={c.label} label={c.label} value={c.value} helper={c.helper} />
              ))}
            </div>

            {stats?.recentUsers?.length ? (
              <div className="adminTwoCol" style={{ marginTop: 14 }}>
                <div className="adminMiniList">
                  <div className="adminMiniList__title">Recent users</div>
                  <div className="adminMiniList__body">
                    {stats.recentUsers.map((u) => (
                      <div className="adminMiniList__row" key={u._id}>
                        <div className="adminMiniList__main">
                          <div className="adminMiniList__name">{u.name || u.username || "User"}</div>
                          <div className="muted" style={{ fontSize: "0.9rem" }}>
                            @{u.username} · {u.role} · {timeAgo(u.createdAt)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="adminMiniList">
                  <div className="adminMiniList__title">Recent posts</div>
                  <div className="adminMiniList__body">
                    {(stats.recentPosts || []).map((p) => (
                      <div className="adminMiniList__row" key={p._id}>
                        <div className="adminMiniList__main">
                          <div className="adminMiniList__name">
                            {(p.author?.name || p.author?.username || "User") + " — " + (p.category || "general")}
                          </div>
                          <div className="muted" style={{ fontSize: "0.9rem" }}>
                            {String(p.content || "").slice(0, 90)}
                            {String(p.content || "").length > 90 ? "…" : ""} · {timeAgo(p.createdAt)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "users" ? (
          <section className="card">
            <div className="topbar" style={{ padding: 0, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div>
                <h2 style={{ marginBottom: 6 }}>Users</h2>
                <div className="muted">Search and change roles. (Self-demotion is blocked.)</div>
              </div>
              <div className="actionsRow" style={{ flexWrap: "wrap" }}>
                <input
                  className="input adminInput"
                  value={usersQ}
                  placeholder="Search name / username / email…"
                  onChange={(e) => setUsersQ(e.target.value)}
                />
                <select
                  className="input adminInput"
                  value={usersRole}
                  onChange={(e) => setUsersRole(e.target.value)}
                >
                  <option value="">All roles</option>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <select
                  className="input adminInput"
                  value={String(usersLimit)}
                  onChange={(e) => {
                    const next = normalizeLimit(e.target.value);
                    setUsersLimit(next);
                    setUsersPage(1);
                  }}
                  aria-label="Users page size"
                  title="Users per page"
                >
                  {[10, 20, 50].map((n) => (
                    <option key={n} value={String(n)}>
                      {n}/page
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="primary-button btn-compact"
                  onClick={() => {
                    setUsersPage(1);
                    loadUsers({ page: 1, limit: usersLimit });
                  }}
                  disabled={usersLoading}
                >
                  Search
                </button>
              </div>
            </div>

            {usersLoading ? <div className="muted" style={{ marginTop: 12 }}>Loading…</div> : null}

            <div className="adminTableWrap" style={{ marginTop: 12 }}>
              <table className="adminTable">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Profile</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {(usersPayload?.users || []).map((u) => {
                    const busy = Boolean(roleBusyById[String(u?._id)]);
                    const isSelf = Boolean(me?._id && String(me._id) === String(u?._id));
                    return (
                      <tr key={u._id}>
                        <td style={{ fontWeight: 600 }}>{u.name || "—"}</td>
                        <td className="muted">@{u.username || "—"}</td>
                        <td className="muted">{u.email || "—"}</td>
                        <td>
                          <select
                            className="input adminInput adminSelectCompact"
                            value={u.role || "student"}
                            onChange={(e) => handleChangeRole(u._id, e.target.value)}
                            disabled={busy || (isSelf && u.role === "admin")}
                            title={isSelf ? "You cannot remove your own admin role." : "Change role"}
                          >
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="muted">{u.isProfileComplete ? "Complete" : "Incomplete"}</td>
                        <td className="muted">{u.createdAt ? timeAgo(u.createdAt) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="adminPager">
              <div className="muted">
                Total: <strong style={{ color: "var(--text-h)" }}>{usersPayload?.total ?? 0}</strong>
              </div>
              <div className="adminPager__actions">
                <button
                  type="button"
                  className="secondary-button btn-compact"
                  onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                  disabled={usersPage <= 1 || usersLoading}
                >
                  Prev
                </button>
                <div className="muted" style={{ minWidth: 120, textAlign: "center" }}>
                  Page {usersPage} / {usersPayload?.totalPages ?? 1}
                </div>
                <button
                  type="button"
                  className="secondary-button btn-compact"
                  onClick={() =>
                    setUsersPage((p) => Math.min(Number(usersPayload?.totalPages || 1), p + 1))
                  }
                  disabled={usersPage >= Number(usersPayload?.totalPages || 1) || usersLoading}
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "posts" ? (
          <section className="card">
            <div className="topbar" style={{ padding: 0, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div>
                <h2 style={{ marginBottom: 6 }}>Posts</h2>
                <div className="muted">Search by caption content and delete inappropriate posts.</div>
              </div>
              <div className="actionsRow" style={{ flexWrap: "wrap" }}>
                <input
                  className="input adminInput"
                  value={postsQ}
                  placeholder="Search captions…"
                  onChange={(e) => setPostsQ(e.target.value)}
                />
                <select
                  className="input adminInput"
                  value={String(postsLimit)}
                  onChange={(e) => {
                    const next = normalizeLimit(e.target.value);
                    setPostsLimit(next);
                    setPostsPage(1);
                  }}
                  aria-label="Posts page size"
                  title="Posts per page"
                >
                  {[10, 20, 50].map((n) => (
                    <option key={n} value={String(n)}>
                      {n}/page
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="primary-button btn-compact"
                  onClick={() => {
                    setPostsPage(1);
                    loadPosts({ page: 1, limit: postsLimit });
                  }}
                  disabled={postsLoading}
                >
                  Search
                </button>
              </div>
            </div>

            {postsLoading ? <div className="muted" style={{ marginTop: 12 }}>Loading…</div> : null}

            <div className="adminTableWrap" style={{ marginTop: 12 }}>
              <table className="adminTable">
                <thead>
                  <tr>
                    <th>Author</th>
                    <th>Category</th>
                    <th>Caption</th>
                    <th>Likes</th>
                    <th>Comments</th>
                    <th>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(postsPayload?.posts || []).map((p) => (
                    <tr key={p._id}>
                      <td style={{ fontWeight: 600 }}>{p.author?.name || p.author?.username || "—"}</td>
                      <td className="muted">{p.category || "general"}</td>
                      <td style={{ maxWidth: 520 }}>
                        <div className="adminClamp">
                          {String(p.content || "").slice(0, 220)}
                          {String(p.content || "").length > 220 ? "…" : ""}
                        </div>
                      </td>
                      <td className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {p.likesCount ?? 0}
                      </td>
                      <td className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {p.commentsCount ?? 0}
                      </td>
                      <td className="muted">{p.createdAt ? timeAgo(p.createdAt) : "—"}</td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className="danger-button btn-compact"
                          onClick={() => requestDeletePost(p)}
                          disabled={deleteBusy}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="adminPager">
              <div className="muted">
                Total: <strong style={{ color: "var(--text-h)" }}>{postsPayload?.total ?? 0}</strong>
              </div>
              <div className="adminPager__actions">
                <button
                  type="button"
                  className="secondary-button btn-compact"
                  onClick={() => setPostsPage((p) => Math.max(1, p - 1))}
                  disabled={postsPage <= 1 || postsLoading}
                >
                  Prev
                </button>
                <div className="muted" style={{ minWidth: 120, textAlign: "center" }}>
                  Page {postsPage} / {postsPayload?.totalPages ?? 1}
                </div>
                <button
                  type="button"
                  className="secondary-button btn-compact"
                  onClick={() =>
                    setPostsPage((p) => Math.min(Number(postsPayload?.totalPages || 1), p + 1))
                  }
                  disabled={postsPage >= Number(postsPayload?.totalPages || 1) || postsLoading}
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "reports" ? (
          <section className="card">
            <div className="topbar" style={{ padding: 0, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div>
                <h2 style={{ marginBottom: 6 }}>Reports</h2>
                <div className="muted">Simple moderation queue for the MVP demo.</div>
              </div>
              <div className="actionsRow" style={{ flexWrap: "wrap" }}>
                <select
                  className="input adminInput"
                  value={reportsStatus}
                  onChange={(e) => {
                    setReportsStatus(e.target.value);
                    setReportsPage(1);
                  }}
                  aria-label="Report status filter"
                >
                  <option value="">All statuses</option>
                  {REPORT_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  className="input adminInput"
                  value={String(reportsLimit)}
                  onChange={(e) => {
                    const next = normalizeLimit(e.target.value);
                    setReportsLimit(next);
                    setReportsPage(1);
                  }}
                  aria-label="Reports page size"
                  title="Reports per page"
                >
                  {[10, 20, 50].map((n) => (
                    <option key={n} value={String(n)}>
                      {n}/page
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="primary-button btn-compact"
                  onClick={() => {
                    setReportsPage(1);
                    loadReports({ page: 1, limit: reportsLimit });
                  }}
                  disabled={reportsLoading}
                >
                  Refresh
                </button>
              </div>
            </div>

            {reportsLoading ? <div className="muted" style={{ marginTop: 12 }}>Loading…</div> : null}

            <div className="adminTableWrap" style={{ marginTop: 12 }}>
              <table className="adminTable">
                <thead>
                  <tr>
                    <th>Target</th>
                    <th>Reason</th>
                    <th>Reporter</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {(reportsPayload?.reports || []).map((r) => {
                    const busy = Boolean(reportBusyById[String(r?._id)]);
                    const postObj = r?.post && typeof r.post === "object" ? r.post : null;
                    const postAuthor = postObj?.author || null;
                    const postPreview = postObj?.content ? String(postObj.content).slice(0, 90) : "";
                    const postPreviewMore = postObj?.content && String(postObj.content).length > 90 ? "…" : "";
                    return (
                      <tr key={r._id}>
                        <td style={{ maxWidth: 520 }}>
                          {r?.targetType === "post" ? (
                            <div style={{ display: "grid", gap: 6 }}>
                              <div style={{ fontWeight: 800, color: "var(--text-h)" }}>
                                Post{" "}
                                <span className="muted" style={{ fontWeight: 600 }}>
                                  {postAuthor?.username ? `by @${postAuthor.username}` : postAuthor?._id ? "by user" : ""}
                                </span>
                              </div>
                              {postObj ? (
                                <div className="muted">
                                  “{postPreview}
                                  {postPreviewMore}”
                                </div>
                              ) : (
                                <div className="muted">Post unavailable or deleted.</div>
                              )}
                              <div className="actionsRow" style={{ marginTop: 2 }}>
                                <button
                                  type="button"
                                  className="secondary-button btn-compact"
                                  onClick={() => openReviewForReport(r)}
                                  disabled={reviewBusy || !postObj}
                                >
                                  Review
                                </button>
                                {postObj ? (
                                  <button
                                    type="button"
                                    className="danger-button btn-compact"
                                    onClick={() => deleteReportedPost(postObj._id)}
                                    disabled={deleteBusy}
                                    title="Delete reported post"
                                  >
                                    Delete Post
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ) : r?.targetType === "user" ? (
                            <span style={{ fontWeight: 600 }}>
                              User: {r?.reportedUser?.username ? `@${r.reportedUser.username}` : r?.reportedUser?._id || "—"}
                            </span>
                          ) : (
                            <span style={{ fontWeight: 600 }}>
                              Comment: {String(r?.commentId || "").slice(0, 8)}
                            </span>
                          )}
                        </td>
                        <td style={{ maxWidth: 520 }}>
                          <div className="adminClamp">
                            {String(r.reason || "").slice(0, 220)}
                            {String(r.reason || "").length > 220 ? "…" : ""}
                          </div>
                          {r.details ? (
                            <div className="muted" style={{ marginTop: 6 }}>
                              {String(r.details).slice(0, 220)}
                              {String(r.details).length > 220 ? "…" : ""}
                            </div>
                          ) : null}
                        </td>
                        <td className="muted">@{r?.reporter?.username || "—"}</td>
                        <td>
                          <select
                            className="input adminInput adminSelectCompact"
                            value={r.status || "open"}
                            onChange={(e) => handleUpdateReportStatus(r._id, e.target.value)}
                            disabled={busy}
                          >
                            {REPORT_STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="muted">{r.createdAt ? timeAgo(r.createdAt) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="adminPager">
              <div className="muted">
                Total: <strong style={{ color: "var(--text-h)" }}>{reportsPayload?.total ?? 0}</strong>
              </div>
              <div className="adminPager__actions">
                <button
                  type="button"
                  className="secondary-button btn-compact"
                  onClick={() => setReportsPage((p) => Math.max(1, p - 1))}
                  disabled={reportsPage <= 1 || reportsLoading}
                >
                  Prev
                </button>
                <div className="muted" style={{ minWidth: 120, textAlign: "center" }}>
                  Page {reportsPage} / {reportsPayload?.totalPages ?? 1}
                </div>
                <button
                  type="button"
                  className="secondary-button btn-compact"
                  onClick={() =>
                    setReportsPage((p) => Math.min(Number(reportsPayload?.totalPages || 1), p + 1))
                  }
                  disabled={reportsPage >= Number(reportsPayload?.totalPages || 1) || reportsLoading}
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDeletePost)}
        title="Delete post"
        message="Admin will delete this post for everyone. Continue?"
        confirmLabel={deleteBusy ? "Deleting…" : "Delete"}
        cancelLabel="Cancel"
        onCancel={cancelDeletePost}
        onConfirm={confirmDeletePost}
      />

      {reviewPost ? (
        <PostDetailsModal
          post={reviewPost}
          currentUser={me}
          adminMode
          onClose={() => setReviewPost(null)}
          onPostUpdated={(updated) => setReviewPost(updated)}
          onPostDeleted={(deletedId) => {
            setReviewPost(null);
            // Mark row as unavailable locally
            setReportsPayload((prev) => {
              const arr = Array.isArray(prev?.reports) ? prev.reports : [];
              return {
                ...(prev || {}),
                reports: arr.map((r) =>
                  r?.targetType === "post" && r?.post && String(r.post?._id) === String(deletedId)
                    ? { ...r, post: null }
                    : r
                ),
              };
            });
          }}
        />
      ) : null}
    </div>
  );
}

