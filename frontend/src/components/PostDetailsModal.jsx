import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { addComment, deleteComment, toggleLike } from "../api/posts";
import ClickableAvatar from "./ClickableAvatar";
import ConfirmDialog from "./ConfirmDialog";
import PostEngagementModal from "./PostEngagementModal";
import RoleBadge from "./RoleBadge";
import timeAgo from "../utils/timeAgo";
import {
  BookOpenText,
  CalendarDays,
  CircleQuestionMark,
  FileText,
  FlaskConical,
  Heart,
  ICON_SIZE,
  Megaphone,
  MessageCircle,
  MessagesSquare,
} from "../utils/icons";

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
  question: CircleQuestionMark,
  research: FlaskConical,
  announcement: Megaphone,
  study: BookOpenText,
  event: CalendarDays,
  general: FileText,
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
  const [engagementOpen, setEngagementOpen] = useState(false);
  const [engagementInitialTab, setEngagementInitialTab] = useState("likes");

  if (!post) return null;

  const author = post.author || {};
  const authorId = typeof post.author === "object" && post.author !== null ? post.author._id : post.author;

  const likesCount = post.likes?.length || 0;
  const commentsCount = post.comments?.length || 0;
  const createdLabel = timeAgo(post.createdAt);
  const liked = hasUserLiked(post, currentUser);
  // Keep memoized helpers above (post likes are shown via PostEngagementModal).

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
          <button className="secondary-button btn-compact" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="postDetailsModal__scroll">
          <button
            type="button"
            className="postDetailsModal__author"
            onClick={() => {
              if (!authorId) return;
              // Match the rest of the app: every profile entry point
              // tells Profile.jsx to land at the profile card.
              navigate(`/profile/${authorId}`, {
                state: { focusProfileCard: true },
              });
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
            <ClickableAvatar
              user={author}
              currentUserId={currentUser?._id}
              imgClassName="postDetailsModal__authorAvatar"
            />
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
              <CategoryIcon size={ICON_SIZE.sm} style={{ marginRight: 6 }} aria-hidden="true" />
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
              <button
                type="button"
                className="postDetailsModal__statButton"
                onClick={() => {
                  setEngagementInitialTab("likes");
                  setEngagementOpen(true);
                }}
                aria-label="View likes"
                title="View likes"
              >
                <Heart size={ICON_SIZE.sm} aria-hidden />
                {likesCount} {likesCount === 1 ? "like" : "likes"}
              </button>
              <button
                type="button"
                className="postDetailsModal__statButton"
                onClick={() => {
                  setEngagementInitialTab("comments");
                  setEngagementOpen(true);
                }}
                aria-label="View comments"
                title="View comments"
              >
                <MessageCircle size={ICON_SIZE.sm} aria-hidden />
                {commentsCount} {commentsCount === 1 ? "comment" : "comments"}
              </button>
            </div>
            <button
              className={
                liked
                  ? "primary-button btn-compact btnWithIcon"
                  : "outline-button btn-compact btnWithIcon"
              }
              type="button"
              onClick={handleLike}
              disabled={likeBusy || !currentUser}
            >
              {likeBusy ? (
                "…"
              ) : (
                <>
                  <Heart
                    size={ICON_SIZE.sm}
                    aria-hidden
                    fill={liked ? "currentColor" : "none"}
                  />
                  {liked ? "Unlike" : "Like"}
                </>
              )}
            </button>
            {!currentUser ? <span className="muted" style={{ fontSize: "0.9rem" }}>Log in to like or comment.</span> : null}
          </div>

          {error ? <div className="alert alertError" style={{ marginBottom: 12 }}>{error}</div> : null}

          <div className="postDetailsModal__sectionTitle postDetailsModal__sectionTitle--withIcon" id="comments-heading">
            <MessagesSquare size={ICON_SIZE.sm} aria-hidden />
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
                const commentUserId =
                  typeof c.user === "object" && c.user !== null ? c.user._id : c.user;
                const canNavigateCommentUser = Boolean(commentUserId);
                return (
                  <div className="postDetailsModalCommentRow" key={c._id}>
                    <ClickableAvatar
                      user={u}
                      currentUserId={currentUser?._id}
                      imgClassName="postDetailsModalCommentRow__avatar"
                      ariaLabel={`Open ${u?.name || u?.username || "member"} profile`}
                      title={`Open ${u?.name || u?.username || "member"} profile`}
                    />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <button
                        type="button"
                        className="postDetailsModalCommentRow__authorButton"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!canNavigateCommentUser) return;
                          const isMe =
                            currentUser?._id && String(commentUserId) === String(currentUser._id);
                          navigate(isMe ? "/profile" : `/profile/${commentUserId}`, {
                            state: { focusProfileCard: true },
                          });
                        }}
                        style={{ cursor: canNavigateCommentUser ? "pointer" : "default" }}
                        aria-label={`Open ${u?.name || u?.username || "member"} profile`}
                      >
                        <span className="postDetailsModalCommentRow__authorName">
                          {u.name || "User"}
                        </span>
                        <RoleBadge role={u?.role} />
                        <span className="muted postDetailsModalCommentRow__authorUsername">
                          @{u.username || "user"}
                        </span>
                      </button>

                      <div className="postDetailsModalCommentRow__text">{c.text || ""}</div>
                      <div className="postDetailsModalCommentRow__meta">
                        <span className="muted">{commentDate}</span>
                      </div>
                    </div>
                    {showDelete ? (
                      <button
                        className="danger-button btn-compact"
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
                <button className="primary-button btn-compact" type="submit" disabled={commentSubmitDisabled}>
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

    <PostEngagementModal
      open={engagementOpen}
      post={post}
      currentUser={currentUser}
      initialTab={engagementInitialTab}
      onClose={() => setEngagementOpen(false)}
      onPostUpdated={onPostUpdated}
    />
    </>
  );
}
