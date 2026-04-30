import { useNavigate } from "react-router-dom";
import { setAuthToken } from "../api";

export default function Feed() {
  const navigate = useNavigate();

  function logout() {
    localStorage.removeItem("token");
    setAuthToken("");
    navigate("/login", { replace: true });
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1>Feed Page</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" type="button" onClick={() => navigate("/profile")}>
            My profile
          </button>
          <button className="btn" type="button" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      <p>Welcome to the academic network</p>

      <section className="card">
        <h2>Posts (placeholder)</h2>
        <div className="muted">Your posts feed will appear here.</div>
      </section>
    </div>
  );
}

