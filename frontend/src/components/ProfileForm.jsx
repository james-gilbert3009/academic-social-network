import { useCallback, useLayoutEffect, useEffect, useRef, useState } from "react";
import RoleBadge from "./RoleBadge";

const h2TitleStyle = {
  marginBottom: 8,
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

/**
 * Name, role badge, @username, and email — shared between mobile and desktop profile headers.
 */
export function ProfileIdentityBlock({ user, form, setForm, editing, readOnly = false }) {
  return (
    <div>
      {!editing || readOnly ? (
        <>
          <h2 className="profileNameRoleRow" style={h2TitleStyle}>
            <span>{user.name}</span>
            <RoleBadge role={user?.role} />
          </h2>
          {user?.username ? <div className="profileUsername">@{user.username}</div> : null}
          <div className="muted profileIdentityEmail">{user.email}</div>
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
          {user?.username ? <div className="profileUsername profileUsername--static">@{user.username}</div> : null}
          <div className="muted profileIdentityEmail profileIdentityEmail--tight">{user.email}</div>
          <RoleBadge role={user?.role} />
        </>
      )}
    </div>
  );
}

export function ProfileHeaderActions({
  editing,
  readOnly = false,
  canSave,
  saving,
  onStartEdit,
  onCancelEdit,
  onSave,
  className,
  editButtonClassName = "",
}) {
  if (readOnly) return null;

  return (
    <div className={className || "profileHeaderActionsInner"} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {!editing ? (
        <button
          className={`primary-button btn-compact profileInCardEditButton${editButtonClassName ? ` ${editButtonClassName}` : ""}`}
          type="button"
          onClick={onStartEdit}
        >
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
          <button className="secondary-button btn-compact" type="button" onClick={onCancelEdit} disabled={saving}>
            Cancel
          </button>
        </>
      )}
    </div>
  );
}

function hasTrimmed(text) {
  return Boolean(String(text || "").trim());
}

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
  showHeader = true,
}) {
  const aboutTextRef = useRef(null);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [aboutOverflows, setAboutOverflows] = useState(false);

  const bioTrimmed = String(user?.bio || "").trim();
  const showAboutView = hasTrimmed(user?.bio);
  const showAboutSection = editing && !readOnly ? true : showAboutView;

  const skillList = Array.isArray(user?.skills) ? user.skills : [];
  const interestList = Array.isArray(user?.interests) ? user.interests : [];
  const showSkillsSection = editing && !readOnly ? true : skillList.length > 0;
  const showInterestsSection = editing && !readOnly ? true : interestList.length > 0;

  const hasFaculty = hasTrimmed(user?.faculty);
  const hasProgram = hasTrimmed(user?.program);
  const showAcademicSection = editing && !readOnly ? true : hasFaculty || hasProgram;

  const checkAboutOverflow = useCallback(() => {
    const el = aboutTextRef.current;
    if (!el || !bioTrimmed || aboutExpanded) {
      setAboutOverflows(false);
      return;
    }
    setAboutOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [aboutExpanded, bioTrimmed]);

  useLayoutEffect(() => {
    checkAboutOverflow();
  }, [checkAboutOverflow, user?.bio, aboutExpanded]);

  useEffect(() => {
    setAboutExpanded(false);
  }, [user?.bio]);

  useEffect(() => {
    const el = aboutTextRef.current;
    if (!el || !bioTrimmed || aboutExpanded) return undefined;

    const ro = new ResizeObserver(() => {
      checkAboutOverflow();
    });
    ro.observe(el);

    const onResize = () => checkAboutOverflow();
    window.addEventListener("resize", onResize);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [bioTrimmed, aboutExpanded, checkAboutOverflow]);

  const formEditing = Boolean(editing && !readOnly);

  const showAboutToggle = !formEditing && Boolean(bioTrimmed) && (aboutExpanded || aboutOverflows);

  return (
    <div
      className={showHeader ? "profileFormRoot" : "profileFormRoot profileFormRoot--bodyOnly"}
      style={{ flex: "1 1 auto", minWidth: 220, margin: 0, alignSelf: "flex-start" }}
    >
      {showHeader ? (
        <div className="profileFormHeader profileFormHeader--stacked">
          <div className="topbar profileFormHeaderTopbar" style={{ padding: 0 }}>
            <ProfileIdentityBlock
              user={user}
              form={form}
              setForm={setForm}
              editing={editing}
              readOnly={readOnly}
            />
            <ProfileHeaderActions
              editing={editing}
              readOnly={readOnly}
              canSave={canSave}
              saving={saving}
              onStartEdit={onStartEdit}
              onCancelEdit={onCancelEdit}
              onSave={onSave}
            />
          </div>
        </div>
      ) : null}

      <form
        className={`profileCardForm${formEditing ? " form" : ""}`}
        style={{ marginTop: 16, width: "100%" }}
        onSubmit={onSubmitProfile}
      >
        <div className="profileCardBody">
          <div className="profileCardContentGrid">
            {showAboutSection ? (
              <div className="profileCardSection">
                <div className="section-title">About</div>
                {!formEditing ? (
                  <div className="profileAboutBlock">
                    <div
                      ref={aboutTextRef}
                      className={
                        bioTrimmed && !aboutExpanded
                          ? "profileAboutText profileAboutText--clamped"
                          : "profileAboutText"
                      }
                      style={{ whiteSpace: "pre-line", lineHeight: 1.5 }}
                    >
                      {user.bio}
                    </div>
                    {showAboutToggle ? (
                      <button
                        type="button"
                        className="profileSeeMoreButton"
                        onClick={() => setAboutExpanded((v) => !v)}
                        aria-expanded={aboutExpanded}
                      >
                        {aboutExpanded ? "See less" : "See more"}
                      </button>
                    ) : null}
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
            ) : null}

            {showAcademicSection ? (
              <div className="profileCardSection">
                <div className="section-title">Academic affiliation</div>
                <div className="profileAcademicList">
                  {!formEditing ? (
                    <dl className="profile-meta">
                      {hasFaculty ? (
                        <div className="profile-meta__row">
                          <dt>Faculty</dt>
                          <dd>{user.faculty}</dd>
                        </div>
                      ) : null}
                      {hasProgram ? (
                        <div className="profile-meta__row">
                          <dt>Program</dt>
                          <dd>{user.program}</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : (
                    <div className="profileAcademicList__edit">
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
            ) : null}

            {showSkillsSection ? (
              <div className="profileCardSection profileCardSection--chips">
                <div className="section-title">Skills</div>
                {!formEditing ? (
                  <div className="chipRow profileChipRow">
                    {skillList.map((s) => (
                      <span className="chip" key={s}>
                        {s}
                      </span>
                    ))}
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
            ) : null}

            {showInterestsSection ? (
              <div className="profileCardSection profileCardSection--chips">
                <div className="section-title">Interests</div>
                {!formEditing ? (
                  <div className="chipRow profileChipRow">
                    {interestList.map((s) => (
                      <span className="chip" key={s}>
                        {s}
                      </span>
                    ))}
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
            ) : null}

            {status && !photoStatus && (editing || status === "Saved.") ? (
              <div className="profileCardContentGrid__alert">
                <div className={status === "Saved." ? "alert" : "alert alertError"}>{status}</div>
              </div>
            ) : null}
          </div>
        </div>
      </form>
    </div>
  );
}
