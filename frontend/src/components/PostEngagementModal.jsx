import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { deleteComment, toggleCommentLike } from "../api/posts";
import ClickableAvatar from "./ClickableAvatar";
import ConfirmDialog from "./ConfirmDialog";
import RoleBadge from "./RoleBadge";
import timeAgo from "../utils/timeAgo";
import { Heart, ICON_SIZE, MessageCircle } from "../utils/icons";

function canDeleteComment(post, comment, currentUser) {
  if (!currentUser?._id) return false;
  const commentUserId =
    typeof comment.user === "object" && comment.user !== null ? comment.user._id : comment.user;
  const postAuthorId =
    typeof post.author === "object" && post.author !== null ? post.author._id : post.author;
  return (
    String(currentUser._id) === String(commentUserId) ||
    String(currentUser._id) === String(postAuthorId)
  );
}

function hasUserLikedComment(comment, currentUser) {
  if (!currentUser?._id) return false;
  const likesArr = Array.isArray(comment?.likes) ? comment.likes : [];
  return likesArr.some((idOrUser) => {
    const likeId = typeof idOrUser === "object" && idOrUser !== null ? idOrUser._id : idOrUser;
    return String(likeId) === String(currentUser._id);
  });
}

export default function PostEngagementModal({
  open,
  post,
  currentUser,
  initialTab = "likes",
  onClose,
  onPostUpdated,
}) {
  const navigate = useNavigate();
  const safePost = post || { likes: [], comments: [], author: null };
  const [activeTab, setActiveTab] = useState(initialTab);
  const [commentLikeBusyKey, setCommentLikeBusyKey] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [pendingDeleteCommentId, setPendingDeleteCommentId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
  }, [open, initialTab]);

  const likesUsers = useMemo(
    () =>
      Array.isArray(safePost?.likes)
        ? safePost.likes.filter((x) => x && typeof x === "object")
        : [],
    [safePost?.likes]
  );

  if (!open || !post) return null;

  const likeCount = safePost.likes?.length || 0;
  const commentCount = safePost.comments?.length || 0;
  const totalCount = likeCount + commentCount;
  const sizeClass =
    totalCount <= 3
      ? "postEngagementModal--compact"
      : totalCount <= 8
        ? "postEngagementModal--medium"
        : "postEngagementModal--large";

  function openProfile(user) {
    const userId = user?._id ? String(user._id) : "";
    if (!userId) return;
    const isMe = currentUser?._id && String(currentUser._id) === userId;
    navigate(isMe ? "/profile" : `/profile/${userId}`, { state: { focusProfileCard: true } });
    onClose?.();
  }

  async function handleToggleCommentLike(commentId) {
    if (!safePost?._id || !commentId || !currentUser?._id) return;
    const key = String(commentId);
    if (commentLikeBusyKey === key) return;
    setCommentLikeBusyKey(key);
    setError("");
    try {
      const res = await toggleCommentLike(safePost._id, commentId);
      onPostUpdated?.(res.data.post);
      // keep tab on comments after liking a comment
      setActiveTab("comments");
      window.dispatchEvent(new Event("notifications:refresh"));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Could not update comment like");
    } finally {
      setCommentLikeBusyKey("");
    }
  }

  async function confirmDeleteComment() {
    const commentId = pendingDeleteCommentId;
    if (!safePost?._id || !commentId) return;
    setPendingDeleteCommentId(null);
    setCommentBusy(true);
    setError("");
    try {
      const res = await deleteComment(safePost._id, commentId);
      onPostUpdated?.(res.data.post);
      setActiveTab("comments");
      window.dispatchEvent(new Event("notifications:refresh"));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Could not delete comment");
    } finally {
      setCommentBusy(false);
    }
  }

  return (
    <>
      <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Post engagement">
        <div className={`modalCard postEngagementModal ${sizeClass}`}>
          <div className="topbar" style={{ marginBottom: 10, flexShrink: 0 }}>
            <h2 style={{ marginBottom: 0 }}>Engagement</h2>
            <button
              className="secondary-button btn-compact"
              type="button"
              onClick={onClose}
              aria-label="Close"
            >
              Close
            </button>
          </div>

          <div className="postEngagementModal__tabs" role="tablist" aria-label="Engagement tabs">
            <button
              type="button"
              className={activeTab === "likes" ? "postEngagementModal__tab postEngagementModal__tab--active" : "postEngagementModal__tab"}
              onClick={() => setActiveTab("likes")}
              aria-selected={activeTab === "likes"}
              role="tab"
            >
              <Heart size={ICON_SIZE.sm} aria-hidden />
              Likes ({likeCount})
            </button>
            <button
              type="button"
              className={activeTab === "comments" ? "postEngagementModal__tab postEngagementModal__tab--active" : "postEngagementModal__tab"}
              onClick={() => setActiveTab("comments")}
              aria-selected={activeTab === "comments"}
              role="tab"
            >
              <MessageCircle size={ICON_SIZE.sm} aria-hidden />
              Comments ({commentCount})
            </button>
          </div>

          {error ? (
            <div className="alert alertError" style={{ marginTop: 10 }}>
              {error}
            </div>
          ) : null}

          <div className="postEngagementModal__body" role="tabpanel">
            {activeTab === "likes" ? (
              likesUsers.length === 0 ? (
                <div className="muted" style={{ padding: 12 }}>
                  No likes yet.
                </div>
              ) : (
                <div className="postEngagementModal__list" role="list">
                  {likesUsers.map((u, idx) => (
                    <button
                      key={u?._id || `${u?.username || "user"}-${idx}`}
                      type="button"
                      className="postEngagementModal__row"
                      onClick={() => openProfile(u)}
                      aria-label={`Open ${u?.name || u?.username || "user"} profile`}
                    >
                      <ClickableAvatar
                        user={u}
                        currentUserId={currentUser?._id}
                        imgClassName="postEngagementModal__avatar"
                      />
                      <div className="postEngagementModal__meta">
                        <div className="postEngagementModal__nameRow">
                          <span className="postEngagementModal__name">{u?.name || "User"}</span>
                          <RoleBadge role={u?.role} />
                        </div>
                        <div className="muted postEngagementModal__username">@{u?.username || "user"}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )
            ) : (post.comments || []).length === 0 ? (
              <div className="muted" style={{ padding: 12 }}>
                No comments yet.
              </div>
            ) : (
              <div className="postEngagementModal__comments">
                {(post.comments || []).map((c) => {
                  const u = c.user || {};
                  const commentDate = timeAgo(c.createdAt);
                  const commentLiked = hasUserLikedComment(c, currentUser);
                  const commentLikesCount = Array.isArray(c?.likes) ? c.likes.length : 0;
                  const showDelete = canDeleteComment(post, c, currentUser);
                  return (
                    <div className="postEngagementModal__commentRow" key={c._id}>
                      <ClickableAvatar
                        user={u}
                        currentUserId={currentUser?._id}
                        imgClassName="postEngagementModal__commentAvatar"
                        ariaLabel={`Open ${u?.name || u?.username || "member"} profile`}
                        title={`Open ${u?.name || u?.username || "member"} profile`}
                      />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <button
                          type="button"
                          className="postEngagementModal__commentAuthor"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openProfile(u);
                          }}
                          aria-label={`Open ${u?.name || u?.username || "member"} profile`}
                        >
                          <span className="postEngagementModal__commentName">{u.name || "User"}</span>
                          <RoleBadge role={u?.role} />
                          <span className="muted postEngagementModal__commentUsername">
                            @{u.username || "user"}
                          </span>
                        </button>

                        <div className="postEngagementModal__commentText">{c.text || ""}</div>
                        <div className="postEngagementModal__commentMeta">
                          <span className="muted">{commentDate}</span>
                          <button
                            type="button"
                            className={
                              commentLiked
                                ? "postEngagementModal__commentLike postEngagementModal__commentLike--active"
                                : "postEngagementModal__commentLike"
                            }
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleToggleCommentLike(c._id);
                            }}
                            disabled={!currentUser || commentLikeBusyKey === String(c._id)}
                            aria-label={commentLiked ? "Unlike comment" : "Like comment"}
                            title={commentLiked ? "Unlike comment" : "Like comment"}
                          >
                            <Heart size={ICON_SIZE.sm} aria-hidden fill={commentLiked ? "currentColor" : "none"} />
                            <span>{commentLikesCount}</span>
                          </button>
                        </div>
                      </div>

                      {showDelete ? (
                        <button
                          className="danger-button btn-compact"
                          type="button"
                          onClick={() => setPendingDeleteCommentId(c._id)}
                          disabled={commentBusy}
                          aria-label="Delete comment"
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
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

