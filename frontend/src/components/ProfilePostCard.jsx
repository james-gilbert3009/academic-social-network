import { API_BASE_URL } from "../api";
import timeAgo from "../utils/timeAgo";

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
      style={{
        border: "1px solid var(--border)",
        borderRadius: 14,
        background: "color-mix(in oklab, var(--bg) 94%, var(--social-bg) 6%)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        minHeight: 160,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {post?.image ? (
        <div style={{ width: "100%", aspectRatio: "4 / 3", background: "var(--code-bg)" }}>
          <img
            src={imageSrc(post)}
            alt="post"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      ) : null}

      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ whiteSpace: "pre-wrap", color: "var(--text-h)" }}>
          {post?.content || ""}
        </div>

        <div className="muted" style={{ fontSize: 13, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span>Likes: {likeCount}</span>
          <span>Comments: {commentCount}</span>
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

