import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";

import { requireAuth } from "../middleware/auth.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Post from "../models/Post.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { getBlockRelation } from "../utils/blockHelpers.js";

const router = express.Router();

const SAFE_USER_FIELDS = "name username role profileImage";

function ensureMessagesUploadDir() {
  const dir = path.join(process.cwd(), "uploads", "messages");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeUploadName(originalName) {
  const raw = String(originalName || "file");
  // keep simple: replace spaces; strip any path separators
  return raw.replace(/[\\/]/g, "-").replace(/\s+/g, "-");
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      cb(null, ensureMessagesUploadDir());
    } catch (e) {
      cb(e);
    }
  },
  filename(req, file, cb) {
    const safeName = safeUploadName(file.originalname);
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_VIDEO_MIMES = new Set(["video/mp4", "video/webm", "video/quicktime"]); // quicktime = mov

function mediaFileFilter(req, file, cb) {
  const mime = String(file.mimetype || "");
  if (ALLOWED_IMAGE_MIMES.has(mime) || ALLOWED_VIDEO_MIMES.has(mime)) return cb(null, true);
  return cb(new Error("Invalid media type. Allowed: jpeg, png, webp, mp4, webm, mov"));
}

const upload = multer({
  storage,
  fileFilter: mediaFileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB per file
    files: 5,
  },
});

function uploadMessageMedia(req, res, next) {
  upload.array("media", 5)(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "File too large (max 20MB per file)" });
      }
      if (err.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json({ message: "Too many files (max 5 per message)" });
      }
      return res.status(400).json({ message: err.message || "Upload failed" });
    }

    return res.status(400).json({ message: err.message || "Invalid media upload" });
  });
}

/**
 * Build the wire-format for a Conversation record, layering the legacy
 * conversation-scoped block (`Conversation.blockedBy`) on top of the new
 * global per-user block (`User.blockedUsers`). Either source flips the
 * conversation to "messaging blocked" so the chat UI shows the disabled
 * composer + banner, but only the legacy source distinguishes "I blocked
 * them inside this chat" vs "they blocked me inside this chat" — for a
 * global block we attribute it to the side whose `blockedUsers` contains
 * the other (caller passes `globalBlock` flags explicitly).
 */
function decorateConversation(conversation, meId, globalBlock) {
  const obj = typeof conversation?.toObject === "function" ? conversation.toObject() : conversation;
  const blockedBy = Array.isArray(obj?.blockedBy) ? obj.blockedBy : [];
  const me = String(meId || "");
  const participantIds = (obj?.participants || []).map((p) =>
    p && typeof p === "object" && p._id ? String(p._id) : String(p)
  );
  const otherId = participantIds.find((id) => id && id !== me) || "";

  const blockedByMeLegacy = blockedBy.some((id) => String(id) === me);
  const blockedByOtherLegacy = blockedBy.some((id) => String(id) === otherId);

  const isBlockedByMe = blockedByMeLegacy || Boolean(globalBlock?.isBlockedByMe);
  const isBlockedByOther = blockedByOtherLegacy || Boolean(globalBlock?.hasBlockedMe);
  const isMessagingBlocked = Boolean(isBlockedByMe || isBlockedByOther);

  const status = String(obj?.status || "active");
  const requestedById = obj?.requestedBy
    ? String(obj.requestedBy?._id || obj.requestedBy)
    : "";
  const requestedToId = obj?.requestedTo
    ? String(obj.requestedTo?._id || obj.requestedTo)
    : "";

  const isRequest = status === "requested";
  const isDeclined = status === "declined";
  // Declined conversations keep the requester/recipient roles so the recipient
  // can still re-accept them later. Active conversations don't carry these.
  const carriesRequestRoles = isRequest || isDeclined;
  const isRequestedByMe = carriesRequestRoles && requestedById === me;
  const isRequestedToMe = carriesRequestRoles && requestedToId === me;

  return {
    ...obj,
    isBlockedByMe,
    isBlockedByOther,
    isMessagingBlocked,
    isRequest,
    isDeclined,
    isRequestedByMe,
    isRequestedToMe,
  };
}

function ensureIsParticipant(conversation, meId) {
  const participantIds = (conversation?.participants || []).map((p) =>
    p && typeof p === "object" && p._id ? String(p._id) : String(p)
  );
  return participantIds.some((id) => String(id) === String(meId));
}

function getConversationDeletedAt(conversation, meId) {
  const me = String(meId || "");
  const entries = Array.isArray(conversation?.deletedFor) ? conversation.deletedFor : [];
  const match = entries.find((e) => String(e?.user?._id || e?.user || "") === me);
  const deletedAt = match?.deletedAt ? new Date(match.deletedAt) : null;
  return deletedAt && !Number.isNaN(deletedAt.getTime()) ? deletedAt : null;
}

