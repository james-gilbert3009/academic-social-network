import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../api";

/**
 * Resolve the URL to use for a user's avatar image.
 *
 * - `/uploads/...` paths come from our own backend and need to be prefixed
 *   with API_BASE_URL.
 * - Anything else is assumed to already be an absolute URL.
 * - Missing / empty profileImage falls back to a deterministic Dicebear
 *   initials avatar so users without a photo still get something visual
 *   instead of an empty box. This mirrors the helper that previously
 *   lived inline at every avatar render site.
 */
function resolveAvatarSrc(user) {
  const raw = user?.profileImage;
  if (raw) {
    const path = String(raw);
    if (path.startsWith("/uploads")) return `${API_BASE_URL}${path}`;
    return path;
  }
  const seed = encodeURIComponent(user?.name || user?.username || "User");
  return `https://api.dicebear.com/8.x/initials/png?seed=${seed}&size=96`;
}

/**
 * A small avatar tile that navigates to the corresponding user's profile
 * when clicked. Used in places where avatars sit inside a larger
 * interactive row (feed post header, conversation row, notification row,
 * etc.) — clicking the avatar opens the profile WITHOUT triggering the
 * row's own click handler, because we stopPropagation + preventDefault
 * before navigating.
 *
 * Behavior:
 * - If `user._id === currentUserId`, navigates to `/profile`.
 * - Otherwise navigates to `/profile/<user._id>`.
 * - If the user has no `_id` (e.g. a deleted account), the avatar is
 *   rendered as a plain non-interactive image — clicking does nothing
 *   and the element is omitted from the tab order.
 *
 * Rendering:
 * - The wrapper element is a `<span role="button">`, not a real
 *   `<button>`, so it can be safely nested inside parent buttons (the
 *   conversation list, the notifications dropdown, etc.) without
 *   producing invalid button-in-button HTML. The role + tabIndex +
 *   keyboard handling keep it accessible to screen-reader and
 *   keyboard users.
 * - The inner `<img>` keeps whatever className the call site passes via
 *   `imgClassName` (e.g. `.messagesListItem__avatar`), which is what
 *   actually drives the visual size — `.clickableAvatar` itself doesn't
 *   force a size, so existing layouts continue to work unchanged.
 */
export default function ClickableAvatar({
  user,
  currentUserId,
  size,
  className = "",
  imgClassName = "",
  imgStyle,
  ariaLabel,
  title,
}) {
  const navigate = useNavigate();
  const userId = user?._id ? String(user._id) : "";
  const meId = currentUserId ? String(currentUserId) : "";
  const enabled = Boolean(userId);

  const displayName = user?.name || user?.username || "user";
  const computedAriaLabel = ariaLabel || `View ${displayName}'s profile`;
  const computedTitle = title || computedAriaLabel;
  const src = resolveAvatarSrc(user);

  function navigateToProfile() {
    if (!enabled) return;
    // Always tag the navigation with `focusProfileCard` so the Profile
    // page scrolls back to the top of the profile card on arrival,
    // regardless of where the previous Profile view was scrolled (e.g.
    // deep into someone else's posts grid). Profile.jsx watches for this
    // state and clears it after handling.
    const navOptions = { state: { focusProfileCard: true } };
    if (meId && userId === meId) {
      navigate("/profile", navOptions);
    } else {
      navigate(`/profile/${userId}`, navOptions);
    }
  }

  function onClick(event) {
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
    navigateToProfile();
  }

  function onKeyDown(event) {
    if (!enabled) return;
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      event.stopPropagation();
      navigateToProfile();
    }
  }

  // Stop pointer events from bubbling so a parent row's onClick (e.g. a
  // conversation row that opens the chat) doesn't double-fire when the
  // user actually meant to click the avatar. We do this on the down
  // event too so even no-op clicks (mouse-down without release) stay
  // contained.
  function stop(event) {
    if (!enabled) return;
    event.stopPropagation();
  }

  const sizePx = typeof size === "number" ? size : null;
  const finalImgStyle = sizePx
    ? { width: sizePx, height: sizePx, ...(imgStyle || {}) }
    : imgStyle;

  const cls = ["clickableAvatar"];
  if (!enabled) cls.push("clickableAvatar--static");
  if (className) cls.push(className);

  return (
    <span
      role={enabled ? "button" : undefined}
      tabIndex={enabled ? 0 : undefined}
      className={cls.join(" ")}
      onClick={onClick}
      onMouseDown={stop}
      onKeyDown={onKeyDown}
      aria-label={enabled ? computedAriaLabel : undefined}
      title={enabled ? computedTitle : undefined}
      data-clickable-avatar="true"
    >
      <img
        src={src}
        alt=""
        className={imgClassName || undefined}
        style={finalImgStyle}
        loading="lazy"
        draggable={false}
      />
    </span>
  );
}
