import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { API_BASE_URL, setAuthToken } from "../api";
import { getProfile, getProfileById, updateProfile } from "../api/profile";
import { deletePost, getPostsByUser } from "../api/posts";
import {
  blockUser,
  deleteMyAccount,
  getConnections,
  getFollowers,
  getFollowing,
  toggleFollow,
  unblockUser,
} from "../api/users";
import AppHeader from "../components/AppHeader.jsx";
import ConfirmDialog from "../components/ConfirmDialog";
import CreatePostForm from "../components/CreatePostForm";
import NotificationsDropdown from "../components/NotificationsDropdown.jsx";
import PostDetailsModal from "../components/PostDetailsModal";
import ProfilePostCard from "../components/ProfilePostCard";
import ProfileAvatar from "../components/ProfileAvatar";
import ProfileForm, { ProfileHeaderActions, ProfileIdentityBlock } from "../components/ProfileForm";
import FollowListModal from "../components/FollowListModal";
import UserSearch from "../components/UserSearch";
import { openConversationTarget } from "../api/messages";
import { Ban, ICON_SIZE, MessageCircle, Unlock } from "../utils/icons";

function toCommaList(arr) {
  if (!Array.isArray(arr)) return "";
  return arr.join(", ");
}

function fromCommaList(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Full URL for displaying profileImage (handles /uploads paths from the API). */
function profileImageSrc(profileImage) {
  if (!profileImage) return null;
  if (profileImage.startsWith("/uploads")) {
    return `${API_BASE_URL}${profileImage}`;
  }
  return profileImage;
}

export default function Profile() {
  const navigate = useNavigate();
  const { userId: routeUserId } = useParams();
  const location = useLocation();
  const handledEditRouteKey = useRef(null);
  const handledDeleteRouteKey = useRef(null);
  const handledFocusProfileCardKey = useRef(null);
  // Pointer to the profile card section so we can `scrollIntoView` it when
  // we arrive from a "click avatar / name in the feed" navigation. Lives
  // on whichever card variant is rendered (regular or restricted/blocked).
  const profileCardRef = useRef(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [me, setMe] = useState(null);
  const [user, setUser] = useState(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollower, setIsFollower] = useState(false);
  const [isFriend, setIsFriend] = useState(false);
  const [followListOpen, setFollowListOpen] = useState(false);
  const [followListTitle, setFollowListTitle] = useState("");
  const [followListHelper, setFollowListHelper] = useState("");
  const [followListUsers, setFollowListUsers] = useState([]);
  const [followListLoading, setFollowListLoading] = useState(false);
  const [followListBusyIds, setFollowListBusyIds] = useState([]);
  const [profilePhotoBusy, setProfilePhotoBusy] = useState(false);
  const [profilePosts, setProfilePosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState("");
  const [showCreatePostModal, setShowCreatePostModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [showPostDetailsModal, setShowPostDetailsModal] = useState(false);
  const [postPendingDelete, setPostPendingDelete] = useState(null);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);

  const [form, setForm] = useState({
    name: "",
    bio: "",
    faculty: "",
    program: "",
    skills: "",
    interests: "",
  });

  const canSave = useMemo(() => !saving, [saving]);

  const isOwnProfile = !routeUserId || String(routeUserId) === String(me?._id || "");
  const readOnlyProfile = Boolean(routeUserId) && !isOwnProfile;

  const connectionsCount = useMemo(() => {
    if (!isOwnProfile) return 0;
    if (typeof user?.friendsCount === "number") return user.friendsCount;

    const followers = Array.isArray(user?.followers) ? user.followers.map((id) => String(id)) : [];
    const following = Array.isArray(user?.following) ? user.following.map((id) => String(id)) : [];
    if (!followers.length || !following.length) return 0;
    const followerSet = new Set(followers);
    let count = 0;
    for (const id of following) {
      if (followerSet.has(id)) count += 1;
    }
    return count;
  }, [isOwnProfile, user?.friendsCount, user?.followers, user?.following]);

  const mutualConnectionsCount = useMemo(() => {
    if (!readOnlyProfile) return 0;
    const myFollowing = Array.isArray(me?.following) ? me.following.map((id) => String(id)) : [];
    const theirFollowing = Array.isArray(user?.following) ? user.following.map((id) => String(id)) : [];
    if (!myFollowing.length || !theirFollowing.length) return 0;
    const mySet = new Set(myFollowing);
    let count = 0;
    for (const id of theirFollowing) {
      if (mySet.has(String(id))) count += 1;
    }
    return count;
  }, [me?.following, readOnlyProfile, user?.following]);

  const photoStatus =
    status === "Profile photo updated." || status === "Profile photo removed.";

  const showSetupReminder = Boolean(user) && isOwnProfile && user.isProfileComplete !== true;

  const hasProfilePicture = Boolean(user?.profileImage);
  const avatarDisplaySrc =
    profileImageSrc(user?.profileImage) ||
    `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(user?.name || "User")}`;

  async function loadProfile() {
    setStatus("");
    setLoading(true);
    try {
      // Always fetch the logged-in user first (for permissions + ownership checks).
      const meRes = await getProfile();
      const meUser = meRes.data.user;
      setMe(meUser);

      const viewingOther = Boolean(routeUserId) && String(routeUserId) !== String(meUser?._id || "");
      const profileRes = viewingOther ? await getProfileById(routeUserId) : meRes;
      const u = profileRes.data.user;

      setUser(u);
      if (viewingOther) {
        const targetId = String(routeUserId);
        const following = Array.isArray(meUser?.following) ? meUser.following : [];
        const followers = Array.isArray(meUser?.followers) ? meUser.followers : [];
        const nextIsFollowing = following.some((id) => String(id) === targetId);
        const nextIsFollower = followers.some((id) => String(id) === targetId);
        setIsFollowing(nextIsFollowing);
        setIsFollower(nextIsFollower);
        setIsFriend(Boolean(nextIsFollowing && nextIsFollower));
      } else {
        setIsFollowing(false);
        setIsFollower(false);
        setIsFriend(false);
      }
      setEditing(false);
      setForm({
        name: u?.name || "",
        bio: u?.bio || "",
        faculty: u?.faculty || "",
        program: u?.program || "",
        skills: toCommaList(u?.skills),
        interests: toCommaList(u?.interests),
      });

      // Skip loading posts when the profile is gated by a block — the
      // backend already returns [] for /api/posts/user/:id in that case,
      // but avoiding the request keeps the network panel quiet and
      // prevents flashing an empty "Posts" section.
      if (u?._id && !u?.isBlocked) {
        await loadProfilePosts(u._id);
      } else {
        setProfilePosts([]);
        setPostsError("");
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to load profile";
      setStatus(msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadProfilePosts(userId) {
    if (!userId) return;
    setPostsLoading(true);
    setPostsError("");
    try {
      const res = await getPostsByUser(userId);
      setProfilePosts(res.data.posts || []);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to load posts";
      setPostsError(msg);
    } finally {
      setPostsLoading(false);
    }
  }

  function openCreatePostModal() {
    setShowCreatePostModal(true);
  }

  function closeCreatePostModal() {
    setShowCreatePostModal(false);
  }

  async function handleProfilePostCreated(newPost) {
    closeCreatePostModal();
    if (newPost?._id) {
      setProfilePosts((prev) => [newPost, ...prev]);
      return;
    }
    await loadProfilePosts(user?._id);
  }

  function handleOpenPostDetails(post) {
    setSelectedPost(post);
    setShowPostDetailsModal(true);
  }

  function handleClosePostDetails() {
    setSelectedPost(null);
    setShowPostDetailsModal(false);
  }

  function handlePostUpdated(updatedPost) {
    if (!updatedPost?._id) return;
    setProfilePosts((prev) => prev.map((p) => (p._id === updatedPost._id ? updatedPost : p)));
    setSelectedPost((prev) =>
      prev && String(prev._id) === String(updatedPost._id) ? updatedPost : prev
    );
  }

  function requestDeleteProfilePost(post) {
    if (!post?._id) return;
    setPostPendingDelete(post);
  }

  function cancelDeleteProfilePost() {
    setPostPendingDelete(null);
  }

  async function confirmDeleteProfilePost() {
    const post = postPendingDelete;
    if (!post?._id) return;
    setPostsError("");
    try {
      await deletePost(post._id);
      setProfilePosts((prev) => prev.filter((p) => p._id !== post._id));
      if (selectedPost && String(selectedPost._id) === String(post._id)) {
        handleClosePostDetails();
      }
      setPostPendingDelete(null);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to delete post";
      setPostsError(msg);
    }
  }

  async function handleToggleFollow() {
    if (!routeUserId) return;
    if (!readOnlyProfile) return;
    if (followBusy) return;

    if (isFriend) {
      const ok = window.confirm("Disconnect by unfollowing?");
      if (!ok) return;
    }

    setStatus("");
    setFollowBusy(true);
    try {
      const res = await toggleFollow(routeUserId);
      const {
        isFollowing: nextIsFollowing,
        isFollower: nextIsFollower,
        isFriend: nextIsFriend,
        followersCount,
        followingCount,
      } = res.data || {};

      setIsFollowing(Boolean(nextIsFollowing));
      setIsFollower(Boolean(nextIsFollower));
      setIsFriend(Boolean(nextIsFriend));
      setUser((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          followersCount:
            typeof followersCount === "number"
              ? followersCount
              : prev.followersCount ?? (Array.isArray(prev.followers) ? prev.followers.length : 0),
        };
      });

      setMe((prev) => {
        if (!prev) return prev;
        const targetId = String(routeUserId);
        const prevFollowing = Array.isArray(prev.following) ? prev.following : [];
        const nextFollowing = Boolean(nextIsFollowing)
          ? [...prevFollowing.filter((id) => String(id) !== targetId), targetId]
          : prevFollowing.filter((id) => String(id) !== targetId);

        return {
          ...prev,
          following: nextFollowing,
          followingCount:
            typeof followingCount === "number"
              ? followingCount
              : prev.followingCount ?? nextFollowing.length,
        };
      });

      window.dispatchEvent(new Event("notifications:refresh"));
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to toggle follow";
      setStatus(msg);
    } finally {
      setFollowBusy(false);
    }
  }

  // Resolve the global block flags from the loaded profile. When the
  // current viewer hits their own profile these are always false because
  // the backend never marks `me` as blocked even if a stale list says so.
  // We only branch on `isBlockedByMe` in the UI — when only `hasBlockedMe`
  // is true we render the generic "This profile is unavailable" message
  // so there's no need to thread that flag through separately.
  const isBlockedByMe = Boolean(readOnlyProfile && user?.isBlockedByMe);
  const isBlockedView = Boolean(readOnlyProfile && user?.isBlocked);

  function openBlockConfirm() {
    if (!readOnlyProfile || isBlockedView || blockBusy) return;
    setShowBlockConfirm(true);
  }

  function closeBlockConfirm() {
    setShowBlockConfirm(false);
  }

  async function handleConfirmBlock() {
    if (!routeUserId || blockBusy) return;
    setShowBlockConfirm(false);
    setStatus("");
    setBlockBusy(true);
    try {
      await blockUser(routeUserId);
      // Refetch the profile so the restricted card and post list both
      // come from the server's authoritative response (and so the local
      // me.following/followers reflect the unfollow side-effect).
      await loadProfile();
      // Tell the rest of the app to recompute notification badges /
      // conversation banners — the block wipes those server-side and
      // these consumers update instantly when nudged.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("notifications:refresh"));
        window.dispatchEvent(new Event("messages:unread-refresh"));
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to block user";
      setStatus(msg);
    } finally {
      setBlockBusy(false);
    }
  }

  async function handleUnblock() {
    if (!routeUserId || blockBusy) return;
    setStatus("");
    setBlockBusy(true);
    try {
      await unblockUser(routeUserId);
      await loadProfile();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("notifications:refresh"));
        window.dispatchEvent(new Event("messages:unread-refresh"));
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to unblock user";
      setStatus(msg);
    } finally {
      setBlockBusy(false);
    }
  }

  const followButtonLabel = useMemo(() => {
    if (!readOnlyProfile) return "";
    if (isFriend) return "Connected";
    if (isFollower && !isFollowing) return "Connect Back";
    if (isFollowing) return "Following";
    return "Connect";
  }, [isFriend, isFollower, isFollowing, readOnlyProfile]);

  function closeFollowList() {
    setFollowListOpen(false);
    setFollowListTitle("");
    setFollowListHelper("");
    setFollowListUsers([]);
    setFollowListLoading(false);
  }

  async function openFollowList(kind) {
    if (!user?._id) return;
    setStatus("");
    setFollowListOpen(true);
    setFollowListLoading(true);

    if (kind === "followers") {
      setFollowListTitle("Followers");
      setFollowListHelper("");
    } else if (kind === "following") {
      setFollowListTitle("Following");
      setFollowListHelper("");
    } else if (kind === "connections") {
      setFollowListTitle("Connections");
      setFollowListHelper("People you follow who also follow you.");
    } else {
      setFollowListTitle("Mutual Connections");
      setFollowListHelper("People both of you follow.");
    }

    try {
      if (kind === "followers") {
        const res = await getFollowers(user._id);
        setFollowListUsers(res.data?.users || []);
        return;
      }

      if (kind === "following") {
        const res = await getFollowing(user._id);
        setFollowListUsers(res.data?.users || []);
        return;
      }

      const res = await getConnections(user._id);
      setFollowListUsers(res.data?.users || []);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to load list";
      setStatus(msg);
      setFollowListUsers([]);
    } finally {
      setFollowListLoading(false);
    }
  }

  async function handleToggleFollowInList(userId, label) {
    if (!userId) return;
    if (!me?._id) return;
    if (String(userId) === String(me._id)) return;

    if (label === "Connected") {
      const ok = window.confirm("Disconnect by unfollowing?");
      if (!ok) return;
    }

    setFollowListBusyIds((prev) => {
      const set = new Set(prev || []);
      set.add(String(userId));
      return Array.from(set);
    });

    try {
      const res = await toggleFollow(userId);
      const { isFollowing: nextIsFollowing } = res.data || {};

      setMe((prev) => {
        if (!prev) return prev;
        const prevFollowing = Array.isArray(prev.following) ? prev.following : [];
        const nextFollowing = Boolean(nextIsFollowing)
          ? [...prevFollowing.filter((id) => String(id) !== String(userId)), String(userId)]
          : prevFollowing.filter((id) => String(id) !== String(userId));
        return { ...prev, following: nextFollowing };
      });

      // If the list action was for the currently viewed profile, keep the main button in sync.
      if (readOnlyProfile && String(routeUserId || "") === String(userId)) {
        setIsFollowing(Boolean(nextIsFollowing));
      }

      window.dispatchEvent(new Event("notifications:refresh"));
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to toggle follow";
      setStatus(msg);
    } finally {
      setFollowListBusyIds((prev) => (prev || []).filter((id) => String(id) !== String(userId)));
    }
  }

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeUserId]);

  // Disable browser scroll restoration the first time this page mounts.
  // Without this, Chrome/Firefox can restore a stale scroll position from
  // a previous Profile visit AFTER our reset effect runs, pushing the
  // user back into the posts area before they ever see the card. We do
  // this in a layout effect so it runs before the first paint of the
  // very first profile view, and we leave it in "manual" mode for the
  // rest of the session — every other page that needs scroll restoration
  // would have to opt in explicitly.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (window.history && "scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  // Reset scroll to top synchronously before the new profile paints,
  // every time the viewed user or path changes (and on initial mount).
  //
  // We use `useLayoutEffect` (not `useEffect`) on purpose: useEffect
  // fires AFTER the browser paints, so even an instant `scrollTo(0)`
  // would briefly flash the new profile at the previous page's scroll
  // position — which on a tall feed lands directly in the posts area
  // and looks indistinguishable from "navigation took me to posts".
  // useLayoutEffect runs synchronously between commit and paint, so the
  // user only ever sees the new profile from the top.
  //
  // We also use raw `scrollTop = 0` on documentElement / body in
  // addition to `window.scrollTo({ top: 0 })` because the latter
  // honors any stray `scroll-behavior: smooth` declaration and we
  // really do want this to be instant.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo(0, 0);
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  }, [routeUserId, location.pathname]);

  // Belt-and-suspenders: re-apply the scroll-to-top once the new profile
  // has finished loading. The card grows the page from "Loading…"
  // height to its full height in one go, and on slow connections the
  // initial layout-effect runs while the page is still short. After the
  // user data lands the page suddenly becomes tall — without this
  // re-scroll the browser may restore a non-zero scroll position from
  // the previous route at that moment.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (loading) return;
    window.scrollTo(0, 0);
  }, [loading, routeUserId]);

  // Honor the `focusProfileCard` route state pushed by every avatar /
  // name / username click site (FeedPostCard, ClickableAvatar,
  // NotificationsDropdown, UserSearch, etc.).
  //
  // Two responsibilities:
  //   1. Force-scroll to the top of the document. This is redundant with
  //      the layout-effect on route change (which already handles the
  //      common case), but it ALSO covers same-pathname clicks — e.g.
  //      clicking your own avatar on the feed while already at /profile
  //      — where the route-change effect wouldn't fire because nothing
  //      in its deps actually changed.
  //   2. Clear the route state so a back/forward later doesn't re-fire
  //      the scroll.
  //
  // We don't use `scrollIntoView({block:"start"})` on the card here
  // because the AppHeader is `position: sticky; top: 0`. Putting the
  // card's top edge at viewport[0] would slide the card title under
  // the sticky header — landing the user at "scroll = 70px" and hiding
  // the very thing we wanted to bring into view. `scrollTo(0, 0)`
  // keeps the AppHeader in its natural stuck-to-top position with the
  // card immediately below it, which is what we actually want.
  useEffect(() => {
    if (!location.state?.focusProfileCard) return;
    if (handledFocusProfileCardKey.current === location.key) return;
    handledFocusProfileCardKey.current = location.key;

    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }

    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, location.pathname, location.key]);

  useEffect(() => {
    const wantsEdit = Boolean(location?.state?.openEditProfile);
    if (!wantsEdit) return;
    if (handledEditRouteKey.current === location.key) return;
    if (loading) return;
    if (!user || !me) return;

    // Only open edit mode when the currently displayed profile is the logged-in user.
    // This prevents briefly opening edit mode on /profile when we just navigated from /profile/:userId
    // but the page still shows the other user's data until loadProfile finishes.
    const viewingMe = String(user?._id || "") === String(me?._id || "");
    if (!isOwnProfile || !viewingMe) return;

    handledEditRouteKey.current = location.key;

    if (!editing) startEdit();

    // Clear the route state so it doesn't keep forcing edit mode open.
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.state, loading, user, me, readOnlyProfile, isOwnProfile, editing]);

  useEffect(() => {
    const wantsDelete = Boolean(location?.state?.openDeleteAccount);
    if (!wantsDelete) return;
    if (handledDeleteRouteKey.current === location.key) return;
    if (loading) return;
    if (!user || !me) return;

    const viewingMe = String(user?._id || "") === String(me?._id || "");
    if (!isOwnProfile || !viewingMe) return;

    handledDeleteRouteKey.current = location.key;

    openDeleteAccountModal();
    // Clear the route state so it doesn't keep re-opening the dialog.
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.state, loading, user, me, readOnlyProfile, isOwnProfile]);

  function openDeleteAccountModal() {
    setStatus("");
    setShowDeleteAccountModal(true);
  }

  function closeDeleteAccountModal() {
    setShowDeleteAccountModal(false);
  }

  async function confirmDeleteAccount() {
    setStatus("");
    try {
      await deleteMyAccount();
      localStorage.removeItem("token");
      setAuthToken(null);
      navigate("/login", { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to delete account";
      setStatus(msg);
    }
  }

  async function uploadPendingProfileImage(file) {
    if (readOnlyProfile) return false;
    if (!file || !user) return false;
    setProfilePhotoBusy(true);
    setStatus("");
    try {
      const fd = new FormData();
      fd.append("profileImage", file);
      const res = await updateProfile(fd);
      setUser(res.data.user);
      setStatus("Profile photo updated.");
      return true;
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to upload photo";
      setStatus(msg);
      return false;
    } finally {
      setProfilePhotoBusy(false);
    }
  }

  async function removeProfilePicture() {
    if (readOnlyProfile) return;
    if (!window.confirm("Remove your profile picture? You can add a new one anytime.")) return;
    if (!user) return;
    setProfilePhotoBusy(true);
    setStatus("");
    try {
      const res = await updateProfile({ removeProfileImage: true });
      setUser(res.data.user);
      setStatus("Profile photo removed.");
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to remove photo";
      setStatus(msg);
    } finally {
      setProfilePhotoBusy(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    if (readOnlyProfile) return;
    if (!canSave) return;
    setStatus("");
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        bio: form.bio,
        faculty: form.faculty,
        program: form.program,
        skills: fromCommaList(form.skills),
        interests: fromCommaList(form.interests),
      };
      const res = await updateProfile(payload);
      setUser(res.data.user);
      setStatus("Saved.");
      setEditing(false);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to save profile";
      setStatus(msg);
    } finally {
      setSaving(false);
    }
  }

  function startEdit() {
    if (!user) return;
    if (readOnlyProfile) return;
    setStatus("");
    setForm({
      name: user?.name || "",
      bio: user?.bio || "",
      faculty: user?.faculty || "",
      program: user?.program || "",
      skills: toCommaList(user?.skills),
      interests: toCommaList(user?.interests),
    });
    setEditing(true);
  }

  function cancelEdit() {
    if (!user) return;
    if (readOnlyProfile) return;
    setStatus("");
    setForm({
      name: user?.name || "",
      bio: user?.bio || "",
      faculty: user?.faculty || "",
      program: user?.program || "",
      skills: toCommaList(user?.skills),
      interests: toCommaList(user?.interests),
    });
    setEditing(false);
  }

  function submitProfile(e) {
    e.preventDefault();
    if (!editing) return;
    save(e);
  }

  const isNarrowMobile = useMediaQuery("(max-width: 640px)");

  const showProfileAside = readOnlyProfile || (isOwnProfile && (editing || !isNarrowMobile));

  function renderProfileStatButtons() {
    return (
      <>
        {isOwnProfile ? (
          <button
            type="button"
            className="secondary-button btn-compact profileStatButton"
            onClick={() => openFollowList("connections")}
          >
            <strong style={{ color: "var(--text-h)", fontVariantNumeric: "tabular-nums" }}>
              {connectionsCount}
            </strong>{" "}
            Connections
          </button>
        ) : (
          <button
            type="button"
            className="secondary-button btn-compact profileStatButton"
            onClick={() => openFollowList("mutualConnections")}
          >
            <strong style={{ color: "var(--text-h)", fontVariantNumeric: "tabular-nums" }}>
              {mutualConnectionsCount}
            </strong>{" "}
            Mutual connections
          </button>
        )}

        <button
          type="button"
          className="secondary-button btn-compact profileStatButton"
          onClick={() => openFollowList("followers")}
        >
          <strong style={{ color: "var(--text-h)", fontVariantNumeric: "tabular-nums" }}>
            {typeof user?.followersCount === "number"
              ? user.followersCount
              : Array.isArray(user?.followers)
                ? user.followers.length
                : 0}
          </strong>{" "}
          Followers
        </button>

        <button
          type="button"
          className="secondary-button btn-compact profileStatButton"
          onClick={() => openFollowList("following")}
        >
          <strong style={{ color: "var(--text-h)", fontVariantNumeric: "tabular-nums" }}>
            {typeof user?.followingCount === "number"
              ? user.followingCount
              : Array.isArray(user?.following)
                ? user.following.length
                : 0}
          </strong>{" "}
          Following
        </button>
      </>
    );
  }

  const profileFormSharedProps = {
    user,
    form,
    setForm,
    editing,
    saving,
    canSave,
    status,
    photoStatus,
    onStartEdit: startEdit,
    onCancelEdit: cancelEdit,
    onSave: save,
    onSubmitProfile: submitProfile,
    readOnly: readOnlyProfile,
  };

  return (
    <div className="page">
      <AppHeader
        activePage={readOnlyProfile ? "feed" : "profile"}
        currentUser={me}
        search={me ? <UserSearch /> : null}
        notifications={me ? <NotificationsDropdown /> : null}
        showProfileActions={!readOnlyProfile && isOwnProfile}
        onEditProfile={startEdit}
        onDeleteAccount={openDeleteAccountModal}
      />

      {loading ? <div className="muted">Loading...</div> : null}

      {showSetupReminder ? (
        <section className="card">
          <div className="topbar" style={{ padding: 0, alignItems: "flex-start" }}>
            <div>
              <h2 style={{ marginBottom: 6 }}>Complete your profile</h2>
              <div className="muted">
                Your profile is incomplete. Complete your profile to help students and staff know more about you.
              </div>
            </div>
            <div className="actionsRow">
              <button
                className="primary-button btn-compact"
                type="button"
                onClick={() => navigate("/profile-setup")}
              >
                Complete profile
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {user ? (
        <>

          {isBlockedView ? (
            // Restricted profile card. Used in two related situations:
            //   1. The current user blocked the target → shows "You blocked
            //      this user." plus an Unblock button.
            //   2. The target blocked the current user → shows "This profile
            //      is unavailable." with no Unblock affordance (we don't
            //      tell the blocked side that the other user blocked them
            //      to keep things low-conflict, just that the profile is
            //      unavailable).
            // Either way every detail beyond identity (bio, faculty,
            // skills, follower counts, posts, connect / message) is
            // intentionally hidden — the backend already strips them, the
            // frontend just renders nothing.
            <section ref={profileCardRef} className="card profile-hero profileBlockedCard">
              <div className="profileBlockedCard__header">
                <img
                  src={avatarDisplaySrc}
                  alt=""
                  aria-hidden="true"
                  className="profileBlockedCard__avatar"
                />
                <div className="profileBlockedCard__identity">
                  <div className="profileBlockedCard__name">
                    {user?.name || "Blocked user"}
                  </div>
                  {user?.username ? (
                    <div className="muted">@{user.username}</div>
                  ) : null}
                </div>
              </div>

              <div className="profileBlockedCard__body">
                {isBlockedByMe ? (
                  <>
                    <h3 className="profileBlockedCard__title">
                      You blocked this user.
                    </h3>
                    <p className="muted profileBlockedCard__hint">
                      Unblock this user to view their profile and posts again.
                    </p>
                    <div className="actionsRow profileBlockedCard__actions">
                      <button
                        type="button"
                        className="primary-button btn-compact btnWithIcon"
                        onClick={handleUnblock}
                        disabled={blockBusy}
                        aria-busy={blockBusy ? "true" : "false"}
                      >
                        <Unlock size={ICON_SIZE.sm} aria-hidden />
                        {blockBusy ? "Unblocking…" : "Unblock"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="profileBlockedCard__title">
                      This profile is unavailable.
                    </h3>
                    <p className="muted profileBlockedCard__hint">
                      You can't view this user's profile or posts right now.
                    </p>
                  </>
                )}
              </div>
            </section>
          ) : (
            <section ref={profileCardRef} className="card profile-hero">
              <div
                className={
                  showProfileAside
                    ? "profileCardHeader profileCardHeader--withAside"
                    : "profileCardHeader profileCardHeader--twoColOnly"
                }
              >
                <div className="profileCardAvatarSlot">
                  <ProfileAvatar
                    avatarDisplaySrc={avatarDisplaySrc}
                    viewImageSrc={hasProfilePicture ? profileImageSrc(user.profileImage) : null}
                    hasProfilePicture={hasProfilePicture}
                    loading={loading}
                    profilePhotoBusy={profilePhotoBusy}
                    onUploadPending={uploadPendingProfileImage}
                    onRemoveProfilePicture={removeProfilePicture}
                    readOnly={readOnlyProfile}
                  />
                </div>

                <div className="profileCardMainInfo">
                  <div className="profileCardTopRow">
                    <div className="profileIdentityBlock">
                      <ProfileIdentityBlock
                        user={user}
                        form={form}
                        setForm={setForm}
                        editing={editing}
                        readOnly={readOnlyProfile}
                      />
                    </div>

                    <div className="profileStatsInline">{renderProfileStatButtons()}</div>
                  </div>
                </div>

                {showProfileAside ? (
                  <div className="profileCardHeaderAside">
                    {readOnlyProfile ? (
                      <div className="actionsRow profileMobileActionsRow">
                        <button
                          className={isFollowing ? "secondary-button btn-compact" : "primary-button btn-compact"}
                          type="button"
                          onClick={handleToggleFollow}
                          disabled={followBusy}
                          aria-busy={followBusy ? "true" : "false"}
                        >
                          {followBusy ? "..." : followButtonLabel}
                        </button>
                        <button
                          className="outline-button btn-compact btnWithIcon profileMessageBtn"
                          type="button"
                          onClick={async () => {
                            if (!routeUserId) return;
                            try {
                              // Lookup-only: ask the server whether a chat
                              // already exists with this user. The endpoint
                              // never creates one — if there's no existing
                              // conversation we navigate to the "new chat"
                              // route so the user can compose a first
                              // message without spawning a request yet.
                              const res = await openConversationTarget(routeUserId);
                              const existingId = res?.data?.conversation?._id;
                              if (existingId) {
                                navigate(`/messages/${existingId}`);
                              } else {
                                navigate(`/messages/new/${routeUserId}`);
                              }
                            } catch (err) {
                              const msg =
                                err?.response?.data?.message || err?.message || "Could not open chat";
                              setStatus(msg);
                            }
                          }}
                          disabled={followBusy}
                          aria-label="Message"
                          title="Message"
                        >
                          <MessageCircle size={ICON_SIZE.sm} aria-hidden />
                          <span className="profileMessageBtn__label">Message</span>
                        </button>
                        <button
                          className="outline-button btn-compact btnWithIcon profileBlockBtn"
                          type="button"
                          onClick={openBlockConfirm}
                          disabled={blockBusy}
                          aria-label="Block user"
                          title="Block user"
                        >
                          <Ban size={ICON_SIZE.sm} aria-hidden />
                          <span className="profileBlockBtn__label">Block</span>
                        </button>
                      </div>
                    ) : isOwnProfile ? (
                      <ProfileHeaderActions
                        editing={editing}
                        readOnly={readOnlyProfile}
                        canSave={canSave}
                        saving={saving}
                        onStartEdit={startEdit}
                        onCancelEdit={cancelEdit}
                        onSave={save}
                        editButtonClassName="profileEditTopButton"
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>

              <ProfileForm {...profileFormSharedProps} showHeader={false} />

              {/* Delete account is available via Settings menu. */}
            </section>
          )}

          {isBlockedView ? null : (
          <section className="card">
            <div className="topbar" style={{ padding: 0 }}>
              <h2 style={{ marginBottom: 0 }}>Posts</h2>
              {!readOnlyProfile ? (
                <div className="actionsRow">
                  <button className="primary-button btn-compact" type="button" onClick={openCreatePostModal}>
                    Create new
                  </button>
                </div>
              ) : null}
            </div>

            <div className="muted" style={{ fontSize: "0.92rem" }}>
              Photos and videos shared on your profile
            </div>

            {postsLoading ? <div className="muted" style={{ marginTop: 12 }}>Loading posts...</div> : null}
            {postsError ? <div className="alert alertError" style={{ marginTop: 12 }}>{postsError}</div> : null}

            {!postsLoading && !postsError && profilePosts.length === 0 ? (
              <div className="emptyState emptyState--subtle" style={{ marginTop: 12 }}>
                No posts yet.
              </div>
            ) : null}

            <div className="postsGrid" style={{ marginTop: 12 }}>
              {profilePosts.map((post) => (
                <ProfilePostCard
                  key={post._id}
                  post={post}
                  currentUserId={me?._id}
                  onClick={handleOpenPostDetails}
                  onDelete={requestDeleteProfilePost}
                />
              ))}
            </div>
          </section>
          )}
        </>
      ) : null}

      {!editing && status && photoStatus ? <div className="alert">{status}</div> : null}

      {!editing && status && !photoStatus && status !== "Saved." ? (
        <div className="alert alertError">{status}</div>
      ) : null}

      {showCreatePostModal ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modalCard">
            <div className="topbar" style={{ marginBottom: 10 }}>
              <h2 style={{ marginBottom: 0 }}>Create post</h2>
              <button className="secondary-button btn-compact" type="button" onClick={closeCreatePostModal}>
                Close
              </button>
            </div>
            <CreatePostForm
              onPostCreated={handleProfilePostCreated}
              placeholder="Post something to your profile..."
            />
          </div>
        </div>
      ) : null}

      {selectedPost && showPostDetailsModal ? (
        <PostDetailsModal
          post={selectedPost}
          currentUser={me}
          onClose={handleClosePostDetails}
          onPostUpdated={handlePostUpdated}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(postPendingDelete)}
        title="Delete post"
        message="Are you sure you want to delete this post?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={cancelDeleteProfilePost}
        onConfirm={confirmDeleteProfilePost}
      />

      <ConfirmDialog
        open={showDeleteAccountModal}
        title="Delete account"
        message="Are you sure you want to delete your account? This action cannot be undone."
        confirmLabel="Delete Account"
        cancelLabel="Cancel"
        onCancel={closeDeleteAccountModal}
        onConfirm={confirmDeleteAccount}
      />

      <ConfirmDialog
        open={showBlockConfirm}
        title="Block this user?"
        message={
          user?.name
            ? `${user.name} will no longer be able to see your profile or posts, and you won't see theirs. Any active follow between you will be removed.`
            : "This user will no longer be able to see your profile or posts, and you won't see theirs. Any active follow between you will be removed."
        }
        confirmLabel="Block"
        cancelLabel="Cancel"
        onCancel={closeBlockConfirm}
        onConfirm={handleConfirmBlock}
      />

      <FollowListModal
        open={followListOpen}
        title={followListTitle}
        helperText={followListHelper}
        users={followListUsers}
        loading={followListLoading}
        onClose={closeFollowList}
        me={me}
        onToggleFollow={handleToggleFollowInList}
        busyUserIds={followListBusyIds}
      />
    </div>
  );
}
