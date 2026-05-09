import { useEffect, useMemo, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getProfile } from "../api/profile";

function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      Array.from(atob(b64))
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default function RequireAdmin() {
  const location = useLocation();
  const token = localStorage.getItem("token") || "";
  const [status, setStatus] = useState("checking"); // checking | allowed | denied

  const jwtRole = useMemo(() => decodeJwtPayload(token)?.role, [token]);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!token) {
        if (!cancelled) setStatus("denied");
        return;
      }

      if (jwtRole === "admin") {
        if (!cancelled) setStatus("allowed");
        return;
      }

      try {
        const res = await getProfile();
        const role = res?.data?.user?.role;
        if (cancelled) return;
        setStatus(role === "admin" ? "allowed" : "denied");
      } catch {
        if (!cancelled) setStatus("denied");
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [token, jwtRole]);

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (status === "checking") {
    return (
      <div className="pageShell">
        <div className="card" style={{ padding: 16 }}>
          Checking access…
        </div>
      </div>
    );
  }

  if (status !== "allowed") {
    return <Navigate to="/feed" replace state={{ accessDenied: true }} />;
  }

  return <Outlet />;
}

