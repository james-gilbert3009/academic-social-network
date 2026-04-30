import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setAuthToken } from "../api";

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

export default function Profile() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [user, setUser] = useState(null);
  const [hideSetupReminder, setHideSetupReminder] = useState(
    localStorage.getItem("skipProfileSetup") === "1"
  );
  const [form, setForm] = useState({
    bio: "",
    faculty: "",
    program: "",
    skills: "",
    interests: "",
    profileImage: "",
  });

  const canSave = useMemo(() => !saving && !loading, [saving, loading]);

  const skillsList = useMemo(() => fromCommaList(form.skills), [form.skills]);
  const interestsList = useMemo(() => fromCommaList(form.interests), [form.interests]);

  async function loadProfile() {
    setStatus("");
    setLoading(true);
    try {
      const res = await api.get("/api/profile/me");
      const u = res.data.user;
      setUser(u);
      setForm({
        bio: u?.bio || "",
        faculty: u?.faculty || "",
        program: u?.program || "",
        skills: toCommaList(u?.skills),
        interests: toCommaList(u?.interests),
        profileImage: u?.profileImage || "",
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

  function completeLater() {
    localStorage.setItem("skipProfileSetup", "1");
    setHideSetupReminder(true);
  }

  async function save(e) {
    e.preventDefault();
    if (!canSave) return;
    setStatus("");
    setSaving(true);
    try {
      const payload = {
        bio: form.bio,
        faculty: form.faculty,
        program: form.program,
        skills: fromCommaList(form.skills),
        interests: fromCommaList(form.interests),
        profileImage: form.profileImage,
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
    setEditing(true);
  }

  function cancelEdit() {
    if (!user) return;
    setStatus("");
    setForm({
      bio: user?.bio || "",
      faculty: user?.faculty || "",
      program: user?.program || "",
      skills: toCommaList(user?.skills),
      interests: toCommaList(user?.interests),
      profileImage: user?.profileImage || "",
    });
    setEditing(false);
  }

  return (
    <div className="page">
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

      {user ? (
        <>
          {!user.isProfileComplete && !hideSetupReminder ? (
            <section className="card">
              <div className="topbar" style={{ padding: 0 }}>
                <div>
                  <h2 style={{ marginBottom: 6 }}>Finish setting up your profile</h2>
                  <div className="muted">
                    Add a photo, skills, and interests so others can find you.
                  </div>
                </div>
                <div className="actionsRow">
                  <button
                    className="btn btnPrimary"
                    type="button"
                    onClick={() => navigate("/profile-setup")}
                  >
                    Complete now
                  </button>
                  <button className="btn" type="button" onClick={completeLater}>
                    Later
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          <section className="card">
            <div className="row">
              <img
                className="avatar"
                src={
                  (editing ? form.profileImage : user.profileImage) ||
                  `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(
                    user.name || "User"
                  )}`
                }
                alt="Profile"
              />
              <div style={{ flex: 1, minWidth: 220 }}>
                <div className="topbar" style={{ padding: 0 }}>
                  <div>
                    <h2 style={{ marginBottom: 6 }}>{user.name}</h2>
                    <div className="muted">{user.email}</div>
                    <div className="muted">Role: {user.role}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!editing ? (
                      <button className="btn btnPrimary" type="button" onClick={startEdit}>
                        Edit profile
                      </button>
                    ) : (
                      <button className="btn" type="button" onClick={cancelEdit} disabled={saving}>
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid2" style={{ marginTop: 12 }}>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>
                      Bio
                    </div>
                    <div>{(editing ? form.bio : user.bio) || <span className="muted">—</span>}</div>
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>
                      Academic
                    </div>
                    <div>
                      <div>
                        <span className="muted">Faculty: </span>
                        {(editing ? form.faculty : user.faculty) || <span className="muted">—</span>}
                      </div>
                      <div>
                        <span className="muted">Program: </span>
                        {(editing ? form.program : user.program) || <span className="muted">—</span>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid2" style={{ marginTop: 12 }}>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>
                      Skills
                    </div>
                    <div className="chipRow">
                      {(editing ? skillsList : user.skills || []).length ? (
                        (editing ? skillsList : user.skills || []).map((s) => (
                          <span className="chip" key={s}>
                            {s}
                          </span>
                        ))
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>
                      Interests
                    </div>
                    <div className="chipRow">
                      {(editing ? interestsList : user.interests || []).length ? (
                        (editing ? interestsList : user.interests || []).map((s) => (
                          <span className="chip" key={s}>
                            {s}
                          </span>
                        ))
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {editing ? (
            <form className="card form" onSubmit={save}>
              <h2>Edit profile</h2>

              <label className="field">
                <span>Bio</span>
                <input
                  value={form.bio}
                  onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                  placeholder="Tell others about your research interests..."
                />
              </label>

              <label className="field">
                <span>Faculty</span>
                <input
                  value={form.faculty}
                  onChange={(e) => setForm((f) => ({ ...f, faculty: e.target.value }))}
                  placeholder="Engineering"
                />
              </label>

              <label className="field">
                <span>Program</span>
                <input
                  value={form.program}
                  onChange={(e) => setForm((f) => ({ ...f, program: e.target.value }))}
                  placeholder="Computer Science"
                />
              </label>

              <label className="field">
                <span>Skills (comma-separated)</span>
                <input
                  value={form.skills}
                  onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))}
                  placeholder="NLP, Data Mining, React"
                />
              </label>

              <label className="field">
                <span>Interests (comma-separated)</span>
                <input
                  value={form.interests}
                  onChange={(e) => setForm((f) => ({ ...f, interests: e.target.value }))}
                  placeholder="AI safety, recommender systems"
                />
              </label>

              <label className="field">
                <span>Profile image URL</span>
                <input
                  value={form.profileImage}
                  onChange={(e) => setForm((f) => ({ ...f, profileImage: e.target.value }))}
                  placeholder="https://..."
                />
              </label>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btnPrimary" type="submit" disabled={!canSave}>
                  {saving ? "Saving..." : "Save changes"}
                </button>
                <button className="btn" type="button" onClick={cancelEdit} disabled={saving}>
                  Cancel
                </button>
              </div>

              {status ? (
                <div className={status === "Saved." ? "alert" : "alert alertError"}>{status}</div>
              ) : null}
            </form>
          ) : null}

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
      {!editing && status && status !== "Saved." ? (
        <div className="alert alertError">{status}</div>
      ) : null}
    </div>
  );
}