/**
 * Build a per-conversation global-block flag map for `decorateConversation`.
 *
 * Loads `me.blockedUsers` plus the `blockedUsers` of every "other" user in
 * the supplied conversation list in two queries, then computes the
 * `{ isBlockedByMe, hasBlockedMe }` pair keyed by conversation id.
 *
 * Done in a single batch so listing conversations stays one round-trip on
 * the user collection regardless of how many other participants there are.
 */
async function buildGlobalBlockMap(conversations, meId) {
  const me = await User.findById(meId).select("blockedUsers").lean();
  const myBlocked = new Set((me?.blockedUsers || []).map((id) => String(id)));

  const otherIds = new Set();
  const otherIdByConvo = new Map();
  for (const c of conversations || []) {
    const participants = (c?.participants || []).map((p) =>
      p && typeof p === "object" && p._id ? String(p._id) : String(p)
    );
    const otherId = participants.find((id) => id && id !== String(meId));
    if (otherId) {
      otherIdByConvo.set(String(c._id), otherId);
      otherIds.add(otherId);
    }
  }

  const blockersById = new Map();
  if (otherIds.size) {
    const others = await User.find({ _id: { $in: Array.from(otherIds) } })
      .select("blockedUsers")
      .lean();
    for (const o of others) {
      const list = (o?.blockedUsers || []).map((id) => String(id));
      blockersById.set(String(o._id), new Set(list));
    }
  }

  const flagsByConvoId = new Map();
  for (const [convoId, otherId] of otherIdByConvo.entries()) {
    flagsByConvoId.set(convoId, {
      isBlockedByMe: myBlocked.has(otherId),
      hasBlockedMe: Boolean(blockersById.get(otherId)?.has(String(meId))),
    });
  }
  return flagsByConvoId;
}

async function isMutualFollow(userIdA, userIdB) {
  const [a, b] = await Promise.all([
    User.findById(userIdA).select("following").lean(),
    User.findById(userIdB).select("following").lean(),
  ]);
  if (!a || !b) return false;
  const aFollowsB = (a.following || []).some((id) => String(id) === String(userIdB));
  const bFollowsA = (b.following || []).some((id) => String(id) === String(userIdA));
  return Boolean(aFollowsB && bFollowsA);
}

async function ensureMessageRequestNotification({ conversationId, requestedBy, requestedTo }) {
  if (!conversationId || !requestedBy || !requestedTo) return;
  // Avoid creating duplicates: reuse an existing message_request notification
  // for the same sender / recipient / conversation if one already exists.
  const existing = await Notification.findOne({
    recipient: requestedTo,
    sender: requestedBy,
    type: "message_request",
    conversation: conversationId,
  });
  if (existing) {
    if (existing.isRead) {
      existing.isRead = false;
      await existing.save();
    }
    return;
  }
  await Notification.create({
    recipient: requestedTo,
    sender: requestedBy,
    type: "message_request",
    conversation: conversationId,
    isRead: false,
  });
}

/**
 * Remove every message_request notification tied to this conversation for the
 * given recipient. We delete (rather than mark read) so accept/decline
 * actually clear the entry from the bell — this matches the product spec:
 * "the message_request notification is removed when the request is declined".
 *
 * No-op if the request notifications were already removed (e.g. accepting
 * a previously-declined conversation whose notifications were cleared at
 * decline time).
 */
async function clearMessageRequestNotifications({ conversationId, recipientId }) {
  if (!conversationId || !recipientId) return;
  await Notification.deleteMany({
    recipient: recipientId,
    type: "message_request",
    conversation: conversationId,
  });
}

// GET /api/messages/conversations
// Returns:
// - active conversations involving the current user
// - requested conversations where the current user is the requester (shown as pending)
// Hides:
// - declined conversations
// - requested conversations where the current user is the recipient (those go to /requests)
router.get("/conversations", requireAuth, async (req, res) => {
  try {
    const meId = String(req.user.id || "");
    const meObjectId = new mongoose.Types.ObjectId(meId);

    const convos = await Conversation.find({
      participants: meId,
      // Hide empty / draft conversations (no first message ever sent). Since
      // the new flow only persists a Conversation alongside its first
      // Message, this also defensively shields any legacy empty docs from
      // showing up as ghost rows in the inbox.
      lastMessage: { $exists: true, $ne: null },
      $or: [
        { status: "active" },
        { status: { $exists: false } },
        { status: "requested", requestedBy: meObjectId },
      ],
    })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .populate("participants", SAFE_USER_FIELDS)
      .populate({
        path: "lastMessage",
        select: "text media sharedPost sender recipient readAt createdAt deletedForEveryone",
      })
      .lean();

    // Hide conversations deleted by the current user unless a newer message arrived.
    const visibleConvos = (convos || []).filter((c) => {
      const deletedAt = getConversationDeletedAt(c, meId);
      if (!deletedAt) return true;
      const lastAt = c?.lastMessageAt ? new Date(c.lastMessageAt) : null;
      if (!lastAt || Number.isNaN(lastAt.getTime())) return false;
      return lastAt > deletedAt;
    });

    const convoIds = visibleConvos.map((c) => c._id);
    const unreadCounts = await Message.aggregate([
      {
        $match: {
          conversation: { $in: convoIds },
          recipient: meObjectId,
          readAt: { $exists: false },
          deletedForEveryone: { $ne: true },
          deletedFor: { $ne: meObjectId },
        },
      },
      { $group: { _id: "$conversation", count: { $sum: 1 } } },
    ]);

    const unreadByConversationId = new Map(
      unreadCounts.map((row) => [String(row._id), Number(row.count || 0)])
    );

    const blockFlagsByConvo = await buildGlobalBlockMap(visibleConvos, meId);

    const conversations = visibleConvos.map((c) => {
      const decorated = decorateConversation(
        c,
        meId,
        blockFlagsByConvo.get(String(c._id))
      );
      return {
        ...decorated,
        unreadCount: unreadByConversationId.get(String(c._id)) || 0,
      };
    });

    return res.json({ conversations });
  } catch (err) {
    return res.status(500).json({ message: "Failed to load conversations" });
  }
});

