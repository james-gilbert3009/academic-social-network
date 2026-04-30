import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { api, setAuthToken } from "../api";

export default function RequireProfileComplete() {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, ok: false });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        // If the user chose "complete later", allow access.
        if (localStorage.getItem("skipProfileSetup") === "1") {
          if (!cancelled) setState({ loading: false, ok: true });
          return;
        }

        const token = localStorage.getItem("token") || "";
        setAuthToken(token);
        const res = await api.get("/api/users/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const complete = Boolean(res.data?.user?.isProfileComplete);
        if (!cancelled) setState({ loading: false, ok: complete });
      } catch {
        if (!cancelled) setState({ loading: false, ok: false });
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading) {
    return <div className="page muted">Loading...</div>;
  }

  if (!state.ok) {
    return <Navigate to="/profile-setup" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

