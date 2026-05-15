import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";

import { createPost } from "../api/posts";
import { getCroppedImg } from "../utils/getCroppedImg";

/** Crop frame presets. "media" uses the file's natural width/height so portraits stay portrait. */
const ASPECT_CHOICES = [
  { key: "media", label: "Match photo" },
  { key: "16:9", label: "16:9" },
  { key: "4:3", label: "4:3" },
  { key: "1:1", label: "1:1" },
  { key: "3:4", label: "3:4" },
];

function resolveAspectRatio(presetKey, mediaAspect) {
  if (presetKey === "media") return mediaAspect;
  const map = {
    "16:9": 16 / 9,
    "4:3": 4 / 3,
    "1:1": 1,
    "3:4": 3 / 4,
  };
  return map[presetKey] ?? 16 / 9;
}

export default function CreatePostForm({
  onCreated,
  onPostCreated,
  placeholder = "Share something...",
}) {
  const fileInputRef = useRef(null);
  const captionRef = useRef(null);
  /** Tracks active blob: URL for revoke on replace / unmount (avoid setState-in-effect lint). */
  const previewBlobUrlRef = useRef(null);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [cropOpen, setCropOpen] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [cropWorking, setCropWorking] = useState(false);
  const [aspectPreset, setAspectPreset] = useState("media");
  const [mediaAspect, setMediaAspect] = useState(4 / 3);

  const MAX_BYTES = 5 * 1024 * 1024;
  const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
  const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp"];

  const hasText = content.trim().length > 0;
  const hasImage = Boolean(imageFile);

  const canSubmit = useMemo(() => {
    return !submitting && (hasText || hasImage);
  }, [submitting, hasText, hasImage]);

  useEffect(() => {
    return () => {
      if (previewBlobUrlRef.current) {
        URL.revokeObjectURL(previewBlobUrlRef.current);
        previewBlobUrlRef.current = null;
      }
    };
  }, []);

  /** Grow/shrink caption field with content; cap height so long posts scroll inside the textarea. */
  useLayoutEffect(() => {
    const el = captionRef.current;
    if (!el) return;
    const maxPx = Math.min(320, Math.round(typeof window !== "undefined" ? window.innerHeight * 0.35 : 320));
    el.style.height = "auto";
    const full = el.scrollHeight;
    const next = Math.min(full, maxPx);
    el.style.height = `${next}px`;
    el.style.overflowY = full > maxPx ? "auto" : "hidden";
  }, [content]);

  function revokePreviewBlob() {
    if (previewBlobUrlRef.current) {
      URL.revokeObjectURL(previewBlobUrlRef.current);
      previewBlobUrlRef.current = null;
    }
  }

  function clearForm() {
    setContent("");
    setCategory("general");
    revokePreviewBlob();
    setPreviewUrl("");
    setImageFile(null);
    setError("");
    setCropOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function validateAndSetImage(file, options = {}) {
    const { promptCrop = false } = options;
    revokePreviewBlob();
    setPreviewUrl("");

    if (!file) {
      setImageFile(null);
      setCropOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const ext = String(file.name || "").split(".").pop()?.toLowerCase() || "";
    const mimeOk = ALLOWED_MIME.includes(file.type);
    const extOk = ALLOWED_EXT.includes(ext);

    if (!mimeOk && !extOk) {
      setError("Invalid image type. Allowed: jpg, jpeg, png, webp.");
      setImageFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > MAX_BYTES) {
      setError("Image is too large. Max size is 5MB.");
      setImageFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const url = URL.createObjectURL(file);
    previewBlobUrlRef.current = url;
    setPreviewUrl(url);
    setError("");
    setImageFile(file);

    if (promptCrop) {
      setAspectPreset("media");
      setMediaAspect(4 / 3);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setCropOpen(true);
    }
  }

  function openCropModal() {
    if (!previewUrl) return;
    setAspectPreset("media");
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropOpen(true);
  }

  function selectAspectPreset(key) {
    setAspectPreset(key);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  }

  async function applyCrop() {
    if (!previewUrl || !croppedAreaPixels) return;
    setCropWorking(true);
    setError("");
    try {
      const blob = await getCroppedImg(previewUrl, croppedAreaPixels);
      const baseName = String(imageFile?.name || "photo").replace(/\.[^.]+$/, "") || "photo";
      const croppedFile = new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });

      if (croppedFile.size > MAX_BYTES) {
        setError("Cropped image is too large. Max size is 5MB.");
        return;
      }

      validateAndSetImage(croppedFile, { promptCrop: false });
      if (fileInputRef.current) fileInputRef.current.value = "";
      setCropOpen(false);
    } catch {
      setError("Could not crop image. Try again or post without cropping.");
    } finally {
      setCropWorking(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!hasText && !hasImage) {
      setError("Add a caption or an image");
      return;
    }
    if (!canSubmit) return;

    setSubmitting(true);
    setError("");
    try {
      const fd = new FormData();
      if (hasText) fd.append("content", content.trim());
      if (imageFile) fd.append("image", imageFile);
      fd.append("category", category || "general");

      const res = await createPost(fd);
      const post = res.data.post;
      clearForm();
      if (typeof onPostCreated === "function") onPostCreated(post);
      else if (typeof onCreated === "function") onCreated(post);
    } catch (err) {
      const msg =
        err?.response?.data?.message || err?.message || "Failed to create post";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 14, color: "var(--muted)" }}>Category</span>
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={submitting}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text-h)",
              }}
            >
              <option value="question">Question</option>
              <option value="research">Research</option>
              <option value="announcement">Announcement</option>
              <option value="study">Study Material</option>
              <option value="event">Event</option>
              <option value="general">General</option>
            </select>
          </label>
        </div>

        <textarea
          ref={captionRef}
          className="input createPostForm__caption"
          rows={1}
          value={content}
          placeholder={placeholder}
          onChange={(e) => setContent(e.target.value)}
          maxLength={1000}
          disabled={submitting}
          aria-label="Post caption"
        />

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            onChange={(e) => validateAndSetImage(e.target.files?.[0] || null, { promptCrop: true })}
            disabled={submitting}
          />

          {imageFile ? (
            <>
              <button
                className="secondary-button btn-compact"
                type="button"
                onClick={openCropModal}
                disabled={submitting || cropWorking || !previewUrl}
              >
                Crop image
              </button>
              <button
                className="secondary-button btn-compact"
                type="button"
                onClick={() => validateAndSetImage(null)}
                disabled={submitting}
              >
                Remove image
              </button>
            </>
          ) : null}

          <button className="primary-button btn-compact" type="submit" disabled={!canSubmit}>
            {submitting ? "Posting..." : "Post"}
          </button>
        </div>

        {previewUrl ? (
          <div className="createPostForm__preview">
            <img className="createPostForm__previewImg" src={previewUrl} alt="Preview" />
          </div>
        ) : null}

        {error ? <div className="alert alertError">{error}</div> : null}
      </div>

      {cropOpen && previewUrl ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Crop image">
          <div className="modalCard createPostCropModal">
            <div className="topbar" style={{ marginBottom: 12 }}>
              <h2 style={{ marginBottom: 0, fontSize: "1.15rem" }}>Crop image</h2>
              <button
                className="secondary-button btn-compact"
                type="button"
                disabled={cropWorking}
                onClick={() => setCropOpen(false)}
              >
                Close
              </button>
            </div>
            <p className="muted" style={{ fontSize: 14, marginBottom: 10 }}>
              Pick a crop shape, then drag and zoom. <strong>Match photo</strong> fits portraits and panoramas
              without forcing a wide frame. Switch to 16:9 or 1:1 when you want a fixed thumbnail shape.
            </p>
            <div className="createPostCropModal__aspectRow" role="group" aria-label="Crop aspect ratio">
              <span className="createPostCropModal__aspectLabel">Shape</span>
              {ASPECT_CHOICES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className={
                    aspectPreset === key
                      ? "createPostCropModal__aspectBtn createPostCropModal__aspectBtn--active"
                      : "createPostCropModal__aspectBtn"
                  }
                  disabled={cropWorking}
                  onClick={() => selectAspectPreset(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="createPostCropModal__stage">
              <Cropper
                image={previewUrl}
                crop={crop}
                zoom={zoom}
                aspect={resolveAspectRatio(aspectPreset, mediaAspect)}
                objectFit="contain"
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
                onMediaLoaded={(ms) => {
                  const r = ms.naturalWidth / ms.naturalHeight;
                  if (Number.isFinite(r) && r > 0) {
                    setMediaAspect(Math.min(4, Math.max(0.25, r)));
                  }
                }}
              />
            </div>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="muted" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
                Zoom
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  style={{ flex: 1 }}
                  disabled={cropWorking}
                />
              </label>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button
                  className="primary-button btn-compact"
                  type="button"
                  disabled={cropWorking || !croppedAreaPixels}
                  onClick={applyCrop}
                >
                  {cropWorking ? "Saving…" : "Apply crop"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
