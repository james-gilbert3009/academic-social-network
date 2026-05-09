import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { API_BASE_URL } from "../api";
import { getProfile, getProfileById } from "../api/profile";
import {
  acceptMessageRequest,
  declineMessageRequest,
  deleteConversation,
  deleteMessage,
  getConversation,
  getConversations,
  getMessageRequests,
  markConversationRead,
  sendFirstMessageToUser,
  sendMessage,
} from "../api/messages";
import { blockUser, unblockUser } from "../api/users";
import AppHeader from "../components/AppHeader.jsx";
import ClickableAvatar from "../components/ClickableAvatar";
import ConfirmDialog from "../components/ConfirmDialog";
import NotificationsDropdown from "../components/NotificationsDropdown.jsx";
import PostDetailsModal from "../components/PostDetailsModal";
import RoleBadge from "../components/RoleBadge";
import ReportModal from "../components/ReportModal";
import { getPostById } from "../api/posts";
import timeAgo from "../utils/timeAgo";
import {
  ArrowLeft,
  Ban,
  Check,
  ICON_SIZE,
  Paperclip,
  SendHorizontal,
  Trash2,
  Unlock,
  X,
} from "../utils/icons";

const ACTIVE_POLL_MS = 4000;
const LIST_POLL_MS = 12000;
const NEAR_BOTTOM_PX = 80;

/**
 * Tell the AppHeader (and any other listeners) to refetch their unread
 * message count immediately, instead of waiting for their next poll. Fired
 * any time we change something that would lower the global tally locally
 * (mark-as-read, request decline) so the navbar badge updates without lag.
 */
function notifyUnreadRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("messages:unread-refresh"));
}

