import { API_BASE_URL } from "../api";
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
} from "../utils/icons";

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

function imageSrc(post) {
  const img = post?.image || "";
  if (!img) return "";
  if (img.startsWith("/uploads")) return `${API_BASE_URL}${img}`;
  return img;
}

export default function ProfilePostCard({ post, currentUserId, onClick, onEdit, onDelete }) {
  const likeCount = Array.isArray(post?.likes) ? post.likes.length : 0;
  const commentCount = Array.isArray(post?.comments) ? post.comments.length : 0;
  const createdLabel = timeAgo(post?.createdAt);
  const categoryKey = String(post?.category || "general").toLowerCase();
  const categoryLabel = CATEGORY_LABELS[categoryKey] || CATEGORY_LABELS.general;
  const caption = String(post?.content || "").trim();
  const CategoryIcon = CATEGORY_ICONS[categoryKey] || CATEGORY_ICONS.general;

  const authorId = String(post?.author?._id || post?.author || "");
  const isOwner = currentUserId && authorId && String(currentUserId) === authorId;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(post)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(post);
        }
      }}
      className="profilePostCard"
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      {post?.image ? (
        <div className="profilePostCard__media">
          <img
            src={imageSrc(post)}
            alt="post"
            className="profilePostCard__mediaImg"
          />
        </div>
      ) : (
        <div
          className={`profilePostCard__media profilePostCard__placeholder profilePostCard__placeholder--${categoryKey}`}
          aria-label={`${categoryLabel} post`}
        >
          <div className="profilePostCard__placeholderInner">
            <CategoryIcon className="profilePostCard__placeholderIcon" aria-hidden="true" />
            <div className="profilePostCard__placeholderLabel">{categoryLabel}</div>
          </div>
        </div>
      )}

      <div className="profilePostCard__content">
        <div>
          <span className={`postCategoryBadge postCategoryBadge--${categoryKey}`}>
            {categoryLabel}
          </span>
        </div>

        <div className={`profilePostCard__caption ${caption ? "" : "profilePostCard__caption--empty"}`}>
          {caption || "No caption"}
        </div>

        <div className="muted" style={{ fontSize: 13, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span className="profilePostCard__metaItem">
            <Heart size={ICON_SIZE.sm} aria-hidden />
            Likes: {likeCount}
          </span>
          <span className="profilePostCard__metaItem">
            <MessageCircle size={ICON_SIZE.sm} aria-hidden />
            Comments: {commentCount}
          </span>
          {createdLabel ? <span>{createdLabel}</span> : null}
        </div>

        {isOwner ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.(post);
              }}
            >
              Edit
            </button>
            <button
              className="btn btnDanger"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(post);
              }}
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

