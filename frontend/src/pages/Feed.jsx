import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  FaPlus,
  FaLayerGroup,
  FaQuestionCircle,
  FaFlask,
  FaBullhorn,
  FaBook,
  FaCalendarAlt,
  FaRegFileAlt,
  FaChevronRight,
} from "react-icons/fa";

import { getProfile } from "../api/profile";
import { deletePost, getPosts, toggleLike, updatePost } from "../api/posts";
import AppHeader from "../components/AppHeader.jsx";
import ConfirmDialog from "../components/ConfirmDialog";
import CreatePostForm from "../components/CreatePostForm";
import FeedPostCard from "../components/FeedPostCard";
import NotificationsDropdown from "../components/NotificationsDropdown.jsx";
import PostDetailsModal from "../components/PostDetailsModal";
import TsiOfficialFeed from "../components/TsiOfficialFeed.jsx";
import UserSearch from "../components/UserSearch";

const CATEGORY_ICON_BY_VALUE = {
  all: FaLayerGroup,
  question: FaQuestionCircle,
  research: FaFlask,
  announcement: FaBullhorn,
  study: FaBook,
  event: FaCalendarAlt,
  general: FaRegFileAlt,
};

export default function Feed() {
  const location = useLocation();
  const [me, setMe] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPost, setSelectedPost] = useState(null);
  const [showPostDetailsModal, setShowPostDetailsModal] = useState(false);

  const [showCreatePostModal, setShowCreatePostModal] = useState(false);

  const [editingPost, setEditingPost] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [postPendingDelete, setPostPendingDelete] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("all");

  /** True when the device supports hover (desktop-style); touch-first devices use tap-to-expand instead. */
  const [prefersHover, setPrefersHover] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(hover: hover)").matches : false
  );
  const [categorySidebarHoverOpen, setCategorySidebarHoverOpen] = useState(false);
  const [categorySidebarPinnedOpen, setCategorySidebarPinnedOpen] = useState(false);

  const categorySidebarExpanded = categorySidebarHoverOpen || categorySidebarPinnedOpen;

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover)");
    function sync() {
      setPrefersHover(mq.matches);
    }
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  function collapseCategorySidebar() {
    setCategorySidebarHoverOpen(false);
    setCategorySidebarPinnedOpen(false);
  }

  function handleCategorySelect(value) {
    setSelectedCategory(value);
    collapseCategorySidebar();
  }

  function toggleCategorySidebarPinned() {
    setCategorySidebarPinnedOpen((prev) => !prev);
  }

  const CATEGORY_OPTIONS = [
    { label: "All", value: "all" },
    { label: "Questions", value: "question" },
    { label: "Research", value: "research" },
    { label: "Announcements", value: "announcement" },
    { label: "Study Material", value: "study" },
    { label: "Events", value: "event" },
    { label: "General", value: "general" },
  ];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [meRes, postsRes] = await Promise.all([getProfile(), getPosts()]);
        if (cancelled) return;
        setMe(meRes.data.user);
        setPosts(postsRes.data.posts || []);
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.message || err?.message || "Failed to load feed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // If we navigated here from a notification, open that post immediately.
  useEffect(() => {
    const openPostId = location.state?.openPostId;
    if (!openPostId) return;
    if (loading) return;

    const match = (posts || []).find((p) => String(p?._id) === String(openPostId));
    if (match) {
      handleOpenPostDetails(match);
      // Clear the navigation state so it won't re-open on re-render,
      // but allow future clicks on the same notification to work again.
      window.history.replaceState({}, document.title, location.pathname);
    }
  }, [location.state, loading, posts, location.pathname]);

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
    setPosts((prev) => prev.map((p) => (p._id === updatedPost._id ? updatedPost : p)));
    setSelectedPost((prev) =>
      prev && String(prev._id) === String(updatedPost._id) ? updatedPost : prev
    );
  }

  async function handleLike(post) {
    if (!post?._id) return;
    setError("");
    try {
      const res = await toggleLike(post._id);
      handlePostUpdated(res.data.post);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Could not update like");
    }
  }

  function handleEdit(post) {
    if (!post) return;
    setEditingPost(post);
    setEditContent(post.content || "");
  }

  function closeEditModal() {
    setEditingPost(null);
    setEditContent("");
    setEditSaving(false);
  }

  async function saveEdit() {
    if (!editingPost?._id) return;
    const trimmed = editContent.trim();
    const postHasImage = Boolean(editingPost.image && String(editingPost.image).trim());
    if (!trimmed && !postHasImage) return;

    setEditSaving(true);
    setError("");
    try {
      const res = await updatePost(editingPost._id, { content: trimmed });
      handlePostUpdated(res.data.post);
      closeEditModal();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Could not save post");
    } finally {
      setEditSaving(false);
    }
  }

  function requestDeletePost(post) {
    if (!post?._id) return;
    setPostPendingDelete(post);
  }

  function cancelDeletePost() {
    setPostPendingDelete(null);
  }

  async function confirmDeletePost() {
    const post = postPendingDelete;
    if (!post?._id) return;
    setError("");
    try {
      await deletePost(post._id);
      setPosts((prev) => prev.filter((p) => p._id !== post._id));
      if (selectedPost && String(selectedPost._id) === String(post._id)) {
        handleClosePostDetails();
      }
      setPostPendingDelete(null);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Could not delete post");
    }
  }

  function openCreatePostModal() {
    setShowCreatePostModal(true);
  }

  function closeCreatePostModal() {
    setShowCreatePostModal(false);
  }

  function handleFeedPostCreated(newPost) {
    closeCreatePostModal();
    if (newPost?._id) {
      setPosts((prev) => [newPost, ...prev]);
    }
  }

  const editHasImage = Boolean(editingPost?.image && String(editingPost.image).trim());
  const canSaveEdit = Boolean(editContent.trim() || editHasImage);

  const filteredPosts =
    selectedCategory === "all"
      ? posts
      : (posts || []).filter(
          (p) => String(p?.category || "general").toLowerCase() === selectedCategory
        );

  return (
    <div className="page">
      <AppHeader
        activePage="feed"
        currentUser={me}
        search={me ? <UserSearch /> : null}
        notifications={me ? <NotificationsDropdown /> : null}
      />

      <div className="feedViewportShell">
        <div className="feedLayout">
        <div className="feedMainColumn">
          <div className="feedMainColumn__header">
            <button
              className="primary-button btn-compact btnWithIcon"
              type="button"
              onClick={openCreatePostModal}
            >
              <FaPlus aria-hidden="true" />
              Create new
            </button>
          </div>

          <div className="feedContentWithCategorySidebar">
            {!prefersHover && categorySidebarPinnedOpen ? (
              <button
                type="button"
                className="categorySidebarBackdrop"
                aria-label="Close categories"
                onClick={collapseCategorySidebar}
              />
            ) : null}

            <aside
              className={
                categorySidebarExpanded
                  ? "categorySidebar categorySidebar--expanded"
                  : "categorySidebar"
              }
              aria-label="Post categories"
              aria-expanded={categorySidebarExpanded}
              onMouseEnter={() => {
                if (prefersHover) setCategorySidebarHoverOpen(true);
              }}
              onMouseLeave={() => {
                if (prefersHover) setCategorySidebarHoverOpen(false);
              }}
            >
              {CATEGORY_OPTIONS.map((opt) => {
                const active = selectedCategory === opt.value;
                const Icon = CATEGORY_ICON_BY_VALUE[opt.value];
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={active ? "categoryFilterButton categoryFilterButton--active" : "categoryFilterButton"}
                    onClick={() => handleCategorySelect(opt.value)}
                    title={opt.label}
                    aria-label={opt.label}
                    aria-pressed={active}
                  >
                    <span className="categoryFilterIcon">
                      <Icon aria-hidden="true" />
                    </span>
                    <span className="categoryFilterText">{opt.label}</span>
                  </button>
                );
              })}

              {!prefersHover ? (
                <button
                  type="button"
                  className="categorySidebarExpandToggle"
                  onClick={toggleCategorySidebarPinned}
                  aria-expanded={categorySidebarPinnedOpen}
                  title={categorySidebarPinnedOpen ? "Collapse categories" : "Expand categories"}
                  aria-label={categorySidebarPinnedOpen ? "Collapse categories" : "Expand categories"}
                >
                  <FaChevronRight
                    aria-hidden="true"
                    className={
                      categorySidebarPinnedOpen
                        ? "categorySidebarExpandToggle__icon categorySidebarExpandToggle__icon--open"
                        : "categorySidebarExpandToggle__icon"
                    }
                  />
                </button>
              ) : null}
            </aside>

            <div className="platformPostsArea">
              {loading ? <div className="muted">Loading posts...</div> : null}
              {error ? <div className="alert alertError">{error}</div> : null}

              {!loading && !error && posts.length === 0 ? (
                <section className="card">
                  <div className="emptyState">
                    No posts yet. Be the first to share something!
                  </div>
                </section>
              ) : null}

              {!loading && !error && posts.length > 0 && filteredPosts.length === 0 ? (
                <section className="card">
                  <div className="emptyState">No posts found for this category.</div>
                </section>
              ) : null}

              <div className="platformPostsScroll">
                <div className="feedStack">
                  {filteredPosts.map((post) => (
                    <FeedPostCard
                      key={post._id}
                      post={post}
                      currentUser={me}
                      onLike={handleLike}
                      onEdit={handleEdit}
                      onDelete={requestDeletePost}
                      onOpenDetails={handleOpenPostDetails}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="feedSidebarColumn">
          <TsiOfficialFeed />
        </aside>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(postPendingDelete)}
        title="Delete post"
        message="Are you sure you want to delete this post?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={cancelDeletePost}
        onConfirm={confirmDeletePost}
      />

      {selectedPost && showPostDetailsModal ? (
        <PostDetailsModal
          post={selectedPost}
          currentUser={me}
          onClose={handleClosePostDetails}
          onPostUpdated={handlePostUpdated}
        />
      ) : null}

      {showCreatePostModal ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modalCard" style={{ textAlign: "left" }}>
            <div className="topbar" style={{ marginBottom: 12 }}>
              <h2 style={{ marginBottom: 0 }}>Create post</h2>
              <button className="secondary-button btn-compact" type="button" onClick={closeCreatePostModal}>
                Close
              </button>
            </div>
            <CreatePostForm
              onPostCreated={handleFeedPostCreated}
              placeholder="Caption (optional if you add a photo)..."
            />
          </div>
        </div>
      ) : null}

      {editingPost ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modalCard" style={{ textAlign: "left" }}>
            <div className="topbar" style={{ marginBottom: 12 }}>
              <h2 style={{ marginBottom: 0 }}>Edit caption</h2>
              <button className="secondary-button btn-compact" type="button" onClick={closeEditModal}>
                Close
              </button>
            </div>
            <p className="muted" style={{ fontSize: 14, marginBottom: 10 }}>
              You can only change the text. The image stays the same.
            </p>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={4}
              maxLength={1000}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text-h)",
                font: "16px/1.2 system-ui",
                marginBottom: 12,
              }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="primary-button btn-compact"
                type="button"
                onClick={saveEdit}
                disabled={editSaving || !canSaveEdit}
              >
                {editSaving ? "Saving..." : "Save"}
              </button>
              <button
                className="secondary-button btn-compact"
                type="button"
                onClick={closeEditModal}
                disabled={editSaving}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
