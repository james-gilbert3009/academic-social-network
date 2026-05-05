import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../api";

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

/**
 * Profile picture: preview, menu (view / change / remove), file picker, and modals.
 * Upload/remove API calls stay in the parent; pass them as props.
 */
export default function ProfileAvatar({
  // New props (preferred)
  image,
  isOwnProfile,
  onUpload,
  onRemove,

  // Backward-compatible props (kept to avoid breaking older callers)
  avatarDisplaySrc: legacyAvatarDisplaySrc,
  viewImageSrc: legacyViewImageSrc,
  hasProfilePicture: legacyHasProfilePicture,
  loading = false,
  profilePhotoBusy = false,
  onUploadPending,
  onRemoveProfilePicture,
  readOnly,
}) {
  const fileInputRef = useRef(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [viewImageOpen, setViewImageOpen] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState("");

  const effectiveIsOwnProfile =
    typeof isOwnProfile === "boolean" ? isOwnProfile : !Boolean(readOnly);

  const effectiveOnUpload = onUpload || onUploadPending;
  const effectiveOnRemove = onRemove || onRemoveProfilePicture;

  const normalizedImage = typeof image === "string" ? image : "";
  const computedHasProfilePicture =
    typeof legacyHasProfilePicture === "boolean"
      ? legacyHasProfilePicture
      : Boolean(normalizedImage);

  const computedViewImageSrc =
    legacyViewImageSrc ??
    (normalizedImage
      ? normalizedImage.startsWith("/uploads")
        ? `${API_BASE_URL}${normalizedImage}`
        : normalizedImage
      : "");

  const computedAvatarDisplaySrc =
    legacyAvatarDisplaySrc ??
    (computedViewImageSrc || "https://api.dicebear.com/8.x/initials/svg?seed=User");

  const computedReadOnly = !effectiveIsOwnProfile;

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    };
  }, [pendingPreviewUrl]);

  useEffect(() => {
    if (!computedHasProfilePicture) setViewImageOpen(false);
  }, [computedHasProfilePicture]);

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

  async function handleUploadClick() {
    if (!pendingImage) return;
    if (!effectiveOnUpload) return;
    const ok = await effectiveOnUpload(pendingImage);
    if (ok) closePendingImageModal();
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        aria-hidden
        onChange={onAvatarFileChange}
      />

      <div style={{ position: "relative", alignSelf: "flex-start" }}>
        {computedReadOnly ? (
          computedHasProfilePicture ? (
            <button
              type="button"
              onClick={openViewProfilePicture}
              aria-label="View profile picture"
              style={{
                padding: 0,
                margin: 0,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                borderRadius: "50%",
                display: "block",
              }}
            >
              <img className="avatar" src={computedAvatarDisplaySrc} alt="" />
            </button>
          ) : (
            <img className="avatar" src={computedAvatarDisplaySrc} alt="" />
          )
        ) : (
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
            <img className="avatar" src={computedAvatarDisplaySrc} alt="" />
          </button>
        )}

        {!computedReadOnly && avatarMenuOpen ? (
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
              {computedHasProfilePicture ? (
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
                    onClick={() => {
                      closeAvatarMenu();
                      effectiveOnRemove?.();
                    }}
                    disabled={profilePhotoBusy || !effectiveOnRemove}
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
                  disabled={profilePhotoBusy || !effectiveOnUpload}
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

      {viewImageOpen && computedHasProfilePicture && computedViewImageSrc ? (
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
              src={computedViewImageSrc}
              alt="Profile"
              style={{
                width: "100%",
                height: "auto",
                maxHeight: "70vh",
                objectFit: "contain",
                display: "block",
                borderRadius: 8,
                background: "var(--bg)",
              }}
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
                onClick={handleUploadClick}
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
    </>
  );
}
