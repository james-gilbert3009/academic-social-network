import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE_URL, setAuthToken } from "../api";
import { getProfile, getProfileById, updateProfile } from "../api/profile";
import { deletePost, getPostsByUser } from "../api/posts";
import { getFollowers, getFollowing, getMutualUsers, toggleFollow } from "../api/users";
import ConfirmDialog from "../components/ConfirmDialog";
import CreatePostForm from "../components/CreatePostForm";
import PostDetailsModal from "../components/PostDetailsModal";
import ProfilePostCard from "../components/ProfilePostCard";
import ProfileAvatar from "../components/ProfileAvatar";
import ProfileForm from "../components/ProfileForm";
import FollowListModal from "../components/FollowListModal";

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

  const [form, setForm] = useState({
    name: "",
    bio: "",
    faculty: "",
    program: "",
    skills: "",
    interests: "",
  });

  const canSave = useMemo(() => !saving, [saving]);

  const photoStatus =
    status === "Profile photo updated." || status === "Profile photo removed.";

  const isOwnProfile = !routeUserId || String(routeUserId) === String(me?._id || "");
  const readOnlyProfile = Boolean(routeUserId) && !isOwnProfile;
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

      if (u?._id) {
        await loadProfilePosts(u._id);
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
      const ok = window.confirm("Remove this friend by unfollowing?");
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
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to toggle follow";
      setStatus(msg);
    } finally {
      setFollowBusy(false);
    }
  }

  const followButtonLabel = useMemo(() => {
    if (!readOnlyProfile) return "";
    if (isFriend) return "Friends";
    if (isFollower && !isFollowing) return "Follow Back";
    if (isFollowing) return "Following";
    return "Follow";
  }, [isFriend, isFollower, isFollowing, readOnlyProfile]);

  function closeFollowList() {
    setFollowListOpen(false);
    setFollowListTitle("");
    setFollowListUsers([]);
    setFollowListLoading(false);
  }

  async function openFollowList(kind) {
    if (!user?._id) return;
    setStatus("");
    setFollowListOpen(true);
    setFollowListLoading(true);

    if (kind === "followers") setFollowListTitle("Followers");
    else if (kind === "following") setFollowListTitle("Following");
    else setFollowListTitle("Mutual connections");

    try {
      const res =
        kind === "followers"
          ? await getFollowers(user._id)
          : kind === "following"
            ? await getFollowing(user._id)
            : await getMutualUsers(user._id);
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

    if (label === "Friends") {
      const ok = window.confirm("Remove this friend by unfollowing?");
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

  function logout() {
    localStorage.removeItem("token");
    setAuthToken("");
    navigate("/login", { replace: true });
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

  return (
    <div className="page">
      <div className="topbar">
        <h1>{readOnlyProfile ? `${user?.name || "Profile"}` : "My Profile"}</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" type="button" onClick={() => navigate("/feed")}>
            Back to feed
          </button>
          {readOnlyProfile ? (
            <button className="btn" type="button" onClick={() => navigate("/profile")}>
              My profile
            </button>
          ) : null}
          <button className="btn" type="button" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

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
                className="btn btnPrimary"
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

          <section className="card">
            <div
              className="topbar"
              style={{ padding: 0, marginBottom: 12, alignItems: "center" }}
            >
              <div className="muted" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => openFollowList("followers")}
                  style={{ padding: "8px 10px" }}
                >
                  <strong style={{ color: "var(--text)" }}>
                    {typeof user.followersCount === "number"
                      ? user.followersCount
                      : Array.isArray(user.followers)
                        ? user.followers.length
                        : 0}
                  </strong>{" "}
                  followers
                </button>

                <button
                  type="button"
                  className="btn"
                  onClick={() => openFollowList("following")}
                  style={{ padding: "8px 10px" }}
                >
                  <strong style={{ color: "var(--text)" }}>
                    {typeof user.followingCount === "number"
                      ? user.followingCount
                      : Array.isArray(user.following)
                        ? user.following.length
                        : 0}
                  </strong>{" "}
                  following
                </button>

                {readOnlyProfile ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => openFollowList("mutual")}
                    style={{ padding: "8px 10px" }}
                  >
                    Mutual connections
                  </button>
                ) : null}
              </div>

              {readOnlyProfile ? (
                <div className="actionsRow">
                  <button
                    className={`btn ${isFollowing ? "" : "btnPrimary"}`}
                    type="button"
                    onClick={handleToggleFollow}
                    disabled={followBusy}
                    aria-busy={followBusy ? "true" : "false"}
                  >
                    {followBusy ? "..." : followButtonLabel}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="row">
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

              <ProfileForm
                user={user}
                form={form}
                setForm={setForm}
                editing={editing}
                saving={saving}
                canSave={canSave}
                status={status}
                photoStatus={photoStatus}
                onStartEdit={startEdit}
                onCancelEdit={cancelEdit}
                onSave={save}
                onSubmitProfile={submitProfile}
                readOnly={readOnlyProfile}
              />
            </div>
          </section>

          <section className="card">
            <div className="topbar" style={{ padding: 0 }}>
              <h2 style={{ marginBottom: 0 }}>Posts</h2>
              {!readOnlyProfile ? (
                <div className="actionsRow">
                  <button className="btn btnPrimary" type="button" onClick={openCreatePostModal}>
                    Create
                  </button>
                </div>
              ) : null}
            </div>

            <div className="muted">Photos & videos you share</div>

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
              <button className="btn" type="button" onClick={closeCreatePostModal}>
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

      <FollowListModal
        open={followListOpen}
        title={followListTitle}
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
