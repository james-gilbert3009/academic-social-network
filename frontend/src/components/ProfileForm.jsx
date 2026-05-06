import RoleBadge from "./RoleBadge";

/**
 * Profile text fields: view/edit header (name, email, role) and main form
 * (bio, faculty, program, skills, interests). Save/cancel API logic lives in the parent.
 */
export default function ProfileForm({
  user,
  form,
  setForm,
  editing,
  saving,
  canSave,
  status,
  photoStatus,
  onStartEdit,
  onCancelEdit,
  onSave,
  onSubmitProfile,
  readOnly = false,
}) {
  return (
    <div style={{ flex: 1, minWidth: 220, margin: 0 }}>
      <div className="topbar" style={{ padding: 0 }}>
        <div>
          {!editing || readOnly ? (
            <>
              <h2
                style={{
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span>{user.name}</span>
                <RoleBadge role={user?.role} />
              </h2>
              <div className="muted" style={{ marginBottom: 10 }}>
                {user.email}
              </div>
            </>
          ) : (
            <>
              <label className="field" style={{ marginBottom: 8 }}>
                <span className="section-title" style={{ marginBottom: 6 }}>
                  Full name
                </span>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  autoComplete="name"
                />
              </label>
              <div className="muted" style={{ marginBottom: 8 }}>
                {user.email}
              </div>
              <RoleBadge role={user?.role} />
            </>
          )}
        </div>
        {!readOnly ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!editing ? (
              <button className="primary-button btn-compact" type="button" onClick={onStartEdit}>
                Edit profile
              </button>
            ) : (
              <>
                <button
                  className="primary-button btn-compact"
                  type="button"
                  disabled={!canSave}
                  onClick={() => {
                    const ev = { preventDefault() {} };
                    onSave(ev);
                  }}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  className="secondary-button btn-compact"
                  type="button"
                  onClick={onCancelEdit}
                  disabled={saving}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      <form
        className={editing && !readOnly ? "form" : undefined}
        style={{ marginTop: 16, width: "100%", maxWidth: 640 }}
        onSubmit={onSubmitProfile}
      >
        <div className="grid2" style={{ marginTop: 0 }}>
          <div>
            <div className="section-title">About</div>
            {!editing ? (
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                {user.bio ? user.bio : <span className="muted">No bio yet.</span>}
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
            <div className="section-title">Academic affiliation</div>
            {!editing ? (
              <dl className="profile-meta">
                <div className="profile-meta__row">
                  <dt>Faculty</dt>
                  <dd>{user.faculty ? user.faculty : <span className="muted">—</span>}</dd>
                </div>
                <div className="profile-meta__row">
                  <dt>Program</dt>
                  <dd>{user.program ? user.program : <span className="muted">—</span>}</dd>
                </div>
              </dl>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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

        <div className="grid2" style={{ marginTop: 18 }}>
          <div>
            <div className="section-title">Skills</div>
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
            <div className="section-title">Interests</div>
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
  );
}
