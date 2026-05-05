import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import { setAuthToken } from "./api";
import RequireAuth from "./components/RequireAuth.jsx";
import RequireProfileComplete from "./components/RequireProfileComplete.jsx";
import Feed from "./pages/Feed.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import Login from "./pages/Login.jsx";
import Profile from "./pages/Profile.jsx";
import ProfileSetup from "./pages/ProfileSetup.jsx";
import Register from "./pages/Register.jsx";

export default function App() {
  // Keep axios Authorization in sync with localStorage token.
  useEffect(() => {
    setAuthToken(localStorage.getItem("token") || "");
  }, []);

  return (
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
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/feed" replace />} />
    </Routes>
  );
}
