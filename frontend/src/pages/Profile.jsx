import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL, setAuthToken } from "../api";
import { getProfile, updateProfile } from "../api/profile";
import ProfileAvatar from "../components/ProfileAvatar";
import ProfileForm from "../components/ProfileForm";

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
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [user, setUser] = useState(null);
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

  async function loadProfile() {
    setStatus("");
    setLoading(true);
    try {
      const res = await getProfile();
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

  async function uploadPendingProfileImage(file) {
    if (!file || !user) return false;
    setProfilePhotoBusy(true);
    setStatus("");
    try {
      const fd = new FormData();
      fd.append("profileImage", file);
      const res = await updateProfile(fd);
      setUser(res.data.user);
      setStatus("Profile photo updated.");
      return true;
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to upload photo";
      setStatus(msg);
      return false;
    } finally {
      setProfilePhotoBusy(false);
    }
  }

  async function removeProfilePicture() {
    if (!window.confirm("Remove your profile picture? You can add a new one anytime.")) return;
    if (!user) return;
    setProfilePhotoBusy(true);
    setStatus("");
    try {
      const res = await updateProfile({ removeProfileImage: true });
      setUser(res.data.user);
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
      const res = await updateProfile(payload);
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

  function submitProfile(e) {
    e.preventDefault();
    if (!editing) return;
    save(e);
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
              <ProfileAvatar
                avatarDisplaySrc={avatarDisplaySrc}
                viewImageSrc={hasProfilePicture ? profileImageSrc(user.profileImage) : null}
                hasProfilePicture={hasProfilePicture}
                loading={loading}
                profilePhotoBusy={profilePhotoBusy}
                onUploadPending={uploadPendingProfileImage}
                onRemoveProfilePicture={removeProfilePicture}
              />

              <ProfileForm
                user={user}
                form={form}
                setForm={setForm}
                editing={editing}
                saving={saving}
                canSave={canSave}
                status={status}
                photoStatus={photoStatus}
                onStartEdit={startEdit}
                onCancelEdit={cancelEdit}
                onSave={save}
                onSubmitProfile={submitProfile}
              />
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
    </div>
  );
}
