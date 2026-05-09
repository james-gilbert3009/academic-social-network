import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  BookOpenText,
  CalendarDays,
  ChevronRight,
  CircleQuestionMark,
  FileText,
  FlaskConical,
  ICON_SIZE,
  Layers,
  Megaphone,
  Plus,
} from "../utils/icons";

import { getProfile } from "../api/profile";
import { deletePost, getPostById, getPosts, toggleLike, updatePost } from "../api/posts";
import { toggleFollow } from "../api/users";
import AppHeader from "../components/AppHeader.jsx";
import ConfirmDialog from "../components/ConfirmDialog";
import CreatePostForm from "../components/CreatePostForm";
import FeedPostCard from "../components/FeedPostCard";
import NotificationsDropdown from "../components/NotificationsDropdown.jsx";
import PostDetailsModal from "../components/PostDetailsModal";
import TsiOfficialFeed from "../components/TsiOfficialFeed.jsx";
import UserSearch from "../components/UserSearch";

const CATEGORY_ICON_BY_VALUE = {
  all: Layers,
  question: CircleQuestionMark,
  research: FlaskConical,
  announcement: Megaphone,
  study: BookOpenText,
  event: CalendarDays,
  general: FileText,
};

export default function Feed() {
  const location = useLocation();
  const [me, setMe] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [activeFeedTab, setActiveFeedTab] = useState("network");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [followBusyByUserId, setFollowBusyByUserId] = useState({});
  const [openPostActionsId, setOpenPostActionsId] = useState(null);
  const [followPendingDisconnectAuthor, setFollowPendingDisconnectAuthor] = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);
  const [showPostDetailsModal, setShowPostDetailsModal] = useState(false);

  const [showCreatePostModal, setShowCreatePostModal] = useState(false);

  const [editingPost, setEditingPost] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [postPendingDelete, setPostPendingDelete] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const PAGE_LIMIT = 10;

  /** True when the device supports hover (desktop-style); touch-first devices use tap-to-expand instead. */
  const [prefersHover, setPrefersHover] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(hover: hover)").matches : false
  );
  /** Viewport ≤900px: category rail is a fixed overlay drawer, not in-flow beside the feed. */
  const [isMobileFeedLayout, setIsMobileFeedLayout] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 900px)").matches : false
  );
  const [categorySidebarHoverOpen, setCategorySidebarHoverOpen] = useState(false);
  const [categorySidebarPinnedOpen, setCategorySidebarPinnedOpen] = useState(false);
  const [activeMobileFeedTab, setActiveMobileFeedTab] = useState("feed");

  const categorySidebarExpanded =
    (prefersHover && !isMobileFeedLayout && categorySidebarHoverOpen) || categorySidebarPinnedOpen;

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover)");
    function sync() {
      setPrefersHover(mq.matches);
    }
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    function sync() {
      setIsMobileFeedLayout(mq.matches);
      if (!mq.matches) {
        setCategorySidebarPinnedOpen(false);
        setCategorySidebarHoverOpen(false);
        setActiveMobileFeedTab("feed");
      }
    }
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!isMobileFeedLayout || !categorySidebarPinnedOpen) return;
    function onKeyDown(e) {
      if (e.key === "Escape") collapseCategorySidebar();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMobileFeedLayout, categorySidebarPinnedOpen]);

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

  function handleMobileFeedTab(tab) {
    collapseCategorySidebar();
    setActiveMobileFeedTab(tab);
    if (tab === "feed") {
      setRefreshTick((v) => v + 1);
    }
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

  function getCategoryParam() {
    return selectedCategory && selectedCategory !== "all" ? selectedCategory : undefined;
  }

  function scrollFeedToTop() {
    // Desktop uses an internal scroll container; mobile uses window scroll.
    try {
      const el = document.querySelector(".feedViewportShell .platformPostsScroll");
      if (el) el.scrollTop = 0;
    } catch {
      // ignore
    }
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    } catch {
      window.scrollTo(0, 0);
    }
  }

  async function fetchPostsPage({ nextPage, append }) {
    const category = getCategoryParam();
    if (append) setLoadingMore(true);
    else setLoading(true);

    setError("");
    try {
      const [meRes, postsRes] = await Promise.all([
        me?._id ? Promise.resolve({ data: { user: me } }) : getProfile(),
        getPosts({
          tab: activeFeedTab,
          page: nextPage,
          limit: PAGE_LIMIT,
          ...(category ? { category } : {}),
        }),
      ]);

      const nextMe = meRes?.data?.user || null;
      const payload = postsRes?.data || {};
      const pagePosts = Array.isArray(payload.posts) ? payload.posts : [];

      setMe(nextMe);
      setHasMore(Boolean(payload.hasMore));
      setPage(typeof payload.page === "number" ? payload.page : nextPage);

      setPosts((prev) => {
        const prevArr = Array.isArray(prev) ? prev : [];
        if (!append) return pagePosts;
        const seen = new Set(prevArr.map((p) => String(p?._id)));
        const merged = [...prevArr];
        for (const p of pagePosts) {
          const id = String(p?._id || "");
          if (!id || seen.has(id)) continue;
          seen.add(id);
          merged.push(p);
        }
        return merged;
      });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load feed");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      scrollFeedToTop();
      setPosts([]);
      setPage(1);
      setHasMore(false);
      await fetchPostsPage({ nextPage: 1, append: false });
    })();
    return () => {
      cancelled = true;
      void cancelled;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFeedTab, selectedCategory, refreshTick]);

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
    } else {
      // With pagination, the target post might not be in the currently loaded pages.
      // Best-effort: fetch it and open the modal directly.
      (async () => {
        try {
          const res = await getPostById(openPostId);
          const post = res?.data?.post ?? res?.data;
          if (post?._id) {
            handleOpenPostDetails(post);
            window.history.replaceState({}, document.title, location.pathname);
          }
        } catch {
          // Ignore: feed can still render normally.
        }
      })();
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

  function updateAuthorRelationshipEverywhere(authorId, nextFlags) {
    const targetId = String(authorId || "");
    if (!targetId) return;

    setPosts((prev) =>
      (prev || []).map((p) => {
        const rawAuthor = p?.author;
        const pAuthorId =
          rawAuthor && typeof rawAuthor === "object" && rawAuthor._id ? rawAuthor._id : rawAuthor;
        if (!pAuthorId || String(pAuthorId) !== targetId) return p;

        const authorObj = rawAuthor && typeof rawAuthor === "object" ? rawAuthor : { _id: pAuthorId };
        return {
          ...p,
          author: {
            ...authorObj,
            ...nextFlags,
          },
        };
      })
    );
  }

  async function performToggleFollowFromFeed(author) {
    const authorId = author?._id;
    if (!authorId) return;

    const key = String(authorId);
    if (followBusyByUserId[key]) return;

    const wasFollowing = Boolean(author?.isFollowing);
    const wasFollower = Boolean(author?.isFollower);
    const wasFriend = Boolean(author?.isFriend);

    setFollowBusyByUserId((prev) => ({ ...prev, [key]: true }));
    setError("");

    const optimisticIsFollowing = !wasFollowing;
    const optimisticFlags = {
      isFollowing: optimisticIsFollowing,
      isFollower: wasFollower,
      isFriend: Boolean(optimisticIsFollowing && wasFollower),
    };
    updateAuthorRelationshipEverywhere(authorId, optimisticFlags);

    try {
      const res = await toggleFollow(authorId);
      const nextIsFollowing = Boolean(res?.data?.isFollowing);
      const nextIsFollower = Boolean(res?.data?.isFollower);
      const nextIsFriend = Boolean(res?.data?.isFriend);

      updateAuthorRelationshipEverywhere(authorId, {
        isFollowing: nextIsFollowing,
        isFollower: nextIsFollower,
        isFriend: nextIsFriend,
        ...(typeof res?.data?.followersCount === "number"
          ? { followersCount: res.data.followersCount }
          : {}),
      });

      setMe((prev) => {
        if (!prev?._id) return prev;
        const prevFollowing = Array.isArray(prev.following) ? prev.following : [];
        const nextFollowing = nextIsFollowing
          ? [...prevFollowing.filter((id) => String(id) !== key), authorId]
          : prevFollowing.filter((id) => String(id) !== key);

        return {
          ...prev,
          following: nextFollowing,
          ...(typeof res?.data?.followingCount === "number"
            ? { followingCount: res.data.followingCount }
            : {}),
        };
      });

      window.dispatchEvent(new Event("notifications:refresh"));
    } catch (err) {
      console.error("Feed toggleFollow failed:", err);
      updateAuthorRelationshipEverywhere(authorId, {
        isFollowing: wasFollowing,
        isFollower: wasFollower,
        isFriend: wasFriend,
      });
      setError(err?.response?.data?.message || err?.message || "Failed to toggle connection");
    } finally {
      setFollowBusyByUserId((prev) => {
        const next = { ...(prev || {}) };
        delete next[key];
        return next;
      });
    }
  }

  function requestDisconnectConfirm(author) {
    setFollowPendingDisconnectAuthor(author || null);
  }

  function cancelDisconnectConfirm() {
    setFollowPendingDisconnectAuthor(null);
  }

  async function confirmDisconnect() {
    const author = followPendingDisconnectAuthor;
    setFollowPendingDisconnectAuthor(null);
    if (!author?._id) return;
    await performToggleFollowFromFeed(author);
  }

  async function handleToggleFollowFromFeed(author) {
    const wasFriend = Boolean(author?.isFriend);
    const wasFollowing = Boolean(author?.isFollowing);

    // Only confirm when the click would disconnect (i.e., unfollow while connected).
    if (wasFriend && wasFollowing) {
      requestDisconnectConfirm(author);
      return;
    }

    await performToggleFollowFromFeed(author);
  }

  function handleEdit(post) {
    if (!post) return;
    setOpenPostActionsId(null);
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
    setOpenPostActionsId(null);
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
    if (!newPost?._id) return;

    const categoryOk =
      selectedCategory === "all" ||
      String(newPost?.category || "general").toLowerCase() === String(selectedCategory).toLowerCase();

    const tabOk =
      activeFeedTab === "all" ||
      String(newPost?.author?._id || newPost?.author || "") === String(me?._id || "") ||
      Boolean(newPost?.author?.isFollowing) ||
      Boolean(newPost?.author?.isFriend);

    if (categoryOk && tabOk) {
      setPosts((prev) => [newPost, ...(prev || [])]);
      return;
    }

    // If it doesn't match the current view, keep UX simple: refresh page 1.
    setPosts([]);
    setPage(1);
    setHasMore(false);
    void fetchPostsPage({ nextPage: 1, append: false });
  }

  const editHasImage = Boolean(editingPost?.image && String(editingPost.image).trim());
  const canSaveEdit = Boolean(editContent.trim() || editHasImage);

  const filteredPosts = posts;

  function handleFeedTabChange(nextTab) {
    if (nextTab === activeFeedTab) {
      scrollFeedToTop();
      setRefreshTick((v) => v + 1);
      return;
    }
    scrollFeedToTop();
    setActiveFeedTab(nextTab);
  }

  async function loadMore() {
    if (loading || loadingMore || !hasMore) return;
    await fetchPostsPage({ nextPage: page + 1, append: true });
  }

  const feedTabsBar = (
    <div className="feedTabsBar" role="tablist" aria-label="Feed tabs">
      <button
        type="button"
        role="tab"
        aria-selected={activeFeedTab === "network"}
        className={activeFeedTab === "network" ? "feedTabBtn feedTabBtn--active" : "feedTabBtn"}
        onClick={() => handleFeedTabChange("network")}
      >
        Connections
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeFeedTab === "all"}
        className={activeFeedTab === "all" ? "feedTabBtn feedTabBtn--active" : "feedTabBtn"}
        onClick={() => handleFeedTabChange("all")}
      >
        All
      </button>
    </div>
  );

  const feedColumnHeader = (
    <div className="feedMainColumn__header">
      <div className="feedMainColumn__headerActions">
        {isMobileFeedLayout ? (
          <button
            type="button"
            className="secondary-button btn-compact btnWithIcon feedCategoryDrawerToggle"
            onClick={toggleCategorySidebarPinned}
            aria-expanded={categorySidebarPinnedOpen}
            aria-controls="feed-category-sidebar"
            aria-label="Post categories"
          >
            <Layers size={ICON_SIZE.sm} aria-hidden="true" />
            Categories
          </button>
        ) : null}
        <button
          className="primary-button btn-compact btnWithIcon"
          type="button"
          onClick={openCreatePostModal}
        >
          <Plus size={ICON_SIZE.sm} aria-hidden="true" />
          Create new
        </button>
      </div>

      {isMobileFeedLayout ? <div className="feedMobileTabsRow">{feedTabsBar}</div> : null}
    </div>
  );

  const feedCategoryRail = (
    <>
      {((isMobileFeedLayout && categorySidebarPinnedOpen) ||
        (!isMobileFeedLayout && !prefersHover && categorySidebarPinnedOpen)) ? (
        <button
          type="button"
          className="categorySidebarBackdrop"
          aria-label="Close categories"
          onClick={collapseCategorySidebar}
        />
      ) : null}

      <aside
        id="feed-category-sidebar"
        className={
          categorySidebarExpanded
            ? "categorySidebar categorySidebar--expanded"
            : "categorySidebar"
        }
        aria-label="Post categories"
        aria-expanded={categorySidebarExpanded}
        {...(isMobileFeedLayout && categorySidebarPinnedOpen
          ? { role: "dialog", "aria-modal": "true" }
          : {})}
        onMouseEnter={() => {
          if (prefersHover && !isMobileFeedLayout) setCategorySidebarHoverOpen(true);
        }}
        onMouseLeave={() => {
          if (prefersHover && !isMobileFeedLayout) setCategorySidebarHoverOpen(false);
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
                <Icon size={ICON_SIZE.lg} aria-hidden="true" />
              </span>
              <span className="categoryFilterText">{opt.label}</span>
            </button>
          );
        })}

        {!prefersHover || isMobileFeedLayout ? (
          <button
            type="button"
            className="categorySidebarExpandToggle"
            onClick={toggleCategorySidebarPinned}
            aria-expanded={categorySidebarPinnedOpen}
            title={categorySidebarPinnedOpen ? "Collapse categories" : "Expand categories"}
            aria-label={categorySidebarPinnedOpen ? "Collapse categories" : "Expand categories"}
          >
            <ChevronRight
              size={ICON_SIZE.md}
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
    </>
  );

  const feedPostsShell = (
    <div className="feedContentWithCategorySidebar">
      {!isMobileFeedLayout ? feedCategoryRail : null}

      <div className="platformPostsArea">
        {!isMobileFeedLayout ? feedTabsBar : null}
        {loading ? <div className="muted">Loading posts...</div> : null}
        {error ? <div className="alert alertError">{error}</div> : null}

        {!loading && !error && posts.length === 0 ? (
          <section className="card">
            <div className="emptyState">
              {activeFeedTab === "network"
                ? "No posts from your connections or following yet."
                : "No posts yet."}
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
                actionsMenuOpen={Boolean(openPostActionsId && String(openPostActionsId) === String(post._id))}
                onToggleActionsMenu={() =>
                  setOpenPostActionsId((prev) =>
                    prev && String(prev) === String(post._id) ? null : post._id
                  )
                }
                onCloseActionsMenu={() => setOpenPostActionsId(null)}
                followBusy={Boolean(
                  followBusyByUserId[
                    String(
                      post?.author && typeof post.author === "object" && post.author._id
                        ? post.author._id
                        : post?.author || ""
                    )
                  ]
                )}
                onToggleFollow={handleToggleFollowFromFeed}
                onLike={handleLike}
                onEdit={handleEdit}
                onDelete={requestDeletePost}
                onOpenDetails={handleOpenPostDetails}
                onPostUpdated={handlePostUpdated}
              />
            ))}
          </div>

          {!loading && !error && filteredPosts.length > 0 ? (
            <div className="feedLoadMoreRow">
              {hasMore ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              ) : (
                <div className="muted" style={{ textAlign: "center" }}>
                  You&rsquo;re all caught up.
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  const feedMainColumn = (
    <div className="feedMainColumn">
      {feedColumnHeader}
      {feedPostsShell}
    </div>
  );

  return (
    <div className="page feedPage">
      <AppHeader
        activePage="feed"
        currentUser={me}
        onFeedClick={() => {
          scrollFeedToTop();
          setRefreshTick((v) => v + 1);
        }}
        search={me ? <UserSearch /> : null}
        notifications={me ? <NotificationsDropdown /> : null}
      />

      <div className="feedViewportShell">
        <div
          className={isMobileFeedLayout ? "feedLayout feedLayout--mobileTabs" : "feedLayout"}
        >
          {isMobileFeedLayout ? (
            <div className="feedMobileTabStack">
              {activeMobileFeedTab === "feed" ? feedColumnHeader : null}
              {feedCategoryRail}
              <div className="feedMobileSliderClip">
                <div className="mobileFeedSlider" data-active-tab={activeMobileFeedTab}>
                  <section
                    className="mobileFeedSlide mobileFeedSlide--feed"
                    aria-hidden={activeMobileFeedTab !== "feed"}
                  >
                    <div className="feedMainColumn feedMainColumn--mobileSlideInner">
                      {feedPostsShell}
                    </div>
                  </section>
                  <section
                    className="mobileFeedSlide mobileFeedSlide--tsi"
                    aria-hidden={activeMobileFeedTab !== "tsi"}
                  >
                    <TsiOfficialFeed />
                  </section>
                </div>
              </div>
            </div>
          ) : (
            <>
              {feedMainColumn}
              <aside className="feedSidebarColumn">
                <TsiOfficialFeed />
              </aside>
            </>
          )}
        </div>
      </div>

      {isMobileFeedLayout ? (
        <nav className="mobileFeedBottomNav" aria-label="Feed navigation">
          <button
            type="button"
            className={
              activeMobileFeedTab === "feed"
                ? "mobileFeedBottomNav__btn mobileFeedBottomNav__btn--active"
                : "mobileFeedBottomNav__btn"
            }
            aria-pressed={activeMobileFeedTab === "feed"}
            onClick={() => handleMobileFeedTab("feed")}
          >
            Feed
          </button>
          <button
            type="button"
            className={
              activeMobileFeedTab === "tsi"
                ? "mobileFeedBottomNav__btn mobileFeedBottomNav__btn--active"
                : "mobileFeedBottomNav__btn"
            }
            aria-pressed={activeMobileFeedTab === "tsi"}
            onClick={() => handleMobileFeedTab("tsi")}
          >
            TSI RSS Feed
          </button>
        </nav>
      ) : null}

      <ConfirmDialog
        open={Boolean(postPendingDelete)}
        title="Delete post"
        message="Are you sure you want to delete this post?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={cancelDeletePost}
        onConfirm={confirmDeletePost}
      />

      <ConfirmDialog
        open={Boolean(followPendingDisconnectAuthor)}
        title="Disconnect"
        message="Disconnect by unfollowing?"
        confirmLabel="Disconnect"
        cancelLabel="Cancel"
        onCancel={cancelDisconnectConfirm}
        onConfirm={confirmDisconnect}
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
