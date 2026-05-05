import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { addComment, deleteComment, toggleLike } from "../api/posts";
import ConfirmDialog from "./ConfirmDialog";
import RoleBadge from "./RoleBadge";
import timeAgo from "../utils/timeAgo";
import {
  FaBook,
  FaBullhorn,
  FaCalendarAlt,
  FaFlask,
  FaQuestionCircle,
  FaRegFileAlt,
} from "react-icons/fa";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const CATEGORY_LABELS = {
  question: "Question",
  research: "Research",
  announcement: "Announcement",
  study: "Study Material",
  event: "Event",
  general: "General",
};

const CATEGORY_ICONS = {
  question: FaQuestionCircle,
  research: FaFlask,
  announcement: FaBullhorn,
  study: FaBook,
  event: FaCalendarAlt,
  general: FaRegFileAlt,
};

function uploadUrl(path) {
  if (!path) return "";
  if (path.startsWith("/uploads")) return `${API_BASE_URL}${path}`;
  return path;
}

function hasUserLiked(post, currentUser) {
  if (!currentUser?._id || !Array.isArray(post?.likes)) return false;
  return post.likes.some((id) => {
    const likeId = typeof id === "object" && id !== null ? id._id : id;
    return String(likeId) === String(currentUser._id);
  });
}

function canDeleteComment(post, comment, currentUser) {
  if (!currentUser?._id) return false;
  const commentUserId =
    typeof comment.user === "object" && comment.user !== null
      ? comment.user._id
      : comment.user;
  const postAuthorId =
    typeof post.author === "object" && post.author !== null ? post.author._id : post.author;
  return (
    String(currentUser._id) === String(commentUserId) ||
    String(currentUser._id) === String(postAuthorId)
  );
}