function uploadUrl(p) {
  if (!p) return "";
  const path = String(p);
  if (path.startsWith("/uploads")) return `${API_BASE_URL}${path}`;
  return path;
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function otherParticipant(conversation, myId) {
  const parts = Array.isArray(conversation?.participants) ? conversation.participants : [];
  const me = String(myId || "");
  return (
    parts.find((p) => String(p?._id || p) !== me) ||
    parts[0] ||
    null
  );
}

function messagePreview(lastMessage) {
  if (!lastMessage) return "No messages yet";
  const text = String(lastMessage.text || "").trim();
  const hasMedia = Array.isArray(lastMessage.media) && lastMessage.media.length > 0;
  const hasShared = Boolean(lastMessage.sharedPost);
  if (text) return text.length > 70 ? `${text.slice(0, 70)}…` : text;
  if (hasShared) return "Shared a post";
  if (hasMedia) return lastMessage.media.some((m) => m?.type === "video") ? "Video" : "Photo";
  return "Message";
}

function isTempId(id) {
  return String(id || "").startsWith("temp-");
}

// Merge server messages with any locally-pending temp messages so polling never
// drops an in-flight optimistic send.
function mergeMessages(prevLocal, serverMessages) {
  const server = Array.isArray(serverMessages) ? serverMessages : [];
  const serverIds = new Set(server.map((m) => String(m._id)));
  const tempLocal = (Array.isArray(prevLocal) ? prevLocal : []).filter(
    (m) => isTempId(m?._id) && !serverIds.has(String(m._id))
  );
  return [...server, ...tempLocal];
}

export default function Messages() {
  const navigate = useNavigate();
  const location = useLocation();
  // `conversationId` matches /messages/:conversationId (an existing chat).
  // `newUserId`     matches /messages/new/:newUserId (a brand-new chat that
  // has not been persisted yet — it has a target user, but no Conversation
  // document on the server until the user sends the first message).
  const { conversationId, newUserId } = useParams();
  const isMobile = useMediaQuery("(max-width: 900px)");

  const [me, setMe] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [requests, setRequests] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [requestsError, setRequestsError] = useState("");

  const [tab, setTab] = useState("inbox"); // "inbox" | "requests"

  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [decisionBusy, setDecisionBusy] = useState(false);

  // Target user for a /messages/new/:newUserId draft chat. Populated by
  // fetching their public profile. Until the user actually sends a first
  // message we deliberately keep zero server state for this conversation.
  const [pendingTargetUser, setPendingTargetUser] = useState(null);
  const [pendingTargetLoading, setPendingTargetLoading] = useState(false);
  const [pendingTargetError, setPendingTargetError] = useState("");

  const isNewChat = Boolean(newUserId && !conversationId);

  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [composerError, setComposerError] = useState("");

  // Shared-post-in-chat modal state. Opened in-place so we never bounce the user
  // out of the Messages page (no /feed redirect).
  const [selectedSharedPost, setSelectedSharedPost] = useState(null);
  const [sharedPostUnavailable, setSharedPostUnavailable] = useState(false);

  const [openMessageActionsId, setOpenMessageActionsId] = useState(null);
  const [pendingDeleteMessage, setPendingDeleteMessage] = useState(null); // { messageId, mode }
  const [, setMessageDeleteBusy] = useState(false);
  const [pendingDeleteChat, setPendingDeleteChat] = useState(false);
  const [reportUserOpen, setReportUserOpen] = useState(false);

  const scrollRef = useRef(null);
  // Whether the user is parked near the bottom of the chat scroller. We only
  // auto-scroll on new messages when this is true (or when the user just sent).
  const nearBottomRef = useRef(true);

  useEffect(() => {
    if (!openMessageActionsId) return undefined;
    function onPointerDown(e) {
      const el = e.target;
      if (el && typeof el.closest === "function" && el.closest(".messageActionsWrap")) return;
      setOpenMessageActionsId(null);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setOpenMessageActionsId(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMessageActionsId]);
  const forceScrollNextRef = useRef(true);
  const lastReadAtRef = useRef(null);

  const myId = String(me?._id || "");

  // In a brand-new chat there is no conversation yet, so the "other" person
  // is the route's target user. Otherwise it's the non-me participant of
  // the active conversation, exactly as before.
  const activeOther = useMemo(() => {
    if (isNewChat) return pendingTargetUser || null;
    return otherParticipant(activeConversation, myId);
  }, [isNewChat, pendingTargetUser, activeConversation, myId]);

  const isMessagingBlocked = Boolean(activeConversation?.isMessagingBlocked);
  // Banner copy in the chat header. The global-block semantics merge
  // "blocked by me" and "blocked by them" into one user-facing message
  // when the source is unknown (legacy conversation-level block) but we
  // surface an explicit hint for the blocker since they can act on it.
  const blockedLabel = activeConversation?.isBlockedByMe
    ? "You blocked this user. Unblock to message them again."
    : activeConversation?.isBlockedByOther
      ? "Messaging is unavailable because one of you blocked the other."
      : "";

  const isRequest = Boolean(activeConversation?.isRequest);
  const isRequestedByMe = Boolean(activeConversation?.isRequestedByMe);
  const isRequestedToMe = Boolean(activeConversation?.isRequestedToMe);
  const isDeclined = Boolean(activeConversation?.isDeclined);

  // Composer rules:
  // - new chat (no convo yet): always allow — first send will both create
  //   the conversation and send the message in a single backend call.
  // - declined: never allow
  // - request and I'm the recipient: never allow until accepted
  // - request and I'm the requester: allow
  // - active: allow unless blocked
  const composerDisabled =
    !isNewChat &&
    (isDeclined ||
      isMessagingBlocked ||
      (isRequest && isRequestedToMe));

  const canSend =
    !sending &&
    !composerDisabled &&
    (Boolean(text.trim()) || files.length > 0);

  // Index of the last message I sent, used to display the read indicator only on
  // the latest of my own messages instead of cluttering every bubble.
  const lastMyMessageIndex = useMemo(() => {
    for (let i = (messages || []).length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      const senderId = String(m?.sender?._id || m?.sender || "");
      if (senderId === myId) return i;
    }
    return -1;
  }, [messages, myId]);

  async function loadMe() {
    const res = await getProfile();
    setMe(res.data.user);
  }

  const refreshConversations = useCallback(async () => {
    setListError("");
    try {
      const res = await getConversations();
      setConversations(res.data.conversations || []);
    } catch (err) {
      setListError(err?.response?.data?.message || err?.message || "Failed to load conversations");
    } finally {
      setListLoading(false);
    }
  }, []);

  const refreshRequests = useCallback(async () => {
    setRequestsError("");
    setRequestsLoading(true);
    try {
      const res = await getMessageRequests();
      setRequests(res.data.requests || []);
    } catch (err) {
      setRequestsError(err?.response?.data?.message || err?.message || "Failed to load requests");
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  const markActiveConversationRead = useCallback(
    async (id) => {
      if (!id) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const res = await markConversationRead(id);
        const readAt = res?.data?.readAt || new Date().toISOString();
        lastReadAtRef.current = readAt;
        // Update local state so unread counts and the chat both reflect the new read state
        // without waiting for the next poll.
        setMessages((prev) =>
          (prev || []).map((m) => {
            const recipientId = String(m?.recipient?._id || m?.recipient || "");
            if (recipientId !== myId) return m;
            if (m?.readAt) return m;
            return { ...m, readAt };
          })
        );
        setConversations((prev) =>
          (prev || []).map((c) =>
            String(c._id) === String(id) ? { ...c, unreadCount: 0 } : c
          )
        );
        // Sync the navbar badge instead of waiting for its 12s poll.
        notifyUnreadRefresh();
      } catch {
        // Best-effort. Polling will retry.
      }
    },
    [myId]
  );

  // For draft chats (/messages/new/:newUserId) load the target user once
  // so the chat header and composer can render. We do NOT call any
  // conversation API here — that would defeat the whole point of the lazy
  // creation flow. Leaving without sending must not leave any trace.
  useEffect(() => {
    if (!isNewChat) {
      // Make sure stale draft state doesn't leak into a real conversation.
      setPendingTargetUser(null);
      setPendingTargetError("");
      setPendingTargetLoading(false);
      return undefined;
    }

    let cancelled = false;
    setPendingTargetLoading(true);
    setPendingTargetError("");
    setPendingTargetUser(null);
    setActiveConversation(null);
    setMessages([]);
    setComposerError("");
    setText("");
    setFiles([]);
    nearBottomRef.current = true;
    forceScrollNextRef.current = true;

    (async () => {
      try {
        const res = await getProfileById(newUserId);
        if (cancelled) return;
        const user = res?.data?.user || null;
        if (!user) {
          setPendingTargetError("User not found");
        } else {
          setPendingTargetUser(user);
        }
      } catch (err) {
        if (cancelled) return;
        setPendingTargetError(
          err?.response?.data?.message || err?.message || "Could not open chat"
        );
      } finally {
        if (!cancelled) setPendingTargetLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isNewChat, newUserId]);

  // Load + poll the active conversation. We keep the loop tight (4s) so the
  // sender sees "Sent" -> "Opened" without manual refresh.
  useEffect(() => {
    if (!conversationId) {
      // Don't wipe activeConversation here when we're on the draft route —
      // we already cleared it in the new-chat effect, and the post-send
      // navigate(replace) flow may briefly straddle both renders.
      if (!isNewChat) {
        setActiveConversation(null);
        setMessages([]);
      }
      return undefined;
    }

    let cancelled = false;
    let initialLoad = true;
    let prevIncomingCount = 0;

    async function load() {
      try {
        const res = await getConversation(conversationId);
        if (cancelled) return;
        const conversation = res?.data?.conversation || null;
        const serverMessages = res?.data?.messages || [];

        setActiveConversation(conversation);
        setMessages((prev) => mergeMessages(prev, serverMessages));

        // Detect newly-arrived incoming messages so we can mark-read again
        // (e.g. if a message comes in while the chat is open).
        const incomingUnread = serverMessages.filter((m) => {
          const recipientId = String(m?.recipient?._id || m?.recipient || "");
          return recipientId === myId && !m?.readAt;
        }).length;

        const shouldMarkRead =
          incomingUnread > 0 &&
          (initialLoad || incomingUnread !== prevIncomingCount) &&
          !conversation?.isRequestedToMe; // request recipient must accept first
        prevIncomingCount = incomingUnread;

        if (shouldMarkRead) {
          markActiveConversationRead(conversationId);
        }

        if (initialLoad) {
          initialLoad = false;
          setChatLoading(false);
          forceScrollNextRef.current = true;
        }
      } catch (err) {
        if (cancelled) return;
        if (initialLoad) {
          setChatError(err?.response?.data?.message || err?.message || "Failed to load chat");
          setActiveConversation(null);
          setMessages([]);
          setChatLoading(false);
          initialLoad = false;
        }
      }
    }

    setChatLoading(true);
    setChatError("");
    // Only wipe the messages list when we're switching to a *different*
    // existing conversation. If we just sent the first message in a draft
    // chat the URL flips from /messages/new/:userId to /messages/:id and
    // those locally-known messages already belong to the new conversation
    // — keeping them avoids a flash of empty chat between the navigate()
    // and the first poll response.
    setMessages((prev) => {
      const prevList = Array.isArray(prev) ? prev : [];
      if (!prevList.length) return prevList;
      const sameConvo = prevList.some((m) => {
        const cid = m?.conversation?._id || m?.conversation;
        return cid && String(cid) === String(conversationId);
      });
      return sameConvo ? prevList : [];
    });
    nearBottomRef.current = true;
    forceScrollNextRef.current = true;

    load();
    const intervalId = window.setInterval(load, ACTIVE_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [conversationId, isNewChat, markActiveConversationRead, myId]);

  // Re-mark the chat as read when the tab becomes visible again, so the sender
  // on the other side sees their messages flip to "Opened".
  useEffect(() => {
    if (!conversationId) return undefined;
    function onVisibility() {
      if (document.visibilityState === "visible") {
        markActiveConversationRead(conversationId);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [conversationId, markActiveConversationRead]);

  // Boot: load profile, then prime both lists.
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        await loadMe();
        if (!cancelled) {
          await refreshConversations();
          await refreshRequests();
        }
      } catch {
        // handled in refresh
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, [refreshConversations, refreshRequests]);

  // Poll inbox + requests lists.
  useEffect(() => {
    const id = window.setInterval(() => {
      refreshConversations();
      refreshRequests();
    }, LIST_POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshConversations, refreshRequests]);

  // Notification-driven request view.
  useEffect(() => {
    const wantsRequestView = Boolean(location.state?.openRequest);
    if (!wantsRequestView) return;
    setTab("requests");
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (activeConversation?.isRequestedToMe) {
      setTab("requests");
    }
  }, [activeConversation?.isRequestedToMe]);

  // Smart scroll: only auto-snap to bottom if the user was already there or
  // we just sent a message ourselves.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (forceScrollNextRef.current || nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      forceScrollNextRef.current = false;
      nearBottomRef.current = true;
    }
  }, [messages]);

  function onScrollChat() {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottomRef.current = dist <= NEAR_BOTTOM_PX;
  }

  function pickConversation(id) {
    if (!id) return;
    if (String(id) === String(conversationId)) return;
    navigate(`/messages/${id}`);
  }

  function onPickFiles(e) {
    const picked = Array.from(e.target.files || []);
    const next = [...files, ...picked].slice(0, 5);
    setFiles(next);
    e.target.value = "";
  }

  function removeFile(idx) {
    setFiles((prev) => (prev || []).filter((_, i) => i !== idx));
  }

  function buildOptimisticMessage({ tempId, trimmed, attachments }) {
    const otherId = String(activeOther?._id || "");
    const previewMedia = attachments.map((f) => ({
      url: URL.createObjectURL(f),
      type: String(f.type || "").startsWith("video/") ? "video" : "image",
      originalName: f.name || "",
      _localPreview: true,
    }));
    return {
      _id: tempId,
      // In a draft chat there is no conversation id yet — leave it empty
      // and the server-echoed message will carry the canonical one.
      conversation: conversationId || null,
      sender: { _id: myId, name: me?.name, username: me?.username, role: me?.role, profileImage: me?.profileImage },
      recipient: { _id: otherId, name: activeOther?.name, username: activeOther?.username, role: activeOther?.role, profileImage: activeOther?.profileImage },
      text: trimmed,
      media: previewMedia,
      sharedPost: null,
      readAt: null,
      createdAt: new Date().toISOString(),
      pending: true,
      failed: false,
    };
  }

  async function onSend(e) {
    e.preventDefault();
    if (!isNewChat && !conversationId) return;
    if (!canSend) return;

    const trimmed = text.trim();
    const attachments = [...files];
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic = buildOptimisticMessage({ tempId, trimmed, attachments });

    setSending(true);
    setComposerError("");
    setMessages((prev) => [...(prev || []), optimistic]);
    setText("");
    setFiles([]);
    forceScrollNextRef.current = true;

    try {
      const fd = new FormData();
      if (trimmed) fd.append("text", trimmed);
      for (const f of attachments) fd.append("media", f);

      // Two send paths:
      // 1. New chat (no conversation yet) — go through the atomic
      //    /users/:userId/message endpoint, which creates the conversation
      //    AND the message AND (when needed) the message_request
      //    notification on the server in a single round-trip. This is the
      //    only place such a thing is ever created.
      // 2. Existing chat — use the normal per-conversation send route.
      const res = isNewChat
        ? await sendFirstMessageToUser(newUserId, fd)
        : await sendMessage(conversationId, fd);

      const real = res?.data?.message;
      const updatedConvo = res?.data?.conversation;

      setMessages((prev) => {
        const withoutTemp = (prev || []).filter((m) => String(m._id) !== tempId);
        if (!real) return withoutTemp;
        const exists = withoutTemp.some((m) => String(m._id) === String(real._id));
        return exists ? withoutTemp : [...withoutTemp, real];
      });

      if (updatedConvo) {
        setActiveConversation((prev) =>
          prev && String(prev._id) === String(updatedConvo._id)
            ? { ...prev, ...updatedConvo }
            : updatedConvo
        );
        // Drop a stale row for this user if the inbox was already showing a
        // pre-existing conversation, then put the freshest one on top.
        setConversations((prev) => {
          const without = (prev || []).filter((c) => String(c._id) !== String(updatedConvo._id));
          return [updatedConvo, ...without];
        });

        // First-send path: replace the /messages/new/:userId URL with the
        // real /messages/:conversationId so reloads, back-navigation, and
        // the conversation polling effect all anchor on the persisted doc.
        if (isNewChat && updatedConvo?._id) {
          navigate(`/messages/${updatedConvo._id}`, { replace: true });
        }

        // The bell may need to surface or remove a message_request row,
        // and the navbar badge should refresh now that we just created
        // unread mail for the recipient.
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("notifications:refresh"));
        }
        notifyUnreadRefresh();
      } else if (!isNewChat) {
        // Fall back to a plain refresh if the server didn't echo a
        // conversation on an existing-chat send.
        refreshConversations();
        refreshRequests();
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to send";
      setComposerError(msg);
      setMessages((prev) =>
        (prev || []).map((m) =>
          String(m._id) === tempId ? { ...m, pending: false, failed: true } : m
        )
      );
    } finally {
      setSending(false);
    }
  }

  // Block / Unblock from the chat header now uses the GLOBAL user-level
  // block (stored on `User.blockedUsers`), not the legacy per-conversation
  // flag. After the call we re-fetch the conversation so its decorated
  // `isBlockedByMe` / `isMessagingBlocked` / banner state reflects the
  // server's new view, and we nudge the rest of the app to refresh too
  // (notifications, list polls, blocked-users settings).
  async function onBlockToggle() {
    if (!activeConversation) return;
    const otherUserId = activeOther?._id;
    if (!otherUserId) return;
    setChatError("");
    try {
      if (activeConversation.isBlockedByMe) {
        await unblockUser(otherUserId);
      } else {
        await blockUser(otherUserId);
      }
      // Pull the fresh conversation so the banner / composer / button
      // labels match the server. We can only do this when there is a
      // persisted conversation — for legacy "no conversationId" cases
      // (shouldn't happen with current UI) we fall back to a list
      // refresh.
      if (conversationId) {
        try {
          const res = await getConversation(conversationId);
          if (res?.data?.conversation) {
            setActiveConversation(res.data.conversation);
          }
        } catch {
          // If re-fetching the conversation fails (e.g. block removed
          // visibility temporarily) just rely on the list refresh.
        }
      }
      refreshConversations();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("notifications:refresh"));
      }
    } catch (err) {
      setChatError(err?.response?.data?.message || err?.message || "Failed to update block");
    }
  }

  async function onAcceptRequest(targetConversationId) {
    const id = targetConversationId || conversationId;
    if (!id) return;
    setDecisionBusy(true);
    setChatError("");
    try {
      const res = await acceptMessageRequest(id);
      setActiveConversation((prev) =>
        prev && String(prev._id) === String(id) ? res.data.conversation : prev
      );
      // Drop from the requests list locally without waiting on the next poll.
      setRequests((prev) => (prev || []).filter((c) => String(c._id) !== String(id)));
      // Refresh both lists so the conversation now appears in the inbox.
      await Promise.all([refreshConversations(), refreshRequests()]);
      setTab("inbox");
      window.dispatchEvent(new Event("notifications:refresh"));
      // Accepting opens the chat immediately, so the read pass that runs next
      // will lower the navbar badge. Nudge it now so the change feels instant.
      notifyUnreadRefresh();
    } catch (err) {
      setChatError(err?.response?.data?.message || err?.message || "Failed to accept request");
    } finally {
      setDecisionBusy(false);
    }
  }

  async function onDeclineRequest(targetConversationId) {
    const id = targetConversationId || conversationId;
    if (!id) return;
    setDecisionBusy(true);
    setChatError("");
    try {
      const res = await declineMessageRequest(id);
      const updatedConversation = res?.data?.conversation || null;

      // Declined requests STAY in the Requests tab (so the recipient can
      // still change their mind later) — flip their status in place rather
      // than removing them. The backend response carries the freshly
      // decorated conversation so we can splice it straight in.
      setRequests((prev) =>
        (prev || []).map((c) =>
          String(c._id) === String(id)
            ? updatedConversation || { ...c, status: "declined", isRequest: false, isDeclined: true }
            : c
        )
      );

      // If the user is currently viewing this conversation, reflect the new
      // declined state immediately so the chat shows the "You declined…"
      // notice + Accept button without waiting for the 4s poll.
      if (updatedConversation && String(conversationId || "") === String(id)) {
        setActiveConversation(updatedConversation);
      }

      await Promise.all([refreshConversations(), refreshRequests()]);
      // The bell removes the message_request notification on decline
      // (backend deletes it), so refresh the bell list right away.
      window.dispatchEvent(new Event("notifications:refresh"));
      // Declined conversations are excluded from the unread tally on the
      // backend, so the navbar badge can drop right away.
      notifyUnreadRefresh();
    } catch (err) {
      setChatError(err?.response?.data?.message || err?.message || "Failed to decline request");
    } finally {
      setDecisionBusy(false);
    }
  }

  async function openSharedPost(post) {
    if (!post?._id) return;
    // Open immediately with whatever's already on the message so the modal
    // appears instantly. Refresh in the background for fresh likes/comments.
    setSelectedSharedPost(post);
    setSharedPostUnavailable(false);
    try {
      const res = await getPostById(post._id);
      const fresh = res?.data?.post;
      if (fresh) {
        setSelectedSharedPost(fresh);
        // Sync the embedded shared post on every message that references it
        // so previews reflect the fresh likes/comments counts.
        setMessages((prev) =>
          (prev || []).map((m) =>
            String(m?.sharedPost?._id || "") === String(fresh._id)
              ? { ...m, sharedPost: fresh }
              : m
          )
        );
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404) {
        // Post was deleted — show the unavailable state and clean up local copies.
        setSelectedSharedPost(null);
        setSharedPostUnavailable(true);
        setMessages((prev) =>
          (prev || []).map((m) =>
            String(m?.sharedPost?._id || "") === String(post._id)
              ? { ...m, sharedPost: null, sharedPostUnavailable: true }
              : m
          )
        );
      }
      // For other errors (network etc.), keep the embedded post visible.
    }
  }

  function handleSharedPostUpdated(updatedPost) {
    if (!updatedPost?._id) return;
    setSelectedSharedPost(updatedPost);
    setMessages((prev) =>
      (prev || []).map((m) =>
        String(m?.sharedPost?._id || "") === String(updatedPost._id)
          ? { ...m, sharedPost: updatedPost }
          : m
      )
    );
  }

  function handleCloseSharedPost() {
    setSelectedSharedPost(null);
    setSharedPostUnavailable(false);
  }

  function getMessageStatus(message, indexInList) {
    if (message?.failed) return { label: "Failed", tone: "failed" };
    if (message?.pending) return { label: "Sending…", tone: "pending" };
    // Only the most-recent own message shows "Sent"/"Opened" for a clean look.
    if (indexInList !== lastMyMessageIndex) return null;
    if (message?.readAt) return { label: "Opened", tone: "read" };
    return { label: "Sent", tone: "sent" };
  }

  const requestCount = requests.length;

  const inboxList = (
    <div className="messagesList" role="list" aria-label="Conversations">
      {(conversations || []).map((c) => {
        const other = otherParticipant(c, myId) || {};
        const isActive = Boolean(conversationId && String(conversationId) === String(c._id));
        const lastTime = c.lastMessageAt ? timeAgo(c.lastMessageAt) : "";
        const preview = messagePreview(c.lastMessage);
        const unread = Number(c.unreadCount || 0);
        const pendingFromMe = Boolean(c.isRequest && c.isRequestedByMe);

        return (
          <button
            key={c._id}
            type="button"
            role="listitem"
            className={
              [
                "messagesListItem",
                isActive ? "messagesListItem--active" : "",
                unread > 0 ? "messagesListItem--unread" : "",
              ].filter(Boolean).join(" ")
            }
            onClick={() => pickConversation(c._id)}
          >
            <ClickableAvatar
              user={other}
              currentUserId={myId}
              imgClassName="messagesListItem__avatar"
            />
            <div className="messagesListItem__meta">
              <div className="messagesListItem__top">
                <div className="messagesListItem__nameRow">
                  <span className="messagesListItem__name">{other.name || "User"}</span>
                  <RoleBadge role={other.role} />
                  {pendingFromMe ? (
                    <span className="requestBadge requestBadge--pending">Pending</span>
                  ) : null}
                </div>
                <span className="messagesListItem__time muted">{lastTime}</span>
              </div>
              <div className="messagesListItem__bottom">
                <span className="messagesListItem__preview muted">@{other.username || "user"} · {preview}</span>
                {unread > 0 ? <span className="messagesListItem__unread" aria-label={`${unread} unread`}>{unread}</span> : null}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );

  const requestsList = (
    <div className="messagesList" role="list" aria-label="Message requests">
      {(requests || []).map((c) => {
        const other = otherParticipant(c, myId) || {};
        const isActive = Boolean(conversationId && String(conversationId) === String(c._id));
        const lastTime = c.lastMessageAt ? timeAgo(c.lastMessageAt) : (c.requestedAt ? timeAgo(c.requestedAt) : "");
        const preview = messagePreview(c.lastMessage);
        // Declined requests stay in the list; the only available action is to
        // accept (changing your mind). Pending requests get both Accept and
        // Decline.
        const declined = Boolean(c.isDeclined);

        return (
          <div
            key={c._id}
            role="listitem"
            className={[
              "messagesListItem",
              "messagesListItem--request",
              isActive ? "messagesListItem--active" : "",
              declined ? "messagesListItem--declined" : "",
            ].filter(Boolean).join(" ")}
          >
            <button
              type="button"
              className="messagesListItem__main"
              onClick={() => pickConversation(c._id)}
              aria-label={
                declined
                  ? `Open declined request from ${other.name || "user"}`
                  : `Open request from ${other.name || "user"}`
              }
            >
              <ClickableAvatar
                user={other}
                currentUserId={myId}
                imgClassName="messagesListItem__avatar"
              />
              <div className="messagesListItem__meta">
                <div className="messagesListItem__top">
                  <div className="messagesListItem__nameRow">
                    <span className="messagesListItem__name">{other.name || "User"}</span>
                    <RoleBadge role={other.role} />
                    <span
                      className={
                        declined
                          ? "requestBadge requestBadge--declined"
                          : "requestBadge"
                      }
                    >
                      {declined ? "Declined" : "Message request"}
                    </span>
                  </div>
                  <span className="messagesListItem__time muted">{lastTime}</span>
                </div>
                <div className="messagesListItem__bottom">
                  <span className="messagesListItem__preview muted">@{other.username || "user"} · {preview}</span>
                </div>
              </div>
            </button>
            <div className="requestActions">
              <button
                type="button"
                className="primary-button btn-compact btnWithIcon"
                onClick={() => onAcceptRequest(c._id)}
                disabled={decisionBusy}
                aria-label={declined ? "Accept this previously declined request" : "Accept request"}
              >
                <Check size={ICON_SIZE.sm} aria-hidden /> Accept
              </button>
              {declined ? null : (
                <button
                  type="button"
                  className="outline-button btn-compact btnWithIcon"
                  onClick={() => onDeclineRequest(c._id)}
                  disabled={decisionBusy}
                  aria-label="Decline request"
                >
                  <X size={ICON_SIZE.sm} aria-hidden /> Decline
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const listPane = (
    <section className="card messagesListPane">
      <div className="topbar" style={{ padding: 0 }}>
        <h2 style={{ marginBottom: 0 }}>Messages</h2>
        <button
          className="secondary-button btn-compact"
          type="button"
          onClick={() => {
            refreshConversations();
            refreshRequests();
          }}
        >
          Refresh
        </button>
      </div>

      <div
        className="messagesTabs"
        role="tablist"
        aria-label="Messages and requests"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "inbox"}
          className={tab === "inbox" ? "messagesTab messagesTab--active" : "messagesTab"}
          onClick={() => setTab("inbox")}
        >
          Inbox
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "requests"}
          className={tab === "requests" ? "messagesTab messagesTab--active" : "messagesTab"}
          onClick={() => setTab("requests")}
        >
          Requests
          {requestCount > 0 ? (
            <span className="messagesTab__badge" aria-label={`${requestCount} pending requests`}>
              {requestCount}
            </span>
          ) : null}
        </button>
      </div>

      {tab === "inbox" ? (
        <>
          {listLoading ? <div className="muted" style={{ marginTop: 10 }}>Loading…</div> : null}
          {listError ? <div className="alert alertError" style={{ marginTop: 10 }}>{listError}</div> : null}
          {!listLoading && !listError && conversations.length === 0 ? (
            <div className="emptyState emptyState--subtle" style={{ marginTop: 10 }}>
              No conversations yet. Start one from a profile.
            </div>
          ) : null}
          {inboxList}
        </>
      ) : (
        <>
          {requestsLoading ? <div className="muted" style={{ marginTop: 10 }}>Loading…</div> : null}
          {requestsError ? <div className="alert alertError" style={{ marginTop: 10 }}>{requestsError}</div> : null}
          {!requestsLoading && !requestsError && requests.length === 0 ? (
            <div className="emptyState emptyState--subtle" style={{ marginTop: 10 }}>
              No message requests.
            </div>
          ) : null}
          {requestsList}
        </>
      )}
    </section>
  );

  const composerPlaceholder = (() => {
    if (isDeclined && isRequestedToMe) return "Accept this request to reply";
    if (isDeclined) return "This request was declined";
    if (isRequest && isRequestedToMe) return "Accept this request to reply";
    if (isMessagingBlocked) return blockedLabel;
    return "Write a message…";
  })();

  const chatPane = (
    <section className="card messagesChatPane">
      {!conversationId && !isNewChat ? (
        <div className="emptyState">
          Select a conversation to start chatting.
        </div>
      ) : (
        <div className="messagesChatPanel">
          <div className="messagesChatHeader">
            {isMobile ? (
              <button
                type="button"
                className="icon-button"
                aria-label="Back to conversations"
                onClick={() => navigate("/messages")}
              >
                <ArrowLeft size={ICON_SIZE.md} aria-hidden />
              </button>
            ) : null}
            <div className="messagesChatHeader__who">
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <ClickableAvatar
                  user={activeOther}
                  currentUserId={myId}
                  imgClassName="messagesChatHeader__avatar"
                />
                <div style={{ minWidth: 0 }}>
                  <div className="messagesChatHeader__nameRow">
                    <span className="messagesChatHeader__name">{activeOther?.name || "User"}</span>
                    <RoleBadge role={activeOther?.role} />
                    {isRequest ? (
                      <span className="requestBadge">
                        {isRequestedByMe ? "Pending" : "Message request"}
                      </span>
                    ) : null}
                    {isDeclined ? (
                      <span className="requestBadge requestBadge--declined">Declined</span>
                    ) : null}
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    @{activeOther?.username || "user"}
                  </div>
                </div>
              </div>
            </div>

            {/* Block / Unblock control. Hidden when the OTHER user has
                blocked us (and we haven't blocked them) — there's no useful
                action there since we can't unblock for them, and clicking
                Block would just compound the problem. Otherwise we show
                Unblock when we're the blocker, Block when neither side
                has blocked. */}
            {!isNewChat &&
            !isRequest &&
            !isDeclined &&
            !(activeConversation?.isBlockedByOther && !activeConversation?.isBlockedByMe) ? (
              <div className="messagesChatHeader__actions">
                <button
                  type="button"
                  className="outline-button btn-compact btnWithIcon"
                  onClick={() => setPendingDeleteChat(true)}
                  disabled={!activeConversation}
                  title="Delete chat"
                >
                  <Trash2 size={ICON_SIZE.sm} aria-hidden />
                  Delete
                </button>
                <button
                  type="button"
                  className={activeConversation?.isBlockedByMe ? "secondary-button btn-compact btnWithIcon" : "outline-button btn-compact btnWithIcon"}
                  onClick={onBlockToggle}
                  disabled={!activeConversation}
                  title={activeConversation?.isBlockedByMe ? "Unblock" : "Block"}
                >
                  {activeConversation?.isBlockedByMe ? <Unlock size={ICON_SIZE.sm} aria-hidden /> : <Ban size={ICON_SIZE.sm} aria-hidden />}
                  {activeConversation?.isBlockedByMe ? "Unblock" : "Block"}
                </button>
                <button
                  type="button"
                  className="secondary-button btn-compact"
                  onClick={() => setReportUserOpen(true)}
                  disabled={!activeOther?._id || !activeConversation?._id}
                  title="Report user"
                >
                  Report
                </button>
              </div>
            ) : null}
          </div>

          {chatLoading ? <div className="muted" style={{ marginTop: 10 }}>Loading chat…</div> : null}
          {chatError ? <div className="alert alertError" style={{ marginTop: 10 }}>{chatError}</div> : null}
          {isNewChat && pendingTargetLoading ? (
            <div className="muted" style={{ marginTop: 10 }}>Loading…</div>
          ) : null}
          {isNewChat && pendingTargetError ? (
            <div className="alert alertError" style={{ marginTop: 10 }}>{pendingTargetError}</div>
          ) : null}

          {isRequestedToMe ? (
            <div className="requestNotice">
              <div className="requestNotice__text">
                <strong>{activeOther?.name || "This person"}</strong> sent you a message request. Accept to start chatting,
                or decline to dismiss it.
              </div>
              <div className="requestNotice__actions">
                <button
                  type="button"
                  className="primary-button btn-compact btnWithIcon"
                  onClick={() => onAcceptRequest()}
                  disabled={decisionBusy}
                >
                  <Check size={ICON_SIZE.sm} aria-hidden /> Accept
                </button>
                <button
                  type="button"
                  className="outline-button btn-compact btnWithIcon"
                  onClick={() => onDeclineRequest()}
                  disabled={decisionBusy}
                >
                  <X size={ICON_SIZE.sm} aria-hidden /> Decline
                </button>
              </div>
            </div>
          ) : null}

          {isRequestedByMe ? (
            <div className="requestNotice requestNotice--info">
              Message request sent. You can keep messaging, but they will only see this chat in their inbox after accepting.
            </div>
          ) : null}

          {isDeclined ? (
            <div className="requestNotice requestNotice--declined">
              <div className="requestNotice__text">
                {isRequestedToMe
                  ? "You declined this message request. You can accept it later to start chatting."
                  : "This message request was declined."}
              </div>
              {isRequestedToMe ? (
                <div className="requestNotice__actions">
                  <button
                    type="button"
                    className="primary-button btn-compact btnWithIcon"
                    onClick={() => onAcceptRequest()}
                    disabled={decisionBusy}
                    aria-label="Accept this previously declined request"
                  >
                    <Check size={ICON_SIZE.sm} aria-hidden /> Accept
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {blockedLabel && !isRequest && !isDeclined ? (
            <div className="alert" style={{ marginTop: 10 }}>
              {blockedLabel}
            </div>
          ) : null}

          <div
            className="messagesScroll messagesChatBody"
            ref={scrollRef}
            aria-label="Messages"
            onScroll={onScrollChat}
          >
            {isNewChat && (messages || []).length === 0 && !pendingTargetLoading && !pendingTargetError ? (
              <div className="emptyState emptyState--subtle" style={{ marginTop: 10 }}>
                Start a conversation with {pendingTargetUser?.name || "this user"}.
              </div>
            ) : null}

            {(messages || []).map((m, idx) => {
              const senderId = String(m?.sender?._id || m?.sender || "");
              const mine = senderId === myId;
              const bubbleClassNames = [
                "messageBubble",
                mine ? "messageBubble--mine" : "",
                m?.pending ? "messageBubble--pending" : "",
                m?.failed ? "messageBubble--failed" : "",
                m?.deletedForEveryone ? "messageBubble--deleted" : "",
              ].filter(Boolean).join(" ");
              const txt = String(m.text || "").trim();
              const media = Array.isArray(m.media) ? m.media : [];
              const shared = m.sharedPost;
              const status = mine ? getMessageStatus(m, idx) : null;
              const mediaOnly = !txt && !shared && media.length > 0;
              const canDeleteForEveryone = Boolean(mine && !m?.deletedForEveryone && !m?.pending && !m?.failed);

              const actionsWrap =
                !isNewChat && !m?.pending && !isTempId(m?._id) ? (
                  <div className="messageActionsWrap">
                    <button
                      type="button"
                      className="messageActionsTrigger"
                      aria-label="Message actions"
                      aria-expanded={Boolean(openMessageActionsId && String(openMessageActionsId) === String(m._id))}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenMessageActionsId((prev) =>
                          prev && String(prev) === String(m._id) ? null : m._id
                        );
                      }}
                    >
                      ⋯
                    </button>
                    {openMessageActionsId && String(openMessageActionsId) === String(m._id) ? (
                      <div className="messageActionsMenu" role="menu" aria-label="Message actions">
                        <button
                          type="button"
                          className="messageActionsMenu__btn"
                          role="menuitem"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setOpenMessageActionsId(null);
                            setPendingDeleteMessage({ messageId: m._id, mode: "me" });
                          }}
                        >
                          Delete for me
                        </button>
                        {canDeleteForEveryone ? (
                          <button
                            type="button"
                            className="messageActionsMenu__btn messageActionsMenu__btn--danger"
                            role="menuitem"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setOpenMessageActionsId(null);
                              setPendingDeleteMessage({ messageId: m._id, mode: "everyone" });
                            }}
                          >
                            Delete for everyone
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null;

              const bubble = (
                <div className={[bubbleClassNames, mediaOnly ? "messageBubble--mediaOnly" : ""].filter(Boolean).join(" ")}>
                  {!m?.deletedForEveryone ? (
                    <>
                      {txt ? <div className="messageText">{txt}</div> : null}

                      {shared ? (
                        <button
                          type="button"
                          className="sharedPostCard sharedPostCard--button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            openSharedPost(shared);
                          }}
                          aria-label={`Open shared post by ${shared?.author?.name || "user"}`}
                        >
                          <div className="sharedPostCard__label">Shared post</div>
                          <div className="sharedPostCard__meta">
                            <strong style={{ color: "var(--text-h)" }}>{shared?.author?.name || "User"}</strong>{" "}
                            <span className="muted">@{shared?.author?.username || "user"}</span>
                            <span style={{ marginLeft: 8 }}>
                              <RoleBadge role={shared?.author?.role} />
                            </span>
                          </div>
                          {shared?.image ? (
                            <div className="sharedPostCard__imageWrap">
                              <img src={uploadUrl(shared.image)} alt="Shared post attachment" />
                            </div>
                          ) : null}
                          {shared?.content ? (
                            <div className="sharedPostCard__content">
                              {String(shared.content).length > 220
                                ? `${String(shared.content).slice(0, 220)}…`
                                : shared.content}
                            </div>
                          ) : (
                            <div className="muted" style={{ fontSize: 13 }}>No caption</div>
                          )}
                        </button>
                      ) : m?.sharedPostUnavailable ? (
                        <div className="sharedPostCard sharedPostCard--unavailable">
                          <div className="sharedPostCard__label">Shared post</div>
                          <div className="muted" style={{ fontSize: 13 }}>
                            This shared post is no longer available.
                          </div>
                        </div>
                      ) : null}

                      {media.length ? (
                        <div className="messageMediaGrid">
                          {media.map((mm, mIdx) => {
                            const url = mm._localPreview ? mm.url : uploadUrl(mm.url);
                            if (mm.type === "video") {
                              return (
                                <video key={`${url}-${mIdx}`} className="messageMedia" src={url} controls />
                              );
                            }
                            return <img key={`${url}-${mIdx}`} className="messageMedia" src={url} alt="" />;
                          })}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="messageDeletedText">This message was deleted.</div>
                  )}
                </div>
              );

              return (
                <div
                  key={m._id || idx}
                  className={mine ? "messageRow messageRow--mine" : "messageRow messageRow--other"}
                >
                  <div className="messageRow__inner">
                    <div className="messageRow__cluster">
                      {mine ? (
                        <>
                          {actionsWrap}
                          {bubble}
                        </>
                      ) : (
                        <>
                          {bubble}
                          {actionsWrap}
                        </>
                      )}
                    </div>

                    {status ? (
                      <div className={`messageStatus messageStatus--${status.tone}`} aria-live="polite">
                        {status.label}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <form className="messagesComposer" onSubmit={onSend}>
            {composerError ? <div className="alert alertError" style={{ marginBottom: 10 }}>{composerError}</div> : null}

            {files.length ? (
              <div className="composerAttachments" aria-label="Selected attachments">
                {files.map((f, idx) => {
                  const url = URL.createObjectURL(f);
                  const isVideo = String(f.type || "").startsWith("video/");
                  return (
                    <div className="composerAttachment" key={`${f.name}-${idx}`}>
                      {isVideo ? (
                        <video className="composerAttachment__preview" src={url} controls />
                      ) : (
                        <img className="composerAttachment__preview" src={url} alt="" />
                      )}
                      <button
                        type="button"
                        className="composerAttachment__remove"
                        onClick={() => removeFile(idx)}
                        aria-label="Remove attachment"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div className="messagesComposerRow">
              <textarea
                className="messagesComposerInput"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={composerPlaceholder}
                rows={2}
                maxLength={2000}
                disabled={
                  sending ||
                  composerDisabled ||
                  (!conversationId && !isNewChat) ||
                  (isNewChat && (pendingTargetLoading || Boolean(pendingTargetError)))
                }
              />

              <div className="messagesComposerActions">
                <label className="icon-button messagesComposerAttach" title="Attach image or video">
                  <Paperclip size={ICON_SIZE.md} aria-hidden />
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                    onChange={onPickFiles}
                    disabled={
                      sending ||
                      composerDisabled ||
                      (!conversationId && !isNewChat) ||
                      (isNewChat && (pendingTargetLoading || Boolean(pendingTargetError))) ||
                      files.length >= 5
                    }
                    style={{ display: "none" }}
                  />
                </label>

                <button
                  type="submit"
                  className="primary-button btn-compact btnWithIcon"
                  disabled={
                    !canSend ||
                    (!conversationId && !isNewChat) ||
                    (isNewChat && (pendingTargetLoading || Boolean(pendingTargetError)))
                  }
                  aria-busy={sending ? "true" : "false"}
                >
                  <SendHorizontal size={ICON_SIZE.sm} aria-hidden />
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </section>
  );

  const showList = !isMobile || (!conversationId && !isNewChat);
  const showChat = !isMobile || Boolean(conversationId) || isNewChat;

  return (
    <div className="page messagesPage">
      <AppHeader
        activePage="messages"
        currentUser={me}
        notifications={me ? <NotificationsDropdown /> : null}
      />

      <div className="messagesLayout">
        {showList ? <div className="messagesCol">{listPane}</div> : null}
        {showChat ? <div className="messagesCol messagesCol--chat">{chatPane}</div> : null}
      </div>

      {selectedSharedPost ? (
        <PostDetailsModal
          post={selectedSharedPost}
          currentUser={me}
          onClose={handleCloseSharedPost}
          onPostUpdated={handleSharedPostUpdated}
        />
      ) : null}

      {sharedPostUnavailable ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Shared post unavailable">
          <div className="modalCard" style={{ maxWidth: 420, textAlign: "left" }}>
            <div className="topbar" style={{ marginBottom: 12 }}>
              <h2 style={{ marginBottom: 0 }}>Shared post</h2>
              <button
                className="secondary-button btn-compact"
                type="button"
                onClick={() => setSharedPostUnavailable(false)}
              >
                Close
              </button>
            </div>
            <div className="muted">This shared post is no longer available.</div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDeleteMessage)}
        title="Delete message"
        message={
          pendingDeleteMessage?.mode === "everyone"
            ? "Delete this message for everyone?"
            : "Delete this message for you?"
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={() => {
          setPendingDeleteMessage(null);
          setOpenMessageActionsId(null);
        }}
        onConfirm={async () => {
          const payload = pendingDeleteMessage;
          if (!payload?.messageId) return;
          const mode = payload.mode === "everyone" ? "everyone" : "me";
          setPendingDeleteMessage(null);
          setMessageDeleteBusy(true);
          setComposerError("");
          setChatError("");
          try {
            const res = await deleteMessage(payload.messageId, mode);
            const serverMsg = res?.data?.message || null;
            setMessages((prev) => {
              const list = Array.isArray(prev) ? prev : [];
              if (mode === "me") return list.filter((x) => String(x?._id) !== String(payload.messageId));
              // everyone: replace with placeholder
              return list.map((x) => (String(x?._id) === String(payload.messageId) ? { ...x, ...(serverMsg || {}), deletedForEveryone: true } : x));
            });
            // refresh list ordering/preview if last message changed
            refreshConversations();
            refreshRequests();
            notifyUnreadRefresh();
          } catch (err) {
            setChatError(err?.response?.data?.message || err?.message || "Failed to delete message");
          } finally {
            setMessageDeleteBusy(false);
            setOpenMessageActionsId(null);
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteChat)}
        title="Delete chat"
        message="Delete this chat from your inbox?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={() => setPendingDeleteChat(false)}
        onConfirm={async () => {
          if (!conversationId) return;
          setPendingDeleteChat(false);
          setChatError("");
          try {
            await deleteConversation(conversationId);
            setConversations((prev) => (prev || []).filter((c) => String(c?._id) !== String(conversationId)));
            setMessages([]);
            setActiveConversation(null);
            navigate("/messages");
            notifyUnreadRefresh();
          } catch (err) {
            setChatError(err?.response?.data?.message || err?.message || "Failed to delete chat");
          }
        }}
      />

      <ReportModal
        isOpen={reportUserOpen}
        targetType="user"
        targetLabel={activeOther?.username ? `@${activeOther.username}` : "User"}
        reportedUserId={activeOther?._id}
        conversationId={activeConversation?._id}
        onClose={() => setReportUserOpen(false)}
        onSuccess={() => {
          window.alert("Report submitted.");
        }}
      />
    </div>
  );
}