// GET /api/messages/requests
// Returns message requests directed at the current user — both the pending
// ones they haven't acted on yet AND the ones they declined. Declined
// requests stay in the list so the recipient can still change their mind
// later and accept them.
router.get("/requests", requireAuth, async (req, res) => {
  try {
    const meId = String(req.user.id || "");
    const meObjectId = new mongoose.Types.ObjectId(meId);

    const convos = await Conversation.find({
      participants: meId,
      status: { $in: ["requested", "declined"] },
      requestedTo: meObjectId,
      // A request is only meaningful once a real message has been sent;
      // skip any drafts that somehow slipped through.
      lastMessage: { $exists: true, $ne: null },
    })
      .sort({ requestedAt: -1, lastMessageAt: -1, updatedAt: -1 })
      .populate("participants", SAFE_USER_FIELDS)
      .populate({
        path: "lastMessage",
        select: "text media sharedPost sender recipient readAt createdAt deletedForEveryone",
      })
      .lean();

    const blockFlagsByConvo = await buildGlobalBlockMap(convos, meId);
    const requests = convos.map((c) =>
      decorateConversation(c, meId, blockFlagsByConvo.get(String(c._id)))
    );
    return res.json({ requests });
  } catch (err) {
    return res.status(500).json({ message: "Failed to load message requests" });
  }
});

// GET /api/messages/unread-count
// Returns a single global tally of unread chats and unread messages for the
// current user. Used by the AppHeader to render the unread badge over the
// Messages icon without having to fetch and walk the full conversation list.
//
// Definitions:
// - unreadMessages: total Message documents where recipient = me, readAt is
//   null/missing, and the parent conversation is still visible (not declined).
// - unreadChats:    distinct conversations contributing to that count.
//
// Message requests where the current user is the recipient ARE included
// because the request always carries an unread message addressed to the
// recipient; "declined" conversations are excluded so resolved requests
// stop contributing.
router.get("/unread-count", requireAuth, async (req, res) => {
  try {
    const meId = String(req.user.id || "");
    const meObjectId = new mongoose.Types.ObjectId(meId);

    const visibleConvos = await Conversation.find({
      participants: meId,
      status: { $ne: "declined" },
    })
      .select("_id")
      .lean();

    if (!visibleConvos.length) {
      return res.json({ unreadChats: 0, unreadMessages: 0 });
    }

    const convoIds = visibleConvos.map((c) => c._id);

    const aggregation = await Message.aggregate([
      {
        $match: {
          conversation: { $in: convoIds },
          recipient: meObjectId,
          deletedForEveryone: { $ne: true },
          deletedFor: { $ne: meObjectId },
          $or: [{ readAt: { $exists: false } }, { readAt: null }],
        },
      },
      {
        $group: {
          _id: "$conversation",
          count: { $sum: 1 },
        },
      },
    ]);

    const unreadChats = aggregation.length;
    const unreadMessages = aggregation.reduce(
      (sum, row) => sum + (Number(row.count) || 0),
      0
    );

    return res.json({ unreadChats, unreadMessages });
  } catch (err) {
    return res.status(500).json({ message: "Failed to load unread count" });
  }
});

