import { useEffect, useMemo, useRef, useState } from "react";

import { createPost } from "../api/posts";

export default function CreatePostForm({
  onCreated,
  onPostCreated,
  placeholder = "Share something...",
}) {
  const fileInputRef = useRef(null);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const MAX_BYTES = 5 * 1024 * 1024;
  const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
  const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp"];

  const hasText = content.trim().length > 0;
  const hasImage = Boolean(imageFile);

  const canSubmit = useMemo(() => {
    return !submitting && (hasText || hasImage);
  }, [submitting, hasText, hasImage]);

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl("");
      return;
    }

    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  function clearForm() {
    setContent("");
    setCategory("general");
    setImageFile(null);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function validateAndSetImage(file) {
    if (!file) {
      setImageFile(null);
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

    setError("");
    setImageFile(file);
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
          className="input"
          rows={3}
          value={content}
          placeholder={placeholder}
          onChange={(e) => setContent(e.target.value)}
          maxLength={1000}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text-h)",
            font: "16px/1.25 system-ui",
            outline: "none",
          }}
        />

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            onChange={(e) => validateAndSetImage(e.target.files?.[0] || null)}
            disabled={submitting}
          />

          {imageFile ? (
            <button
              className="secondary-button btn-compact"
              type="button"
              onClick={() => validateAndSetImage(null)}
              disabled={submitting}
            >
              Remove image
            </button>
          ) : null}

          <button className="primary-button btn-compact" type="submit" disabled={!canSubmit}>
            {submitting ? "Posting..." : "Post"}
          </button>
        </div>

        {previewUrl ? (
          <div>
            <img
              src={previewUrl}
              alt="Preview"
              style={{ width: "100%", maxWidth: 520, borderRadius: 12, display: "block" }}
            />
          </div>
        ) : null}

        {error ? <div className="alert alertError">{error}</div> : null}
      </div>
    </form>
  );
}
