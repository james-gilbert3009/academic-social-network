import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import timeAgo from "../utils/timeAgo";
import RoleBadge from "./RoleBadge";
import {
  BookOpenText,
  CalendarDays,
  CircleQuestionMark,
  EllipsisVertical,
  FileText,
  FlaskConical,
  Heart,
  ICON_SIZE,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  Plus,
  Share2,
} from "../utils/icons";
import SharePostModal from "./SharePostModal";
import ClickableAvatar from "./ClickableAvatar";
import PostEngagementModal from "./PostEngagementModal";

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

/** Grapheme-safe-ish truncation using code points (better than raw substring for many emoji). */
function truncateCaptionChars(text, maxChars) {
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  return chars.slice(0, maxChars).join("");
}

const CAPTION_PREVIEW_CHARS = 260;

function hasLiked(post, currentUser) {
  if (!currentUser?._id || !Array.isArray(post?.likes)) return false;
  return post.likes.some((id) => {
    const likeId = typeof id === "object" && id !== null ? id._id : id;
    return String(likeId) === String(currentUser._id);
  });
}

export default function FeedPostCard({
  post,
  currentUser,
  actionsMenuOpen,
  onToggleActionsMenu,
  onCloseActionsMenu,
  followBusy,
  onToggleFollow,
  onLike,
  onEdit,
  onDelete,
  onOpenDetails,
  onPostUpdated,
}) {
  const navigate = useNavigate();
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [engagementOpen, setEngagementOpen] = useState(false);
  const [engagementInitialTab, setEngagementInitialTab] = useState("likes");
  const actionsWrapRef = useRef(null);
  const author = post.author || {};
  const authorId = typeof post.author === "object" ? post.author?._id : post.author;
  const isOwner = currentUser?._id && authorId && String(currentUser._id) === String(authorId);
  const canShowConnect = Boolean(currentUser?._id && authorId && !isOwner);

  /**
   * Single source of truth for "open this post's author profile".
   *
   * Used by every clickable identity surface inside the post card (avatar,
   * name, username, time row). Always:
   *   1. cancels the click so it can't bubble up to a future card-level
   *      handler (e.g. opening post details by clicking the card),
   *   2. routes to `/profile` for the current user and `/profile/:id` for
   *      everyone else — never to `/profile/:myId`, which would behave
   *      differently from the navbar profile link,
   *   3. tags the navigation with `focusProfileCard` so Profile.jsx
   *      scrolls back up to the profile card instead of leaving the page
   *      scrolled into someone else's posts grid from a previous visit.
   */
  function handleOpenAuthorProfile(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!authorId) return;
    const isMe = currentUser?._id && String(authorId) === String(currentUser._id);
    navigate(isMe ? "/profile" : `/profile/${authorId}`, {
      state: { focusProfileCard: true },
    });
  }

  const isFollowing = Boolean(author?.isFollowing);
  const isFollower = Boolean(author?.isFollower);
  const isFriend = Boolean(author?.isFriend);

  const connectLabel = isFriend
    ? "Connected"
    : isFollower && !isFollowing
      ? "Connect Back"
      : isFollowing
        ? "Following"
        : "Connect";

  const shouldShowPlusIcon = !isFollowing && !isFriend;

  const likeCount = post.likes?.length || 0;
  const commentCount = post.comments?.length || 0;
  const liked = hasLiked(post, currentUser);
  const previewComments = (post.comments || []).slice(0, 2);

  const fullCaption = post.content ?? "";
  const captionTrimmed = fullCaption.trim();
  const captionChars = Array.from(fullCaption);
  const captionTooLong = captionChars.length > CAPTION_PREVIEW_CHARS;
  const captionPreview = captionTooLong ? truncateCaptionChars(fullCaption, CAPTION_PREVIEW_CHARS) : fullCaption;
  const hasImage = Boolean(post.image && String(post.image).trim());
  const timeLabel = timeAgo(post.createdAt);
  const authorProfileId = authorId ? String(authorId) : "";
  const categoryKey = String(post?.category || "general").toLowerCase();
  const categoryLabel = CATEGORY_LABELS[categoryKey] || CATEGORY_LABELS.general;
  const CategoryIcon = CATEGORY_ICONS[categoryKey] || CATEGORY_ICONS.general;

  useEffect(() => {
    if (!actionsMenuOpen) return;

    function onDocPointerDown(e) {
      const wrap = actionsWrapRef.current;
      if (!wrap) return;
      if (wrap.contains(e.target)) return;
      onCloseActionsMenu?.();
    }

    function onDocKeyDown(e) {
      if (e.key !== "Escape") return;
      onCloseActionsMenu?.();
    }

    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [actionsMenuOpen, onCloseActionsMenu]);

  return (
    <article className="card feedPostCard">
      <header className="feedPostCard__header">
        <div className="feedPostHeader">
          <ClickableAvatar
            user={author}
            currentUserId={currentUser?._id}
            className="feedPostAuthorAvatar"
            imgClassName="feedPostCard__avatar"
          />

          <div
            className={
              canShowConnect
                ? "feedPostAuthorMeta feedPostAuthorMeta--hasConnect"
                : "feedPostAuthorMeta"
            }
          >
            <button
              type="button"
              className="feedPostAuthorMetaProfile"
              onClick={handleOpenAuthorProfile}
              style={{ cursor: authorProfileId ? "pointer" : "default" }}
              aria-label={`Open ${author.name || author.username || "member"} profile`}
            >
              <div className="feedPostAuthorTopLine">
                <span className="feedPostAuthorName">{author.name || "Someone"}</span>
                <span className="feedPostRoleBadge">
                  <RoleBadge role={author?.role} />
                </span>
              </div>

              <div className="feedPostAuthorUsername">@{author.username || "user"}</div>
              {timeLabel ? <div className="feedPostAuthorDate">{timeLabel}</div> : null}
            </button>

            {canShowConnect ? (
              <button
                type="button"
                className={
                  isFriend
                    ? "feedPostRelationshipButton feedPostRelationshipButton--connected"
                    : isFollowing
                      ? "feedPostRelationshipButton feedPostRelationshipButton--following"
                      : "feedPostRelationshipButton"
                }
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleFollow?.(author);
                }}
                disabled={Boolean(followBusy)}
                aria-label={`Connect with ${author.name || author.username || "member"}`}
                title={connectLabel}
              >
                {shouldShowPlusIcon ? <Plus size={ICON_SIZE.sm} aria-hidden="true" className="feedPostRelationshipButton__icon" /> : null}
                <span className="feedPostRelationshipButton__text feedPostRelationshipButton__text--full">
                  {connectLabel}
                </span>
              </button>
            ) : null}
          </div>

          <div className="feedPostHeaderRight">
            {isOwner ? (
              <div className="postCardActions" ref={actionsWrapRef}>
                <button
                  type="button"
                  className="postCardActions__trigger"
                  aria-label="Post actions"
                  aria-haspopup="menu"
                  aria-expanded={Boolean(actionsMenuOpen)}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleActionsMenu?.();
                  }}
                >
                  <EllipsisVertical
                    size={ICON_SIZE.lg}
                    aria-hidden="true"
                    className="postCardActions__dots"
                  />
                </button>

                {actionsMenuOpen ? (
                  <div
                    className="postCardActions__menu"
                    role="menu"
                    aria-label="Post actions"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <button
                      type="button"
                      className="postCardActions__item"
                      role="menuitem"
                      onClick={() => {
                        onCloseActionsMenu?.();
                        onEdit?.(post);
                      }}
                    >
                      Edit post
                    </button>
                    <button
                      type="button"
                      className="postCardActions__item postCardActions__item--danger"
                      role="menuitem"
                      onClick={() => {
                        onCloseActionsMenu?.();
                        onDelete?.(post);
                      }}
                    >
                      Delete post
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

      </header>

      <div style={{ marginTop: 12 }}>
        <span className={`postCategoryBadge postCategoryBadge--${categoryKey}`}>
          <CategoryIcon size={ICON_SIZE.sm} style={{ marginRight: 6 }} aria-hidden="true" />
          {categoryLabel}
        </span>
      </div>

      {captionTrimmed ? (
        <div className="feedPostCard__body">
          {captionTooLong && !captionExpanded ? (
            <>
              <span className="feedPostCard__bodyText">{captionPreview}</span>
              …{" "}
              <button
                type="button"
                className="feedPostCard__captionToggle"
                onClick={() => setCaptionExpanded(true)}
              >
                See more…
              </button>
            </>
          ) : (
            <>
              <span className="feedPostCard__bodyText">{fullCaption}</span>
              {captionTooLong && captionExpanded ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className="feedPostCard__captionToggle"
                    onClick={() => setCaptionExpanded(false)}
                  >
                    See less
                  </button>
                </>
              ) : null}
            </>
          )}
        </div>
      ) : !hasImage ? (
        <div className="feedPostCard__body feedPostCard__body--empty">No caption</div>
      ) : null}

      {post.image ? (
        <div className="feedPostCard__media">
          <div className="feedPostCard__imageWrap">
            <img className="feedPostCard__image" src={uploadUrl(post.image)} alt="" />
          </div>
        </div>
      ) : null}

      <footer className="feedPostCard__toolbar">
        <div className="feedPostCard__stats" aria-label="Engagement">
          <button
            type="button"
            className="feedPostCard__statButton"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEngagementInitialTab("likes");
              setEngagementOpen(true);
            }}
            aria-label="View likes"
            title="View likes"
          >
            <Heart size={ICON_SIZE.sm} aria-hidden />
            {likeCount} {likeCount === 1 ? "like" : "likes"}
          </button>
          <button
            type="button"
            className="feedPostCard__statButton"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEngagementInitialTab("comments");
              setEngagementOpen(true);
            }}
            aria-label="View comments"
            title="View comments"
          >
            <MessageCircle size={ICON_SIZE.sm} aria-hidden />
            {commentCount} {commentCount === 1 ? "comment" : "comments"}
          </button>
        </div>
        <div className="feedPostCard__actions">
          <button
            className="btn btnPrimary btnWithIcon"
            type="button"
            onClick={() => onLike?.(post)}
            disabled={!currentUser}
          >
            <Heart
              size={ICON_SIZE.sm}
              aria-hidden
              fill={liked ? "currentColor" : "none"}
            />
            {liked ? "Unlike" : "Like"}
          </button>
          <button className="btn btnWithIcon" type="button" onClick={() => onOpenDetails?.(post)}>
            <MessageCircle size={ICON_SIZE.sm} aria-hidden />
            Comments
          </button>
          <button
            className="btn btnWithIcon"
            type="button"
            onClick={() => setShareOpen(true)}
            disabled={!currentUser}
            title="Share"
          >
            <Share2 size={ICON_SIZE.sm} aria-hidden />
            Share
          </button>
        </div>
      </footer>

      {previewComments.length > 0 ? (
        <div className="feedPostCard__preview">
          <div className="feedPostCard__previewLabel">Latest replies</div>
          {previewComments.map((c) => {
            const u = c.user || {};
            const snippet = String(c.text || "").slice(0, 80);
            return (
              <div className="feedPostCard__previewItem" key={c._id}>
                <strong style={{ color: "var(--text-h)" }}>{u.name || "User"}</strong>{" "}
                <span className="muted">{snippet}</span>
                {c.text && c.text.length > 80 ? "…" : ""}
              </div>
            );
          })}
          {commentCount > 2 ? (
            <button
              className="secondary-button btn-compact btnWithIcon"
              type="button"
              style={{ marginTop: 10 }}
              onClick={() => onOpenDetails?.(post)}
            >
              <MessagesSquare size={ICON_SIZE.sm} aria-hidden />
              View all comments
            </button>
          ) : null}
        </div>
      ) : null}

      <SharePostModal
        open={shareOpen}
        post={post}
        me={currentUser}
        onClose={() => setShareOpen(false)}
      />

      <PostEngagementModal
        open={engagementOpen}
        post={post}
        currentUser={currentUser}
        initialTab={engagementInitialTab}
        onClose={() => setEngagementOpen(false)}
        onPostUpdated={onPostUpdated}
      />
    </article>
  );
}
