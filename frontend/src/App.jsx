import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import { setAuthToken } from "./api";
import { getPostById } from "./api/posts";
import { getProfile } from "./api/profile";
import { applyStoredTheme } from "./utils/theme";
import PostDetailsModal from "./components/PostDetailsModal.jsx";
import RequireAuth from "./components/RequireAuth.jsx";
import RequireProfileComplete from "./components/RequireProfileComplete.jsx";
import Feed from "./pages/Feed.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import Login from "./pages/Login.jsx";
import Messages from "./pages/Messages.jsx";
import Profile from "./pages/Profile.jsx";
import ProfileSetup from "./pages/ProfileSetup.jsx";
import Register from "./pages/Register.jsx";

export default function App() {
  const [globalPostModalPost, setGlobalPostModalPost] = useState(null);
  const [globalPostModalUser, setGlobalPostModalUser] = useState(null);

  // Keep axios Authorization in sync with localStorage token.
  useEffect(() => {
    setAuthToken(localStorage.getItem("token") || "");
  }, []);

  // Apply stored theme on initial load (persisted across refresh).
  useEffect(() => {
    applyStoredTheme();
  }, []);

  // Best-effort current user for global post modal (likes/comments).
  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem("token") || "";
    if (!token) return;

    (async () => {
      try {
        const res = await getProfile();
        if (!cancelled) setGlobalPostModalUser(res.data.user);
      } catch (err) {
        // Ignore: modal can still open read-only.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Global post details opener (used by notifications, etc).
  useEffect(() => {
    let cancelled = false;

    async function handleOpenPostDetails(event) {
      const postId = event?.detail?.postId;
      if (!postId) return;

      try {
        const res = await getPostById(postId);
        const post = res?.data?.post ?? res?.data;
        if (!cancelled) setGlobalPostModalPost(post);
      } catch (error) {
        const msg =
          error?.response?.status === 404
            ? "This post is no longer available."
            : error?.response?.status === 403
              ? "This post is unavailable."
              : error?.response?.data?.message || error?.message || "Failed to open post.";
        // Keep it simple: no toast system here yet.
        window.alert(msg);
      }
    }

    window.addEventListener("open-post-details", handleOpenPostDetails);
    return () => {
      cancelled = true;
      window.removeEventListener("open-post-details", handleOpenPostDetails);
    };
  }, []);

  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/feed" replace />} />

        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        <Route element={<RequireAuth />}>
          <Route path="/profile-setup" element={<ProfileSetup />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:userId" element={<Profile />} />

          <Route element={<RequireProfileComplete />}>
            <Route path="/feed" element={<Feed />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/messages/new/:newUserId" element={<Messages />} />
            <Route path="/messages/:conversationId" element={<Messages />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/feed" replace />} />
      </Routes>

      {globalPostModalPost ? (
        <PostDetailsModal
          post={globalPostModalPost}
          currentUser={globalPostModalUser}
          onClose={() => setGlobalPostModalPost(null)}
          onPostUpdated={(updatedPost) => setGlobalPostModalPost(updatedPost)}
          onPostDeleted={() => setGlobalPostModalPost(null)}
        />
      ) : null}
    </>
  );
}