// GET /api/messages/blocked-users
// Returns the unique users the current user has blocked across all of their
// conversations, derived from each conversation's blockedBy array. Each row
// includes the original conversationId so the existing
// PUT /conversations/:id/unblock route can be reused as-is for an "Unblock"
// action from the Settings list — no new write endpoint required.
router.get("/blocked-users", requireAuth, async (req, res) => {
  try {
    const meId = String(req.user.id || "");

    const convos = await Conversation.find({
      participants: meId,
      blockedBy: meId,
    })
      .sort({ updatedAt: -1 })
      .populate("participants", SAFE_USER_FIELDS)
      .lean();

    const seen = new Map();
    for (const c of convos) {
      const other = (c.participants || []).find(
        (p) => p && String(p?._id || p) !== meId
      );
      if (!other?._id) continue;
      const otherId = String(other._id);
      // The same user could appear in multiple conversations (e.g. one
      // active + one declined-request thread); keep the most recently
      // updated one because that is the one the user most likely remembers.
      if (seen.has(otherId)) continue;
      seen.set(otherId, {
        _id: otherId,
        name: other.name || "",
        username: other.username || "",
        role: other.role || "",
        profileImage: other.profileImage || "",
        conversationId: String(c._id),
        blockedAt: c.updatedAt || null,
      });
    }

    return res.json({ blockedUsers: Array.from(seen.values()) });
  } catch (err) {
    return res.status(500).json({ message: "Failed to load blocked users" });
  }
});

