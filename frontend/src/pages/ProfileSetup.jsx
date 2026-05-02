import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setAuthToken } from "../api";

function skillsInterestsToComma(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export default function ProfileSetup() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({
    name: "",
    faculty: "",
    program: "",
    bio: "",
    skills: "",
    interests: "",
  });

  const previewUrl = useMemo(() => {
    if (!file) return "";
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setProfileLoading(true);
      try {
        const token = localStorage.getItem("token") || "";
        setAuthToken(token);
        const res = await api.get("/api/profile/me");
        const u = res.data?.user;
        if (cancelled || !u) return;
        setForm({
          name: u.name || "",
          faculty: u.faculty || "",
          program: u.program || "",
          bio: u.bio || "",
          skills: skillsInterestsToComma(u.skills),
          interests: skillsInterestsToComma(u.interests),
        });
      } catch {
        /* keep empty form */
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  function completeLater() {
    localStorage.setItem("skipProfileSetup", "1");
    navigate("/feed", { replace: true });
  }

  async function submit(e) {
    e.preventDefault();
    setStatus("");
    setSaving(true);

    try {
      const token = localStorage.getItem("token") || "";
      setAuthToken(token);

      const data = new FormData();
      data.append("name", form.name);
      data.append("faculty", form.faculty);
      data.append("program", form.program);
      data.append("bio", form.bio);
      data.append("skills", form.skills);
      data.append("interests", form.interests);
      if (file) data.append("profileImage", file);

      await api.put("/api/profile/me", data, {
        headers: {
          Authorization: `Bearer ${token}`,
          // Don't set Content-Type manually; axios will set the multipart boundary.
        },
      });

      localStorage.removeItem("skipProfileSetup");
      navigate("/feed", { replace: true });
    } catch (err) {
      setStatus(err?.response?.data?.message || err?.message || "Profile setup failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1>Profile setup</h1>
      </div>
      
      <div className="muted">You can do this now or later.</div>

      {profileLoading ? <div className="muted">Loading your profile…</div> : null}

      <form className="card form" onSubmit={submit}>
        <label className="field">
          <span>Full name</span>
          <input
            autoComplete="name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Jane Doe"
            disabled={profileLoading || saving}
          />
        </label>

        <label className="field">
          <span>Faculty</span>
          <input
            value={form.faculty}
            onChange={(e) => setForm((f) => ({ ...f, faculty: e.target.value }))}
            placeholder="Engineering"
            disabled={profileLoading || saving}
          />
        </label>

        <label className="field">
          <span>Program</span>
          <input
            value={form.program}
            onChange={(e) => setForm((f) => ({ ...f, program: e.target.value }))}
            placeholder="Computer Science"
            disabled={profileLoading || saving}
          />
        </label>

        <label className="field">
          <span>Bio</span>
          <textarea
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
            placeholder="Tell others about your academic interests..."
            disabled={profileLoading || saving}
          />
        </label>

        <label className="field">
          <span>Skills (comma-separated)</span>
          <input
            value={form.skills}
            onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))}
            placeholder="NLP, Data Mining, React"
            disabled={profileLoading || saving}
          />
        </label>

        <label className="field">
          <span>Interests (comma-separated)</span>
          <input
            value={form.interests}
            onChange={(e) => setForm((f) => ({ ...f, interests: e.target.value }))}
            placeholder="AI safety, recommender systems"
            disabled={profileLoading || saving}
          />
        </label>

        <label className="field">
          <span>Profile picture</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            disabled={profileLoading || saving}
          />
        </label>

        {previewUrl ? (
          <div className="row setupPreviewRow">
            <img className="avatar" src={previewUrl} alt="Preview" />
            <div className="muted">Preview</div>
          </div>
        ) : null}

        <div className="actionsRow">
          <button className="btn btnPrimary" type="submit" disabled={profileLoading || saving}>
            {saving ? "Saving..." : "Save profile"}
          </button>
          <button className="btn" type="button" onClick={completeLater} disabled={profileLoading || saving}>
            Complete later
          </button>
        </div>

        {status ? <div className="alert alertError">{status}</div> : null}
      </form>
    </div>
  );
}

