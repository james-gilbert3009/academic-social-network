import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaBars, FaSearch, FaSignOutAlt, FaTimes, FaUser } from "react-icons/fa";
import { setAuthToken } from "../api";

/**
 * Shared top header for authenticated pages (Feed, Profile).
 * Desktop: Feed + search together; notifications + CTAs + Profile + Logout on the right.
 * Mobile (≤768px): search opens from icon only; other actions live in hamburger drawer.
 */
export default function AppHeader({ activePage = "feed", search = null, notifications = null, children }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  function logout() {
    localStorage.removeItem("token");
    setAuthToken("");
    navigate("/login", { replace: true });
    setMenuOpen(false);
  }

  function closeOverlays() {
    setMenuOpen(false);
    setSearchOpen(false);
  }

  function goFeed() {
    navigate("/feed");
    closeOverlays();
  }

  function goProfile() {
    navigate("/profile");
    closeOverlays();
  }

  useEffect(() => {
    if (!menuOpen && !searchOpen) return;
    function onKey(e) {
      if (e.key === "Escape") closeOverlays();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, searchOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  useEffect(() => {
    function onResize() {
      if (typeof window.matchMedia === "function" && window.matchMedia("(min-width: 769px)").matches) {
        setMenuOpen(false);
        setSearchOpen(false);
      }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <div className="app-header__brand">
          <button
            type="button"
            className="app-header__brandBtn"
            onClick={goFeed}
            aria-label="TSI CONNECT — go to feed"
          >
            <span className="brand-mark brand-mark--header">TSI CONNECT</span>
          </button>
        </div>

        <div className="app-header__navSearch app-header__desktopOnly">
          <nav className="app-nav" aria-label="Main navigation">
            <button
              type="button"
              className={
                activePage === "feed"
                  ? "app-nav__link app-nav__link--active"
                  : "app-nav__link"
              }
              onClick={() => navigate("/feed")}
            >
              Feed
            </button>
          </nav>
          {search}
        </div>

        <div className="app-header__end app-header__desktopOnly">
          {notifications}
          {children}
          <button
            type="button"
            className={
              activePage === "profile"
                ? "app-nav__link app-nav__link--active"
                : "app-nav__link"
            }
            onClick={() => navigate("/profile")}
          >
            <FaUser size={14} aria-hidden />
            Profile
          </button>
          <button className="secondary-button btn-compact btnWithIcon" type="button" onClick={logout}>
            <FaSignOutAlt size={14} aria-hidden />
            Logout
          </button>
        </div>

        <div className="app-header__mobileBar">
          {search ? (
            <button
              type="button"
              className="icon-button app-header__mobileIconBtn"
              aria-expanded={searchOpen}
              aria-controls="app-header-search-panel"
              aria-label={searchOpen ? "Close search" : "Open search"}
              onClick={() => {
                setSearchOpen((v) => !v);
                setMenuOpen(false);
              }}
            >
              {searchOpen ? <FaTimes size={16} aria-hidden /> : <FaSearch size={16} aria-hidden />}
            </button>
          ) : null}
          {notifications ? (
            <div className="app-header__mobileNotif">{notifications}</div>
          ) : null}
          <button
            type="button"
            className="icon-button app-header__mobileIconBtn"
            aria-expanded={menuOpen}
            aria-controls="app-header-drawer"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => {
              setMenuOpen((v) => !v);
              setSearchOpen(false);
            }}
          >
            {menuOpen ? <FaTimes size={18} aria-hidden /> : <FaBars size={18} aria-hidden />}
          </button>
        </div>
      </div>

      {searchOpen && search ? (
        <div
          id="app-header-search-panel"
          className="app-header__searchPanel app-header__mobileOnly"
        >
          <div className="app-header__searchPanelInner">{search}</div>
        </div>
      ) : null}

      {menuOpen ? (
        <>
          <div
            className="app-header__backdrop app-header__mobileOnly"
            role="presentation"
            onClick={() => setMenuOpen(false)}
          />
          <div
            id="app-header-drawer"
            className="app-header__drawer app-header__mobileOnly"
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
          >
            <div className="app-header__drawerHeader">
              <span className="app-header__drawerTitle">Menu</span>
              <button
                type="button"
                className="icon-button"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              >
                <FaTimes size={16} aria-hidden />
              </button>
            </div>

            <nav className="app-header__drawerNav" aria-label="Main navigation">
              <button
                type="button"
                className={
                  activePage === "feed"
                    ? "app-header__drawerLink app-header__drawerLink--active"
                    : "app-header__drawerLink"
                }
                onClick={goFeed}
              >
                Feed
              </button>
            </nav>

            <div className="app-header__drawerTools">{children}</div>

            <nav className="app-header__drawerNav app-header__drawerNav--footer" aria-label="Account">
              <button
                type="button"
                className={
                  activePage === "profile"
                    ? "app-header__drawerLink app-header__drawerLink--active"
                    : "app-header__drawerLink"
                }
                onClick={goProfile}
              >
                <FaUser size={16} aria-hidden />
                Profile
              </button>
            </nav>

            <button
              className="primary-button btn-compact btnWithIcon app-header__drawerLogout"
              type="button"
              onClick={logout}
            >
              <FaSignOutAlt size={14} aria-hidden />
              Logout
            </button>
          </div>
        </>
      ) : null}
    </header>
  );
}
