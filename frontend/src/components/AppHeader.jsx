import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  House,
  ICON_SIZE,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Search,
  Settings,
  Sun,
  UserRound,
  X,
} from "../utils/icons";
import { API_BASE_URL, setAuthToken } from "../api";
import { getUnreadMessageCount } from "../api/messages";
import { getStoredTheme, toggleTheme } from "../utils/theme";
import BlockedUsersModal from "./BlockedUsersModal";

/** Polling cadence for the AppHeader's unread message count (ms). */
const UNREAD_POLL_MS = 12_000;

/** "99+" overflow rule used by the badge. */
function formatUnreadBadge(count) {
  const n = Number(count) || 0;
  if (n <= 0) return "";
  if (n > 99) return "99+";
  return String(n);
}

function profileThumbSrc(user) {
  if (!user) return "";
  const raw = user.profileImage;
  if (raw) {
    const path = String(raw);
    if (path.startsWith("/uploads")) return `${API_BASE_URL}${path}`;
    return path;
  }
  return `https://api.dicebear.com/8.x/initials/png?seed=${encodeURIComponent(user.name || "User")}&size=96`;
}

function HeaderProfileGlyph({ currentUser, iconSize }) {
  const src = profileThumbSrc(currentUser);
  if (!src) {
    return <UserRound size={iconSize} aria-hidden />;
  }
  // The avatar size scales loosely with the icon size so it fits both the
  // compact icon-only nav button (~28px) and the larger drawer header (~32px).
  const dim = Math.max(24, Math.min(32, Number(iconSize) >= 18 ? 28 : 32));
  return (
    <img
      className="app-header__profileThumb"
      src={src}
      alt=""
      width={dim}
      height={dim}
      decoding="sync"
    />
  );
}

/**
 * Shared top header for authenticated pages (Feed, Profile).
 * Desktop: Feed + search together; notifications + CTAs + Profile + Logout on the right.
 * Mobile / tablet (≤900px): search opens from icon only; other actions live in hamburger drawer.
 */