// GET /api/messages/conversations/:conversationId
router.get("/conversations/:conversationId", requireAuth, async (req, res) => {
  try {
    const meId = String(req.user.id || "");
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId)
      .populate("participants", SAFE_USER_FIELDS)
      .lean();

    if (!conversation) return res.status(404).json({ message: "Conversation not found" });
    if (!ensureIsParticipant(conversation, meId)) {
      return res.status(403).json({ message: "Not allowed to view this conversation" });
    }

    // Pull messages first without populating sharedPost so we can detect when
    // the referenced post was deleted (populate would silently null it and we'd
    // lose the original ObjectId, hiding the "this post was deleted" state).
    const deletedAt = getConversationDeletedAt(conversation, meId);
    const baseFilter = {
      conversation: conversationId,
      deletedFor: { $ne: new mongoose.Types.ObjectId(meId) },
      ...(deletedAt ? { createdAt: { $gt: deletedAt } } : {}),
    };

    const messagesRaw = await Message.find(baseFilter)
      .sort({ createdAt: 1 })
      .populate("sender", SAFE_USER_FIELDS)
      .populate("recipient", SAFE_USER_FIELDS)
      .lean();

    const sharedPostIds = messagesRaw
      .map((m) => m?.sharedPost)
      .filter(Boolean)
      .map((id) => String(id));

    let postMap = new Map();
    if (sharedPostIds.length) {
      const posts = await Post.find({ _id: { $in: sharedPostIds } })
        .populate("author", SAFE_USER_FIELDS)
        .populate("comments.user", SAFE_USER_FIELDS)
        .lean();
      postMap = new Map(posts.map((p) => [String(p._id), p]));
    }

    const messages = messagesRaw.map((m) => {
      if (m?.deletedForEveryone) {
        return {
          _id: m._id,
          conversation: m.conversation,
          sender: m.sender,
          recipient: m.recipient,
          createdAt: m.createdAt,
          deletedForEveryone: true,
        };
      }
      if (!m?.sharedPost) return m;
      const post = postMap.get(String(m.sharedPost));
      if (!post) {
        return { ...m, sharedPost: null, sharedPostUnavailable: true };
      }
      return { ...m, sharedPost: post };
    });

    const participantIds = (conversation?.participants || []).map((p) =>
      p && typeof p === "object" && p._id ? String(p._id) : String(p)
    );
    const otherId = participantIds.find((id) => id && id !== meId) || "";
    const globalBlock = otherId ? await getBlockRelation(meId, otherId) : null;

    return res.json({
      conversation: decorateConversation(conversation, meId, globalBlock),
      messages,
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to load conversation" });
  }
});

// POST /api/messages/conversations
// "Open chat with this user" — pure lookup. Returns the existing conversation
// between the current user and the target user if one exists, or null if not.
//
// Crucially: this endpoint NEVER creates a Conversation document. A request
// (and its message_request notification) is only materialized when the user
// actually sends their first message via POST /users/:userId/message. This
// fixes the bug where merely clicking "Message" on a profile spawned a
// pending request on the recipient's side.
router.post("/conversations", requireAuth, async (req, res) => {
  try {
    const meId = String(req.user.id || "");
    const otherId = String(req.body?.userId || "").trim();

    if (!otherId) return res.status(400).json({ message: "Missing userId" });
    if (otherId === meId) return res.status(400).json({ message: "You cannot message yourself" });

    const existing = await Conversation.findOne({
      $and: [{ participants: { $all: [meId, otherId] } }, { participants: { $size: 2 } }],
    })
      .populate("participants", SAFE_USER_FIELDS)
      .populate({
        path: "lastMessage",
        select: "text media sharedPost sender recipient readAt createdAt",
      });

    if (existing) {
      const globalBlock = await getBlockRelation(meId, otherId);
      return res.json({
        conversation: decorateConversation(existing, meId, globalBlock),
        isNewConversation: false,
      });
    }

    // No existing conversation. Echo enough info for the frontend to render
    // a "new chat" composer header without persisting anything yet. We
    // still surface the global-block state so the composer can render a
    // disabled banner instead of silently letting the user type.
    const targetUser = await User.findById(otherId).select(SAFE_USER_FIELDS).lean();
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const globalBlock = await getBlockRelation(meId, otherId);
    return res.json({
      conversation: null,
      targetUser,
      isNewConversation: true,
      isBlocked: globalBlock.isBlocked,
      isBlockedByMe: globalBlock.isBlockedByMe,
      hasBlockedMe: globalBlock.hasBlockedMe,
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to open conversation" });
  }
});

// POST /api/messages/conversations/:conversationId
// Sends a message. Enforces the message-request rules:
// - declined: nobody can send
// - requested: only the requester (requestedBy) can send; recipient must accept first
// - active: both can send unless one party has blocked the other
router.post("/conversations/:conversationId", requireAuth, uploadMessageMedia, async (req, res) => {
  try {
    const meId = String(req.user.id || "");
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId).lean();
    if (!conversation) return res.status(404).json({ message: "Conversation not found" });
    if (!ensureIsParticipant(conversation, meId)) {
      return res.status(403).json({ message: "Not allowed to send in this conversation" });
    }

    const participantIds = (conversation.participants || []).map((id) => String(id));
    const otherId = participantIds.find((id) => id !== meId) || "";

    // Conversation-scoped block (legacy "Block in this chat" button).
    const isBlocked = (conversation.blockedBy || []).some(
      (id) => String(id) === meId || String(id) === otherId
    );
    if (isBlocked) {
      return res.status(403).json({ message: "Messaging is unavailable in this conversation" });
    }

    // Global block — wins over everything else and is the canonical state
    // since the new Profile/Settings block button writes here.
    if (otherId) {
      const { isBlocked: globalBlock } = await getBlockRelation(meId, otherId);
      if (globalBlock) {
        return res.status(403).json({
          message: "Messaging is unavailable because one of you blocked the other.",
        });
      }
    }

    const status = String(conversation.status || "active");
    const requestedById = conversation.requestedBy ? String(conversation.requestedBy) : "";

    if (status === "declined") {
      return res.status(403).json({ message: "This message request was declined" });
    }
    if (status === "requested" && requestedById && requestedById !== meId) {
      // Only the requester may send while the request is pending.
      return res.status(403).json({
        message: "You need to accept this request before replying",
      });
    }

    const text = String(req.body?.text ?? "").trim();
    const sharedPostIdRaw = req.body?.sharedPost;
    const sharedPostId = sharedPostIdRaw ? String(sharedPostIdRaw).trim() : "";

    const files = Array.isArray(req.files) ? req.files : [];
    const media = files.map((f) => {
      const mime = String(f.mimetype || "");
      const type = ALLOWED_IMAGE_MIMES.has(mime) ? "image" : "video";
      return {
        url: `/uploads/messages/${f.filename}`,
        type,
        originalName: String(f.originalname || "").trim(),
      };
    });

    let sharedPost = null;
    if (sharedPostId) {
      sharedPost = await Post.findById(sharedPostId).select("_id");
      if (!sharedPost) return res.status(400).json({ message: "Shared post not found" });
    }

    const hasAnyContent = Boolean(text) || media.length > 0 || Boolean(sharedPost);
    if (!hasAnyContent) {
      return res.status(400).json({ message: "Add text, media, or a shared post" });
    }

    // First-message-from-requester case for an existing empty active conversation
    // that has no request marker yet (legacy) — promote to "requested" if the two
    // users are not mutual followers and there are no messages yet.
    let effectiveStatus = status;
    let effectiveRequestedBy = requestedById;
    let effectiveRequestedTo = conversation.requestedTo ? String(conversation.requestedTo) : "";

    if (effectiveStatus !== "requested" && effectiveStatus !== "declined") {
      const messageCount = await Message.countDocuments({ conversation: conversationId });
      if (messageCount === 0) {
        const mutual = await isMutualFollow(meId, otherId);
        if (!mutual) {
          await Conversation.findByIdAndUpdate(conversationId, {
            $set: {
              status: "requested",
              requestedBy: meId,
              requestedTo: otherId,
              requestedAt: new Date(),
            },
          });
          effectiveStatus = "requested";
          effectiveRequestedBy = meId;
          effectiveRequestedTo = otherId;
        }
      }
    }

    const message = await Message.create({
      conversation: conversationId,
      sender: meId,
      recipient: otherId,
      text,
      media,
      ...(sharedPost ? { sharedPost: sharedPost._id } : {}),
    });

    const now = new Date();
    await Conversation.findByIdAndUpdate(
      conversationId,
      { lastMessage: message._id, lastMessageAt: now },
      { new: false }
    );

    // If either participant previously deleted the chat, make it visible again.
    // (Visibility rules compare lastMessageAt to deletedAt.)

    if (effectiveStatus === "requested" && effectiveRequestedBy === meId && effectiveRequestedTo) {
      await ensureMessageRequestNotification({
        conversationId,
        requestedBy: meId,
        requestedTo: effectiveRequestedTo,
      });
    }

    const [populated, populatedConversation] = await Promise.all([
      Message.findById(message._id)
        .populate("sender", SAFE_USER_FIELDS)
        .populate("recipient", SAFE_USER_FIELDS)
        .populate({
          path: "sharedPost",
          populate: [
            { path: "author", select: SAFE_USER_FIELDS },
            { path: "comments.user", select: SAFE_USER_FIELDS },
          ],
        }),
      Conversation.findById(conversationId)
        .populate("participants", SAFE_USER_FIELDS)
        .populate({
          path: "lastMessage",
          select: "text media sharedPost sender recipient readAt createdAt",
        })
        .lean(),
    ]);

    const sendGlobalBlock = otherId ? await getBlockRelation(meId, otherId) : null;
    return res.status(201).json({
      message: populated,
      conversation: populatedConversation
        ? decorateConversation(populatedConversation, meId, sendGlobalBlock)
        : null,
    });
  } catch (err) {
    const msg = err?.message || "Failed to send message";
    return res.status(500).json({ message: msg });
  }
});

// POST /api/messages/users/:userId/message
// Atomic "send a first message to a user I may not have a conversation with
// yet" endpoint. This is the ONLY codepath that creates a Conversation +
// (optional) message_request Notification for a brand-new chat — keeping it
// here means a request never materializes from merely opening a profile or
// the share modal: the user has to actually press Send.
//
// Behavior:
// - Validates the payload (text || media || sharedPost) before any writes.
// - Finds an existing conversation between meId and userId if any.
// - If none exists, creates one with status determined by mutual-follow:
//   mutual followers => "active", non-mutual => "requested" (with meId as
//   requestedBy / userId as requestedTo).
// - Persists the Message, updates lastMessage / lastMessageAt.
// - Creates the message_request notification ONLY when the resulting
//   conversation is in "requested" state and meId is the requester.
// - Returns { conversation, message } — same shape as the existing send route.
router.post(
  "/users/:userId/message",
  requireAuth,
  uploadMessageMedia,
  async (req, res) => {
    try {
      const meId = String(req.user.id || "");
      const otherId = String(req.params?.userId || "").trim();

      if (!otherId) return res.status(400).json({ message: "Missing userId" });
      if (otherId === meId) {
        return res.status(400).json({ message: "You cannot message yourself" });
      }

      const targetUser = await User.findById(otherId).select("_id").lean();
      if (!targetUser) return res.status(404).json({ message: "User not found" });

      // Global block check: if either party has the other in their global
      // blockedUsers list, refuse the send before we touch any DB write.
      const { isBlocked: globalBlock } = await getBlockRelation(meId, otherId);
      if (globalBlock) {
        return res.status(403).json({
          message: "Messaging is unavailable because one of you blocked the other.",
        });
      }

      const text = String(req.body?.text ?? "").trim();
      const sharedPostIdRaw = req.body?.sharedPost;
      const sharedPostId = sharedPostIdRaw ? String(sharedPostIdRaw).trim() : "";

      const files = Array.isArray(req.files) ? req.files : [];
      const media = files.map((f) => {
        const mime = String(f.mimetype || "");
        const type = ALLOWED_IMAGE_MIMES.has(mime) ? "image" : "video";
        return {
          url: `/uploads/messages/${f.filename}`,
          type,
          originalName: String(f.originalname || "").trim(),
        };
      });

      let sharedPost = null;
      if (sharedPostId) {
        sharedPost = await Post.findById(sharedPostId).select("_id");
        if (!sharedPost) return res.status(400).json({ message: "Shared post not found" });
      }

      const hasAnyContent = Boolean(text) || media.length > 0 || Boolean(sharedPost);
      if (!hasAnyContent) {
        return res.status(400).json({ message: "Message cannot be empty." });
      }

      // Look up an existing conversation between the two users. We may or
      // may not have one — if not, we create it here on first send.
      let conversation = await Conversation.findOne({
        $and: [
          { participants: { $all: [meId, otherId] } },
          { participants: { $size: 2 } },
        ],
      });

      if (conversation) {
        // Honor block + declined rules just like the regular send route.
        const isBlocked = (conversation.blockedBy || []).some(
          (id) => String(id) === meId || String(id) === otherId
        );
        if (isBlocked) {
          return res
            .status(403)
            .json({ message: "Messaging is unavailable in this conversation" });
        }
        const status = String(conversation.status || "active");
        const requestedById = conversation.requestedBy
          ? String(conversation.requestedBy)
          : "";
        if (status === "declined") {
          return res
            .status(403)
            .json({ message: "This message request was declined" });
        }
        if (status === "requested" && requestedById && requestedById !== meId) {
          return res.status(403).json({
            message: "You need to accept this request before replying",
          });
        }
      } else {
        // Create the conversation now, on first send. Status is determined
        // by mutual-follow at this exact moment.
        const mutual = await isMutualFollow(meId, otherId);
        conversation = await Conversation.create(
          mutual
            ? {
                participants: [meId, otherId],
                lastMessageAt: null,
                blockedBy: [],
                status: "active",
              }
            : {
                participants: [meId, otherId],
                lastMessageAt: null,
                blockedBy: [],
                status: "requested",
                requestedBy: meId,
                requestedTo: otherId,
                requestedAt: new Date(),
              }
        );
      }

      const message = await Message.create({
        conversation: conversation._id,
        sender: meId,
        recipient: otherId,
        text,
        media,
        ...(sharedPost ? { sharedPost: sharedPost._id } : {}),
      });

      const now = new Date();
      await Conversation.findByIdAndUpdate(
        conversation._id,
        { lastMessage: message._id, lastMessageAt: now },
        { new: false }
      );

      // Materialize the message_request notification ONLY at this moment —
      // never when merely opening the chat.
      const finalStatus = String(conversation.status || "active");
      if (finalStatus === "requested") {
        const requestedById = conversation.requestedBy
          ? String(conversation.requestedBy)
          : "";
        const requestedToId = conversation.requestedTo
          ? String(conversation.requestedTo)
          : "";
        if (requestedById === meId && requestedToId) {
          await ensureMessageRequestNotification({
            conversationId: conversation._id,
            requestedBy: meId,
            requestedTo: requestedToId,
          });
        }
      }

      const [populatedMessage, populatedConversation] = await Promise.all([
        Message.findById(message._id)
          .populate("sender", SAFE_USER_FIELDS)
          .populate("recipient", SAFE_USER_FIELDS)
          .populate({
            path: "sharedPost",
            populate: [
              { path: "author", select: SAFE_USER_FIELDS },
              { path: "comments.user", select: SAFE_USER_FIELDS },
            ],
          }),
        Conversation.findById(conversation._id)
          .populate("participants", SAFE_USER_FIELDS)
          .populate({
            path: "lastMessage",
            select: "text media sharedPost sender recipient readAt createdAt",
          })
          .lean(),
      ]);

      const sendGlobalBlock = otherId ? await getBlockRelation(meId, otherId) : null;
      return res.status(201).json({
        message: populatedMessage,
        conversation: populatedConversation
          ? decorateConversation(populatedConversation, meId, sendGlobalBlock)
          : null,
      });
    } catch (err) {
      const msg = err?.message || "Failed to send message";
      return res.status(500).json({ message: msg });
    }
  }
);

// PUT /api/messages/conversations/:conversationId/accept
// Only the requested-to user may accept. Works on both pending ("requested")
// and previously-rejected ("declined") conversations — the latter lets the
// recipient change their mind without the sender having to re-send a request.
// Promotes status to "active" and removes any lingering message_request
// notifications for this conversation.
router.put("/conversations/:conversationId/accept", requireAuth, async (req, res) => {
  try {
    const meId = String(req.user.id || "");
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ message: "Conversation not found" });
    if (!ensureIsParticipant(conversation, meId)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    if (conversation.status !== "requested" && conversation.status !== "declined") {
      return res.status(400).json({ message: "This conversation is not a request" });
    }
    if (String(conversation.requestedTo || "") !== meId) {
      return res.status(403).json({ message: "Only the recipient can accept this request" });
    }

    conversation.status = "active";
    conversation.acceptedAt = new Date();
    await conversation.save();

    await clearMessageRequestNotifications({ conversationId, recipientId: meId });

    const populated = await Conversation.findById(conversationId)
      .populate("participants", SAFE_USER_FIELDS)
      .populate({ path: "lastMessage", select: "text media sharedPost sender recipient readAt createdAt" })
      .lean();

    return res.json({ conversation: decorateConversation(populated, meId) });
  } catch (err) {
    return res.status(500).json({ message: "Failed to accept message request" });
  }
});

// PUT /api/messages/conversations/:conversationId/decline
// Only the requested-to user may decline a pending request. Sets status to
// "declined" but KEEPS the conversation + its messages so the recipient can
// re-accept it later from the Requests tab. Removes the matching
// message_request notification from the bell entirely (the spec asks for
// removal, not just mark-as-read).
router.put("/conversations/:conversationId/decline", requireAuth, async (req, res) => {
  try {
    const meId = String(req.user.id || "");
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ message: "Conversation not found" });
    if (!ensureIsParticipant(conversation, meId)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    if (conversation.status !== "requested") {
      return res.status(400).json({ message: "This conversation is not a pending request" });
    }
    if (String(conversation.requestedTo || "") !== meId) {
      return res.status(403).json({ message: "Only the recipient can decline this request" });
    }

    conversation.status = "declined";
    await conversation.save();

    await clearMessageRequestNotifications({ conversationId, recipientId: meId });

    const populated = await Conversation.findById(conversationId)
      .populate("participants", SAFE_USER_FIELDS)
      .populate({ path: "lastMessage", select: "text media sharedPost sender recipient readAt createdAt" })
      .lean();

    return res.json({
      ok: true,
      conversation: populated ? decorateConversation(populated, meId) : null,
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to decline message request" });
  }
});

// PUT /api/messages/conversations/:conversationId/read
router.put("/conversations/:conversationId/read", requireAuth, async (req, res) => {
  try {
    const meId = String(req.user.id || "");
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId).lean();
    if (!conversation) return res.status(404).json({ message: "Conversation not found" });
    if (!ensureIsParticipant(conversation, meId)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const now = new Date();
    const result = await Message.updateMany(
      {
        conversation: conversationId,
        recipient: meId,
        $or: [{ readAt: { $exists: false } }, { readAt: null }],
      },
      { $set: { readAt: now } }
    );

    return res.json({
      updatedCount: result.modifiedCount || 0,
      readAt: now,
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to mark as read" });
  }
});

// PUT /api/messages/conversations/:conversationId/block
router.put("/conversations/:conversationId/block", requireAuth, async (req, res) => {
  try {
    const meId = String(req.user.id || "");
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ message: "Conversation not found" });
    if (!ensureIsParticipant(conversation, meId)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const updated = await Conversation.findByIdAndUpdate(
      conversationId,
      { $addToSet: { blockedBy: meId } },
      { new: true }
    )
      .populate("participants", SAFE_USER_FIELDS)
      .populate({ path: "lastMessage", select: "text media sharedPost sender recipient readAt createdAt" })
      .lean();

    return res.json({ conversation: decorateConversation(updated, meId) });
  } catch (err) {
    return res.status(500).json({ message: "Failed to block user" });
  }
});

// PUT /api/messages/conversations/:conversationId/unblock
router.put("/conversations/:conversationId/unblock", requireAuth, async (req, res) => {
  try {
    const meId = String(req.user.id || "");
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ message: "Conversation not found" });
    if (!ensureIsParticipant(conversation, meId)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const updated = await Conversation.findByIdAndUpdate(
      conversationId,
      { $pull: { blockedBy: meId } },
      { new: true }
    )
      .populate("participants", SAFE_USER_FIELDS)
      .populate({ path: "lastMessage", select: "text media sharedPost sender recipient readAt createdAt" })
      .lean();

    return res.json({ conversation: decorateConversation(updated, meId) });
  } catch (err) {
    return res.status(500).json({ message: "Failed to unblock user" });
  }
});

// DELETE /api/messages/:messageId
// Soft-delete a message for me or for everyone.
// Query/body: { mode: "me" | "everyone" }
router.delete("/:messageId", requireAuth, async (req, res) => {
  try {
    const meId = String(req.user.id || "");
    const meObjectId = new mongoose.Types.ObjectId(meId);
    const messageId = String(req.params?.messageId || "");
    const modeRaw = req.body?.mode ?? req.query?.mode;
    const mode = String(modeRaw || "me").toLowerCase() === "everyone" ? "everyone" : "me";

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: "Invalid message id" });
    }

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: "Message not found" });

    const conversation = await Conversation.findById(message.conversation).lean();
    if (!conversation) return res.status(404).json({ message: "Conversation not found" });
    if (!ensureIsParticipant(conversation, meId)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    if (mode === "everyone") {
      if (String(message.sender) !== meId) {
        return res.status(403).json({ message: "Only the sender can delete for everyone" });
      }
      message.deletedForEveryone = true;
      message.text = "";
      message.media = [];
      message.sharedPost = null;
      await message.save();

      return res.json({
        ok: true,
        message: {
          _id: message._id,
          conversation: message.conversation,
          sender: message.sender,
          recipient: message.recipient,
          createdAt: message.createdAt,
          deletedForEveryone: true,
        },
      });
    }

    // mode === "me"
    message.deletedFor = Array.isArray(message.deletedFor) ? message.deletedFor : [];
    const already = message.deletedFor.some((id) => String(id) === meId);
    if (!already) {
      message.deletedFor.push(meObjectId);
      await message.save();
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: "Failed to delete message" });
  }
});

// DELETE /api/messages/conversations/:conversationId
// Hide a conversation from the current user's inbox (does not affect the other participant).
router.delete("/conversations/:conversationId", requireAuth, async (req, res) => {
  try {
    const meId = String(req.user.id || "");
    const { conversationId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ message: "Conversation not found" });
    if (!ensureIsParticipant(conversation, meId)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const now = new Date();
    const list = Array.isArray(conversation.deletedFor) ? conversation.deletedFor : [];
    const idx = list.findIndex((e) => String(e?.user) === meId);
    if (idx >= 0) {
      list[idx].deletedAt = now;
    } else {
      list.push({ user: meId, deletedAt: now });
    }
    conversation.deletedFor = list;
    await conversation.save();

    return res.json({ ok: true, deletedAt: now });
  } catch (err) {
    return res.status(500).json({ message: "Failed to delete conversation" });
  }
});

export default router;
