import { useNavigate } from "react-router-dom";
import timeAgo from "../utils/timeAgo";
import RoleBadge from "./RoleBadge";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

function uploadUrl(path) {
  if (!path) return "";
  if (path.startsWith("/uploads")) return `${API_BASE_URL}${path}`;
  return path;
}

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
  onLike,
  onEdit,
  onDelete,
  onOpenDetails,
}) {
  const navigate = useNavigate();
  const author = post.author || {};
  const authorId = typeof post.author === "object" ? post.author?._id : post.author;
  const isOwner = currentUser?._id && authorId && String(currentUser._id) === String(authorId);

  const avatarSrc =
    uploadUrl(author.profileImage) ||
    `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(author.name || "User")}`;

  const likeCount = post.likes?.length || 0;
  const commentCount = post.comments?.length || 0;
  const liked = hasLiked(post, currentUser);
  const previewComments = (post.comments || []).slice(0, 2);

  const caption = (post.content || "").trim();
  const hasImage = Boolean(post.image && String(post.image).trim());
  const timeLabel = timeAgo(post.createdAt);
  const authorProfileId = authorId ? String(authorId) : "";

  return (
    <article className="card feedPostCard">
      <header className="feedPostCard__header">
        <button
          type="button"
          className="feedPostCard__authorRow"
          onClick={() => {
            if (!authorProfileId) return;
            navigate(`/profile/${authorProfileId}`);
          }}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            margin: 0,
            cursor: authorProfileId ? "pointer" : "default",
            textAlign: "left",
          }}
        >
          <img className="feedPostCard__avatar" src={avatarSrc} alt="" />
          <div className="feedPostCard__names">
            <div
              className="feedPostCard__displayName"
              style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
            >
              <span>{author.name || "Someone"}</span>
              <RoleBadge role={author?.role} />
            </div>
            <div className="feedPostCard__username">@{author.username || "user"}</div>
            {timeLabel ? <div className="feedPostCard__time">{timeLabel}</div> : null}
          </div>
        </button>

        {isOwner ? (
          <div className="feedPostCard__ownerActions">
            <button className="btn" type="button" onClick={() => onEdit?.(post)}>
              Edit
            </button>
            <button className="btn btnDanger" type="button" onClick={() => onDelete?.(post)}>
              Delete
            </button>
          </div>
        ) : null}
      </header>

      {caption ? (
        <div className="feedPostCard__body">{post.content}</div>
      ) : !hasImage ? (
        <div className="feedPostCard__body feedPostCard__body--empty">No caption</div>
      ) : null}

      {post.image ? (
        <div className="feedPostCard__media">
          <img src={uploadUrl(post.image)} alt="" />
        </div>
      ) : null}

      <footer className="feedPostCard__toolbar">
        <div className="feedPostCard__stats" aria-label="Engagement">
          <span>{likeCount} {likeCount === 1 ? "like" : "likes"}</span>
          <span>{commentCount} {commentCount === 1 ? "comment" : "comments"}</span>
        </div>
        <div className="feedPostCard__actions">
          <button
            className="btn btnPrimary"
            type="button"
            onClick={() => onLike?.(post)}
            disabled={!currentUser}
          >
            {liked ? "Unlike" : "Like"}
          </button>
          <button className="btn" type="button" onClick={() => onOpenDetails?.(post)}>
            Comments
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
            <button className="btn" type="button" style={{ marginTop: 10 }} onClick={() => onOpenDetails?.(post)}>
              View all comments
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