export default function AppHeader({
  activePage = "feed",
  search = null,
  notifications = null,
  currentUser = null,
  onFeedClick = null,
  onEditProfile = null,
  onDeleteAccount = null,
  showProfileActions = false,
  // Backwards-compat for older prop names used on Profile.
  onMobileEditProfile = null,
  onMobileDeleteAccount = null,
  children,
}) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [unreadChats, setUnreadChats] = useState(0);
  const [blockedModalOpen, setBlockedModalOpen] = useState(false);
  const settingsWrapRef = useRef(null);

  const isAuthenticated = Boolean(currentUser);
  const unreadBadgeText = formatUnreadBadge(unreadChats);
  const unreadAriaLabel =
    unreadChats > 0
      ? `Messages — ${unreadChats} unread ${unreadChats === 1 ? "chat" : "chats"}`
      : "Messages";

  const effectiveShowProfileActions = Boolean(showProfileActions);
  const effectiveOnEditProfile = effectiveShowProfileActions
    ? onEditProfile || onMobileEditProfile
    : null;
  const effectiveOnDeleteAccount = effectiveShowProfileActions
    ? onDeleteAccount || onMobileDeleteAccount
    : null;

  // Settings actions should be available anywhere as long as the user is logged in.
  // When on the owner's profile page, we can use the passed handlers; otherwise we fall back to /profile.
  const canShowAccountActions = Boolean(currentUser);
  const canEdit = canShowAccountActions;
  const canDelete = canShowAccountActions;

  const themeLabel = useMemo(() => (darkMode ? "Disable dark mode" : "Enable dark mode"), [darkMode]);

  function logout() {
    localStorage.removeItem("token");
    setAuthToken("");
    navigate("/login", { replace: true });
    setMenuOpen(false);
    setSettingsOpen(false);
  }

  function closeOverlays() {
    setMenuOpen(false);
    setSearchOpen(false);
    setSettingsOpen(false);
  }

  function goFeed() {
    if (activePage === "feed" && typeof onFeedClick === "function") {
      onFeedClick();
      closeOverlays();
      return;
    }
    navigate("/feed");
    closeOverlays();
  }

  function goMessages() {
    navigate("/messages");
    closeOverlays();
  }

  function goProfile() {
    navigate("/profile");
    closeOverlays();
  }

  function runAndCloseMenu(fn) {
    setMenuOpen(false);
    if (typeof fn === "function") fn();
  }

  function closeSettings() {
    setSettingsOpen(false);
  }

  function editProfile() {
    closeSettings();
    // If we're already on the logged-in user's own profile and have a handler, use it.
    // Otherwise navigate to /profile and let Profile.jsx open edit mode automatically.
    if (activePage === "profile" && effectiveShowProfileActions && typeof effectiveOnEditProfile === "function") {
      effectiveOnEditProfile();
      return;
    }
    navigate("/profile", { state: { openEditProfile: true } });
  }

  function deleteAccount() {
    closeSettings();
    if (typeof effectiveOnDeleteAccount === "function") {
      effectiveOnDeleteAccount();
      return;
    }
    navigate("/profile", { state: { openDeleteAccount: true } });
  }

  function openBlockedUsers() {
    closeSettings();
    setMenuOpen(false);
    setBlockedModalOpen(true);
  }

  function toggleDarkMode() {
    const next = toggleTheme();
    setDarkMode(next === "dark");
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

  // Mark the body while the mobile drawer is open so page-level fixed
  // elements (e.g. the Feed bottom nav) can hide themselves and stop
  // overlapping the drawer. We toggle a class instead of inline styles so
  // the rule lives next to the rest of the drawer styling in CSS.
  useEffect(() => {
    document.body.classList.toggle("mobile-drawer-open", menuOpen);
    return () => {
      document.body.classList.remove("mobile-drawer-open");
    };
  }, [menuOpen]);

  useEffect(() => {
    setDarkMode(getStoredTheme() === "dark");
  }, []);

  // Unread message count: poll every UNREAD_POLL_MS while a user is signed in,
  // and listen for "messages:unread-refresh" so the Messages page can trigger
  // an immediate re-fetch when it marks a conversation read or accepts/declines
  // a request. Skips work entirely for logged-out users.
  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadChats(0);
      return undefined;
    }

    let cancelled = false;

    async function loadUnread() {
      try {
        const res = await getUnreadMessageCount();
        if (cancelled) return;
        setUnreadChats(Number(res?.data?.unreadChats || 0));
      } catch {
        // Silent: polling will retry on the next tick.
      }
    }

    loadUnread();
    const intervalId = window.setInterval(loadUnread, UNREAD_POLL_MS);

    function onRefresh() {
      loadUnread();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") loadUnread();
    }

    window.addEventListener("messages:unread-refresh", onRefresh);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("messages:unread-refresh", onRefresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!settingsOpen) return;
    function onDown(e) {
      const el = settingsWrapRef.current;
      if (!el) return;
      if (el.contains(e.target)) return;
      setSettingsOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("touchstart", onDown);
    };
  }, [settingsOpen]);

  useEffect(() => {
    function onResize() {
      if (typeof window.matchMedia === "function" && window.matchMedia("(min-width: 901px)").matches) {
        setMenuOpen(false);
        setSearchOpen(false);
        setSettingsOpen(false);
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
                  ? "app-nav__link app-nav__link--icon app-nav__link--active"
                  : "app-nav__link app-nav__link--icon"
              }
              onClick={goFeed}
              aria-label="Feed"
              title="Feed"
              data-tooltip="Feed"
            >
              <House size={ICON_SIZE.lg} aria-hidden />
            </button>
          </nav>
          {search}
        </div>

        <div className="app-header__end app-header__desktopOnly">
          {notifications}
          {children}

          {currentUser ? (
            <button
              type="button"
              className={
                activePage === "messages"
                  ? "app-nav__link app-nav__link--icon app-nav__link--active"
                  : "app-nav__link app-nav__link--icon"
              }
              onClick={goMessages}
              aria-label={unreadAriaLabel}
              title="Messages"
              data-tooltip="Messages"
            >
              <MessageCircle size={ICON_SIZE.lg} aria-hidden />
              {unreadBadgeText ? (
                <span className="appHeaderUnreadBadge" aria-hidden="true">
                  {unreadBadgeText}
                </span>
              ) : null}
            </button>
          ) : null}

          <div className="app-header__settingsWrap" ref={settingsWrapRef}>
            <button
              type="button"
              className="app-nav__link app-nav__link--icon app-header__settingsBtn"
              aria-haspopup="menu"
              aria-expanded={settingsOpen}
              aria-label={settingsOpen ? "Close settings" : "Open settings"}
              title="Settings"
              data-tooltip="Settings"
              onClick={() => setSettingsOpen((v) => !v)}
            >
              <Settings size={ICON_SIZE.lg} aria-hidden />
            </button>

            {settingsOpen ? (
              <div className="app-header__settingsMenu" role="menu" aria-label="Settings">
                {canEdit ? (
                  <button type="button" className="app-header__settingsItem" role="menuitem" onClick={editProfile}>
                    Edit Profile
                  </button>
                ) : null}

                {canShowAccountActions ? (
                  <button
                    type="button"
                    className="app-header__settingsItem"
                    role="menuitem"
                    onClick={openBlockedUsers}
                  >
                    Blocked users
                  </button>
                ) : null}

                {canShowAccountActions && canDelete ? (
                  <button
                    type="button"
                    className="app-header__settingsItem app-header__settingsItem--danger"
                    role="menuitem"
                    onClick={deleteAccount}
                  >
                    Delete Account
                  </button>
                ) : null}

                <button
                  type="button"
                  className="app-header__settingsItem app-header__settingsItem--toggle"
                  role="menuitemcheckbox"
                  aria-checked={darkMode}
                  onClick={toggleDarkMode}
                  title={themeLabel}
                >
                  <span className="app-header__settingsToggleLabel">Dark mode</span>
                  <span className={darkMode ? "app-header__themePill app-header__themePill--on" : "app-header__themePill"}>
                    {darkMode ? (
                      <>
                        <Moon size={ICON_SIZE.sm} aria-hidden /> On
                      </>
                    ) : (
                      <>
                        <Sun size={ICON_SIZE.sm} aria-hidden /> Off
                      </>
                    )}
                  </span>
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className={
              activePage === "profile"
                ? "app-nav__link app-nav__link--icon app-nav__link--active"
                : "app-nav__link app-nav__link--icon"
            }
            onClick={() => navigate("/profile")}
            aria-label="Profile"
            title="Profile"
            data-tooltip="Profile"
          >
            <HeaderProfileGlyph currentUser={currentUser} iconSize={20} />
          </button>
          <button
            type="button"
            className="app-nav__link app-nav__link--icon app-nav__link--logout"
            onClick={logout}
            aria-label="Logout"
            title="Logout"
            data-tooltip="Logout"
          >
            <LogOut size={ICON_SIZE.lg} aria-hidden />
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
              {searchOpen ? <X size={ICON_SIZE.md} aria-hidden /> : <Search size={ICON_SIZE.md} aria-hidden />}
            </button>
          ) : null}
          {notifications ? (
            <div className="app-header__mobileNotif">{notifications}</div>
          ) : null}
          {currentUser ? (
            <button
              type="button"
              className="icon-button app-header__mobileIconBtn appHeaderIconWithBadge"
              aria-label={unreadAriaLabel}
              onClick={goMessages}
              title="Messages"
            >
              <MessageCircle size={ICON_SIZE.md} aria-hidden />
              {unreadBadgeText ? (
                <span className="appHeaderUnreadBadge" aria-hidden="true">
                  {unreadBadgeText}
                </span>
              ) : null}
            </button>
          ) : null}
          {currentUser ? (
            <button
              type="button"
              className="icon-button app-header__mobileIconBtn app-header__mobileAvatarBtn"
              aria-label="Go to profile"
              onClick={goProfile}
            >
              <HeaderProfileGlyph currentUser={currentUser} iconSize={16} />
            </button>
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
            {menuOpen ? <X size={ICON_SIZE.lg} aria-hidden /> : <Menu size={ICON_SIZE.lg} aria-hidden />}
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
                <X size={ICON_SIZE.md} aria-hidden />
              </button>
            </div>
            <div className="app-header__drawerContent">
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
                <button
                  type="button"
                  className={
                    activePage === "messages"
                      ? "app-header__drawerLink app-header__drawerLink--active"
                      : "app-header__drawerLink"
                  }
                  onClick={goMessages}
                  aria-label={unreadAriaLabel}
                >
                  <MessageCircle size={ICON_SIZE.md} aria-hidden />
                  Messages
                  {unreadBadgeText ? (
                    <span
                      className="appHeaderUnreadBadge appHeaderUnreadBadge--inline"
                      aria-hidden="true"
                    >
                      {unreadBadgeText}
                    </span>
                  ) : null}
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
                  <HeaderProfileGlyph currentUser={currentUser} iconSize={16} />
                  Profile
                </button>
              </nav>

              {canShowAccountActions ? (
                <div className="app-header__drawerSection" aria-label="Settings">
                  <div className="app-header__drawerSectionTitle">Settings</div>
                  <nav className="app-header__drawerNav app-header__drawerNav--settings" aria-label="Settings">
                    <button
                      type="button"
                      className="app-header__drawerLink"
                      onClick={() => {
                        setMenuOpen(false);
                        toggleDarkMode();
                      }}
                    >
                      Dark mode: {darkMode ? "On" : "Off"}
                    </button>

                    {canEdit ? (
                      <button
                        type="button"
                        className="app-header__drawerLink"
                        onClick={() => {
                          setMenuOpen(false);
                          editProfile();
                        }}
                      >
                        Edit Profile
                      </button>
                    ) : null}

                    <button
                      type="button"
                      className="app-header__drawerLink"
                      onClick={openBlockedUsers}
                    >
                      Blocked users
                    </button>

                    {canDelete ? (
                      <button
                        type="button"
                        className="app-header__drawerLink app-header__drawerLink--danger"
                        onClick={() => {
                          setMenuOpen(false);
                          deleteAccount();
                        }}
                      >
                        Delete Account
                      </button>
                    ) : null}
                  </nav>
                </div>
              ) : null}
            </div>

            <div className="app-header__drawerFooter">
              <button
                className="primary-button btn-compact btnWithIcon app-header__drawerLogout"
                type="button"
                onClick={logout}
              >
                <LogOut size={ICON_SIZE.sm} aria-hidden />
                Logout
              </button>
            </div>
          </div>
        </>
      ) : null}

      <BlockedUsersModal
        open={blockedModalOpen}
        onClose={() => setBlockedModalOpen(false)}
      />
    </header>
  );
}
