import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, API_BASE_URL, setAuthToken } from "../api";

function toCommaList(arr) {
  if (!Array.isArray(arr)) return "";
  return arr.join(", ");
}

function fromCommaList(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Full URL for displaying profileImage (handles /uploads paths from the API). */
function profileImageSrc(profileImage) {
  if (!profileImage) return null;
  if (profileImage.startsWith("/uploads")) {
    return `${API_BASE_URL}${profileImage}`;
  }
  return profileImage;
}

export default function Profile() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [user, setUser] = useState(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [viewImageOpen, setViewImageOpen] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState("");
  const [profilePhotoBusy, setProfilePhotoBusy] = useState(false);

  const [form, setForm] = useState({
    name: "",
    bio: "",
    faculty: "",
    program: "",
    skills: "",
    interests: "",
  });

  const canSave = useMemo(() => !saving, [saving]);

  const photoStatus =
    status === "Profile photo updated." || status === "Profile photo removed.";

  const showSetupReminder = Boolean(user) && user.isProfileComplete !== true;

  const hasProfilePicture = Boolean(user?.profileImage);
  const avatarDisplaySrc =
    profileImageSrc(user?.profileImage) ||
    `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(user?.name || "User")}`;

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    };
  }, [pendingPreviewUrl]);

  async function loadProfile() {
    setStatus("");
    setLoading(true);
    try {
      const res = await api.get("/api/profile/me");
      const u = res.data.user;
      setUser(u);
      setForm({
        name: u?.name || "",
        bio: u?.bio || "",
        faculty: u?.faculty || "",
        program: u?.program || "",
        skills: toCommaList(u?.skills),
        interests: toCommaList(u?.interests),
      });
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to load profile";
      setStatus(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function logout() {
    localStorage.removeItem("token");
    setAuthToken("");
    navigate("/login", { replace: true });
  }

  function closeAvatarMenu() {
    setAvatarMenuOpen(false);
  }

  function openViewProfilePicture() {
    closeAvatarMenu();
    setViewImageOpen(true);
  }

  function closePendingImageModal() {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingPreviewUrl("");
    setPendingImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openFilePickerForAvatar() {
    closeAvatarMenu();
    if (fileInputRef.current) fileInputRef.current.value = "";
    fileInputRef.current?.click();
  }

  function onAvatarFileChange(e) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    const url = URL.createObjectURL(file);
    setPendingImage(file);
    setPendingPreviewUrl(url);
  }

  async function uploadPendingProfileImage() {
    if (!pendingImage || !user) return;
    setProfilePhotoBusy(true);
    setStatus("");
    try {
      const fd = new FormData();
      fd.append("profileImage", pendingImage);
      const res = await api.put("/api/profile/me", fd);
      setUser(res.data.user);
      closePendingImageModal();
      setStatus("Profile photo updated.");
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to upload photo";
      setStatus(msg);
    } finally {
      setProfilePhotoBusy(false);
    }
  }

  async function removeProfilePicture() {
    closeAvatarMenu();
    if (!window.confirm("Remove your profile picture? You can add a new one anytime.")) return;
    if (!user) return;
    setProfilePhotoBusy(true);
    setStatus("");
    try {
      const res = await api.put("/api/profile/me", { removeProfileImage: true });
      setUser(res.data.user);
      setViewImageOpen(false);
      setStatus("Profile photo removed.");
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to remove photo";
      setStatus(msg);
    } finally {
      setProfilePhotoBusy(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    if (!canSave) return;
    setStatus("");
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        bio: form.bio,
        faculty: form.faculty,
        program: form.program,
        skills: fromCommaList(form.skills),
        interests: fromCommaList(form.interests),
      };
      const res = await api.put("/api/profile/me", payload);
      setUser(res.data.user);
      setStatus("Saved.");
      setEditing(false);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to save profile";
      setStatus(msg);
    } finally {
      setSaving(false);
    }
  }

  function startEdit() {
    if (!user) return;
    setStatus("");
    setForm({
      name: user?.name || "",
      bio: user?.bio || "",
      faculty: user?.faculty || "",
      program: user?.program || "",
      skills: toCommaList(user?.skills),
      interests: toCommaList(user?.interests),
    });
    setEditing(true);
  }

  function cancelEdit() {
    if (!user) return;
    setStatus("");
    setForm({
      name: user?.name || "",
      bio: user?.bio || "",
      faculty: user?.faculty || "",
      program: user?.program || "",
      skills: toCommaList(user?.skills),
      interests: toCommaList(user?.interests),
    });
    setEditing(false);
  }

  const overlayStyle = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  };

  function submitProfile(e) {
    e.preventDefault();
    if (!editing) return;
    save(e);
  }

  const menuPanelStyle = {
    position: "absolute",
    top: "100%",
    left: 0,
    marginTop: 8,
    zIndex: 20,
    minWidth: 200,
    background: "var(--card-bg, #fff)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 8,
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
    padding: 4,
  };

  return (
    <div className="page">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        aria-hidden
        onChange={onAvatarFileChange}
      />

      <div className="topbar">
        <h1>My Profile</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" type="button" onClick={() => navigate("/feed")}>
            Back to feed
          </button>
          <button className="btn" type="button" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      {loading ? <div className="muted">Loading...</div> : null}

      {showSetupReminder ? (
        <section className="card">
          <div className="topbar" style={{ padding: 0, alignItems: "flex-start" }}>
            <div>
              <h2 style={{ marginBottom: 6 }}>Complete your profile</h2>
              <div className="muted">
                Your profile is incomplete. Complete your profile to help students and staff know more about you.
              </div>
            </div>
            <div className="actionsRow">
              <button
                className="btn btnPrimary"
                type="button"
                onClick={() => navigate("/profile-setup")}
              >
                Complete profile
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {user ? (
        <>

          <section className="card">
            <div className="row">
              <div style={{ position: "relative", alignSelf: "flex-start" }}>
                <button
                  type="button"
                  onClick={() => setAvatarMenuOpen((v) => !v)}
                  aria-expanded={avatarMenuOpen}
                  aria-haspopup="true"
                  aria-label="Profile picture options"
                  disabled={loading || profilePhotoBusy}
                  style={{
                    padding: 0,
                    margin: 0,
                    border: "none",
                    background: "transparent",
                    cursor: loading ? "default" : "pointer",
                    borderRadius: "50%",
                    display: "block",
                  }}
                >
                  <img className="avatar" src={avatarDisplaySrc} alt="" />
                </button>

                {avatarMenuOpen ? (
                  <>
                    <div
                      role="presentation"
                      style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 15,
                      }}
                      onClick={closeAvatarMenu}
                    />
                    <div style={menuPanelStyle} role="menu">
                      {hasProfilePicture ? (
                        <>
                          <button
                            type="button"
                            className="btn"
                            role="menuitem"
                            onClick={openViewProfilePicture}
                            disabled={profilePhotoBusy}
                            style={{
                              width: "100%",
                              justifyContent: "flex-start",
                              border: "none",
                              borderRadius: 6,
                            }}
                          >
                            View profile picture
                          </button>
                          <button
                            type="button"
                            className="btn"
                            role="menuitem"
                            onClick={openFilePickerForAvatar}
                            disabled={profilePhotoBusy}
                            style={{
                              width: "100%",
                              justifyContent: "flex-start",
                              border: "none",
                              borderRadius: 6,
                            }}
                          >
                            Change profile picture
                          </button>
                          <button
                            type="button"
                            className="btn btnDanger"
                            role="menuitem"
                            onClick={removeProfilePicture}
                            disabled={profilePhotoBusy}
                            style={{
                              width: "100%",
                              justifyContent: "flex-start",
                              border: "none",
                              borderRadius: 6,
                              marginTop: 4,
                            }}
                          >
                            {profilePhotoBusy ? "Working..." : "Remove profile picture"}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btnPrimary"
                          role="menuitem"
                          onClick={openFilePickerForAvatar}
                          disabled={profilePhotoBusy}
                          style={{
                            width: "100%",
                            justifyContent: "flex-start",
                            border: "none",
                            borderRadius: 6,
                          }}
                        >
                          Add profile picture
                        </button>
                      )}
                    </div>
                  </>
                ) : null}
              </div>

              <div style={{ flex: 1, minWidth: 220, margin: 0 }}>
                <div className="topbar" style={{ padding: 0 }}>
                  <div>
                    {!editing ? (
                      <>
                        <h2 style={{ marginBottom: 6 }}>{user.name}</h2>
                        <div className="muted">{user.email}</div>
                        <div className="muted">Role: {user.role}</div>
                      </>
                    ) : (
                      <>
                        <label className="field" style={{ marginBottom: 4 }}>
                          <span className="muted">Full name</span>
                          <input
                            value={form.name}
                            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                            autoComplete="name"
                          />
                        </label>
                        <div className="muted">{user.email}</div>
                        <div className="muted"> {user.role}</div>
                      </>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!editing ? (
                      <button className="btn btnPrimary" type="button" onClick={startEdit}>
                        Edit profile
                      </button>
                    ) : (
                      <>
                        <button
                          className="btn btnPrimary"
                          type="button"
                          disabled={!canSave}
                          onClick={() => {
                            const ev = { preventDefault() {} };
                            save(ev);
                          }}
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button className="btn" type="button" onClick={cancelEdit} disabled={saving}>
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <form
                  className={editing ? "form" : undefined}
                  style={{ marginTop: 12, width: "100%", maxWidth: 520 }}
                  onSubmit={submitProfile}
                >
                <div className="grid2" style={{ marginTop: 0 }}>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>
                      Bio
                    </div>
                    {!editing ? (
                      <div style={{ whiteSpace: "pre-wrap" }}>
                        {user.bio ? user.bio : <span className="muted">—</span>}
                      </div>
                    ) : (
                      <textarea
                        value={form.bio}
                        onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                        placeholder="Tell others about your research interests..."
                        rows={4}
                        style={{ width: "100%", boxSizing: "border-box" }}
                      />
                    )}
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>
                      Academic
                    </div>
                    {!editing ? (
                      <div>
                        <div>
                          <span className="muted">Faculty: </span>
                          {user.faculty ? user.faculty : <span className="muted">—</span>}
                        </div>
                        <div>
                          <span className="muted">Program: </span>
                          {user.program ? user.program : <span className="muted">—</span>}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <label className="field" style={{ margin: 0 }}>
                          <span className="muted">Faculty</span>
                          <input
                            value={form.faculty}
                            onChange={(e) => setForm((f) => ({ ...f, faculty: e.target.value }))}
                            placeholder="Engineering"
                          />
                        </label>
                        <label className="field" style={{ margin: 0 }}>
                          <span className="muted">Program</span>
                          <input
                            value={form.program}
                            onChange={(e) => setForm((f) => ({ ...f, program: e.target.value }))}
                            placeholder="Computer Science"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid2" style={{ marginTop: 12 }}>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>
                      Skills
                    </div>
                    {!editing ? (
                      <div className="chipRow">
                        {(user.skills || []).length ? (
                          user.skills.map((s) => (
                            <span className="chip" key={s}>
                              {s}
                            </span>
                          ))
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </div>
                    ) : (
                      <input
                        value={form.skills}
                        onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))}
                        placeholder="NLP, Data Mining, React"
                        style={{ width: "100%", boxSizing: "border-box" }}
                      />
                    )}
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>
                      Interests
                    </div>
                    {!editing ? (
                      <div className="chipRow">
                        {(user.interests || []).length ? (
                          user.interests.map((s) => (
                            <span className="chip" key={s}>
                              {s}
                            </span>
                          ))
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </div>
                    ) : (
                      <input
                        value={form.interests}
                        onChange={(e) => setForm((f) => ({ ...f, interests: e.target.value }))}
                        placeholder="AI safety, recommender systems"
                        style={{ width: "100%", boxSizing: "border-box" }}
                      />
                    )}
                  </div>
                </div>

                {status && !photoStatus && (editing || status === "Saved.") ? (
                  <div
                    className={status === "Saved." ? "alert" : "alert alertError"}
                    style={{ marginTop: 12 }}
                  >
                    {status}
                  </div>
                ) : null}
                </form>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="topbar" style={{ padding: 0 }}>
              <h2 style={{ marginBottom: 0 }}>Posts</h2>
              <div className="muted">Photos & videos you share</div>
            </div>

            <div className="postsGrid" style={{ marginTop: 12 }}>
              <div className="postTile">
                <div className="muted" style={{ padding: 12, textAlign: "center" }}>
                  Your photo/video posts will appear here.
                </div>
              </div>
              <div className="postTile">
                <div className="muted" style={{ padding: 12, textAlign: "center" }}>
                  (Hook this up to a posts API later.)
                </div>
              </div>
              <div className="postTile">
                <div className="muted" style={{ padding: 12, textAlign: "center" }}>
                  Ready for grid layout.
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {!editing && status && photoStatus ? <div className="alert">{status}</div> : null}

      {!editing && status && !photoStatus && status !== "Saved." ? (
        <div className="alert alertError">{status}</div>
      ) : null}

      {viewImageOpen && hasProfilePicture ? (
        <div
          style={overlayStyle}
          role="dialog"
          aria-modal="true"
          aria-label="Profile picture"
          onClick={() => setViewImageOpen(false)}
        >
          <div
            className="card"
            style={{ maxWidth: "min(90vw, 720px)", margin: 0, position: "relative" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="topbar" style={{ padding: 0, marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>Profile picture</h2>
              <button
                type="button"
                className="btn"
                onClick={() => setViewImageOpen(false)}
                aria-label="Close"
              >
                Close
              </button>
            </div>
            <img
              src={profileImageSrc(user.profileImage)}
              alt="Your profile"
              style={{ width: "100%", height: "auto", display: "block", borderRadius: 8 }}
            />
          </div>
        </div>
      ) : null}

      {pendingImage && pendingPreviewUrl ? (
        <div
          style={overlayStyle}
          role="dialog"
          aria-modal="true"
          aria-label="Preview photo"
          onClick={() => {
            if (!profilePhotoBusy) closePendingImageModal();
          }}
        >
          <div
            className="card"
            style={{ maxWidth: "min(90vw, 420px)", margin: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>Preview</h2>
            <img
              src={pendingPreviewUrl}
              alt="Selected preview"
              style={{
                width: "100%",
                maxHeight: "50vh",
                objectFit: "contain",
                borderRadius: 8,
                marginBottom: 12,
                border: "1px solid var(--border)",
                boxSizing: "border-box",
                background: "var(--bg)",
              }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btnPrimary"
                disabled={profilePhotoBusy}
                onClick={uploadPendingProfileImage}
              >
                {profilePhotoBusy ? "Uploading..." : "Upload"}
              </button>
              <button
                type="button"
                className="btn"
                disabled={profilePhotoBusy}
                onClick={closePendingImageModal}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