export default function PostDetailsModal({ post, currentUser, onClose, onPostUpdated }) {
  const navigate = useNavigate();
  const [commentText, setCommentText] = useState("");
  const [likeBusy, setLikeBusy] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingDeleteCommentId, setPendingDeleteCommentId] = useState(null);

  if (!post) return null;

  const author = post.author || {};
  const authorId = typeof post.author === "object" && post.author !== null ? post.author._id : post.author;
  const avatarSrc =
    uploadUrl(author.profileImage) ||
    `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(author.name || "User")}`;

  const likesCount = post.likes?.length || 0;
  const commentsCount = post.comments?.length || 0;
  const createdLabel = timeAgo(post.createdAt);
  const liked = hasUserLiked(post, currentUser);

  const caption = (post.content || "").trim();
  const hasImage = Boolean(post.image && String(post.image).trim());
  const categoryKey = String(post?.category || "general").toLowerCase();
  const categoryLabel = CATEGORY_LABELS[categoryKey] || CATEGORY_LABELS.general;
  const CategoryIcon = CATEGORY_ICONS[categoryKey] || CATEGORY_ICONS.general;

  const commentTrimmed = commentText.trim();
  const commentSubmitDisabled = commentBusy || !commentTrimmed;

  async function handleLike() {
    if (!post._id || !currentUser) return;
    setLikeBusy(true);
    setError("");
    try {
      const res = await toggleLike(post._id);
      onPostUpdated?.(res.data.post);
      window.dispatchEvent(new Event("notifications:refresh"));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Could not update like");
    } finally {
      setLikeBusy(false);
    }
  }

  async function handleAddComment(e) {
    e.preventDefault();
    if (!commentTrimmed || !post._id || !currentUser) return;
    setCommentBusy(true);
    setError("");
    try {
      const res = await addComment(post._id, commentTrimmed);
      setCommentText("");
      onPostUpdated?.(res.data.post);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Could not add comment");
    } finally {
      setCommentBusy(false);
    }
  }

  async function confirmDeleteComment() {
    const commentId = pendingDeleteCommentId;
    if (!post._id || !commentId) return;
    setPendingDeleteCommentId(null);
    setCommentBusy(true);
    setError("");
    try {
      const res = await deleteComment(post._id, commentId);
      onPostUpdated?.(res.data.post);
      window.dispatchEvent(new Event("notifications:refresh"));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Could not delete comment");
    } finally {
      setCommentBusy(false);
    }
  }

  return (
    <>
    <div className="modalOverlay" role="dialog" aria-modal="true" aria-labelledby="post-details-title">
      <div className="modalCard postDetailsModal">
        <div className="topbar" style={{ marginBottom: 12, flexShrink: 0 }}>
          <h2 id="post-details-title" style={{ marginBottom: 0 }}>
            Post
          </h2>
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="postDetailsModal__scroll">
          <button
            type="button"
            className="postDetailsModal__author"
            onClick={() => {
              if (!authorId) return;
              navigate(`/profile/${authorId}`);
              onClose?.();
            }}
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              cursor: authorId ? "pointer" : "default",
              textAlign: "left",
              width: "100%",
            }}
          >
            <img className="postDetailsModal__authorAvatar" src={avatarSrc} alt="" />
            <div>
              <div
                style={{
                  fontWeight: 700,
                  color: "var(--text-h)",
                  fontSize: "1.02rem",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <span>{author.name || "Unknown"}</span>
                <RoleBadge role={author?.role} />
              </div>
              <div className="muted" style={{ fontSize: "0.95rem", marginTop: 2 }}>
                @{author.username || "user"}
              </div>
              <div className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
                {createdLabel}
              </div>
            </div>
          </button>

          {hasImage ? (
            <div className="postDetailsModalImageWrap">
              <img src={uploadUrl(post.image)} alt="Post attachment" />
            </div>
          ) : null}

          <div style={{ marginBottom: 10 }}>
            <span className={`postCategoryBadge postCategoryBadge--${categoryKey}`}>
              <CategoryIcon style={{ marginRight: 6 }} aria-hidden="true" />
              {categoryLabel}
            </span>
          </div>

          {caption ? (
            <div className="postDetailsModal__content">{post.content}</div>
          ) : (
            <div className="postDetailsModal__content postDetailsModal__content--empty">No caption</div>
          )}

          <div className="postDetailsModal__engagement">
            <div className="postDetailsModal__stats" aria-live="polite">
              <span>
                {likesCount} {likesCount === 1 ? "like" : "likes"}
              </span>
              <span>
                {commentsCount} {commentsCount === 1 ? "comment" : "comments"}
              </span>
            </div>
            <button
              className="btn btnPrimary"
              type="button"
              onClick={handleLike}
              disabled={likeBusy || !currentUser}
            >
              {likeBusy ? "…" : liked ? "Unlike" : "Like"}
            </button>
            {!currentUser ? <span className="muted" style={{ fontSize: "0.9rem" }}>Log in to like or comment.</span> : null}
          </div>

          {error ? <div className="alert alertError" style={{ marginBottom: 12 }}>{error}</div> : null}

          <div className="postDetailsModal__sectionTitle" id="comments-heading">
            Comments
          </div>
          <div className="postDetailsModalComments" role="region" aria-labelledby="comments-heading">
            {(post.comments || []).length === 0 ? (
              <p className="postDetailsModalComments__empty" role="status">
                No comments yet.
              </p>
            ) : (
              (post.comments || []).map((c) => {
                const u = c.user || {};
                const commentDate = timeAgo(c.createdAt);
                const showDelete = canDeleteComment(post, c, currentUser);
                return (
                  <div className="postDetailsModalCommentRow" key={c._id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          color: "var(--text-h)",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <span>{u.name || "User"}</span>
                        <RoleBadge role={u?.role} />
                      </div>
                      <div style={{ whiteSpace: "pre-wrap", marginTop: 6, lineHeight: 1.45 }}>{c.text || ""}</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        {commentDate}
                      </div>
                    </div>
                    {showDelete ? (
                      <button
                        className="btn btnDanger"
                        type="button"
                        onClick={() => setPendingDeleteCommentId(c._id)}
                        disabled={commentBusy}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          {currentUser ? (
            <form className="postDetailsModal__composer" onSubmit={handleAddComment}>
              <div className="postDetailsModal__sectionTitle" style={{ marginTop: 0 }}>
                Add a comment
              </div>
              <div className="postDetailsModal__composerRow">
                <input
                  className="postDetailsModal__composerInput"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Write a comment…"
                  disabled={commentBusy}
                  aria-label="Comment text"
                />
                <button className="btn btnPrimary" type="submit" disabled={commentSubmitDisabled}>
                  {commentBusy ? "Posting…" : "Post comment"}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>

    <ConfirmDialog
      open={Boolean(pendingDeleteCommentId)}
      title="Delete comment"
      message="Are you sure you want to delete this comment?"
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onCancel={() => setPendingDeleteCommentId(null)}
      onConfirm={confirmDeleteComment}
    />
    </>
  );
}
