import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import User from "../models/User.js";
import Post from "../models/Post.js";
import Notification from "../models/Notification.js";
import Conversation from "../models/Conversation.js";
import { requireAuth } from "../middleware/auth.js";
import computeIsProfileComplete from "../utils/isProfileComplete.js";
import {
  getBlockedAndBlockerIds,
  getBlockRelation,
} from "../utils/blockHelpers.js";

const router = express.Router();

/** Best-effort delete for `/uploads/...` paths stored on disk next to process.cwd(). */
const deleteUploadedFile = async (fileUrl) => {
  try {
    if (!fileUrl || typeof fileUrl !== "string" || !fileUrl.startsWith("/uploads/")) return;

    const filename = path.basename(fileUrl);
    const filePath = path.join(process.cwd(), "uploads", filename);

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (error) {
    console.error("File delete error:", error?.message || error);
  }
};

const SAFE_USER_FIELDS = "name username profileImage role faculty program";

function escapeRegex(str) {
  return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeCommaList(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, "uploads");
  },
  filename(req, file, cb) {
    const safeExt = path.extname(file.originalname || "").toLowerCase();
    const base = `${req.user.id}-${Date.now()}`;
    cb(null, `${base}${safeExt}`);
  },
});

function fileFilter(req, file, cb) {
  if (!file.mimetype?.startsWith("image/")) {
    return cb(new Error("Only image uploads are allowed"));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Get current user (useful for checking profile completeness)
router.get("/me", requireAuth, async (req, res) => {
  try {
    let user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    const shouldBeComplete = computeIsProfileComplete(user.toObject());
    if (Boolean(user.isProfileComplete) !== shouldBeComplete) {
      user = await User.findByIdAndUpdate(
        req.user.id,
        { isProfileComplete: shouldBeComplete },
        { new: true, runValidators: true, select: "-password" }
      );
    }

    return res.json({ user });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load user", error: error.message });
  }
});

// DELETE /api/users/me — permanently delete the logged-in user's account only
router.delete("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select("profileImage");
    if (!user) return res.status(404).json({ message: "User not found" });

    await deleteUploadedFile(user.profileImage);

    const userPosts = await Post.find({ author: userId }).select("image").lean();
    const postIds = userPosts.map((p) => p._id);

    for (const p of userPosts) {
      await deleteUploadedFile(p.image);
    }

    await Notification.deleteMany({
      $or: [{ sender: userId }, { recipient: userId }],
    });

    if (postIds.length > 0) {
      try {
        await Notification.deleteMany({ post: { $in: postIds } });
      } catch (notifErr) {
        console.error(
          "Account deletion: failed to remove notifications for posts:",
          notifErr?.message || notifErr
        );
      }
    }

    await Post.deleteMany({ author: userId });

    await Post.updateMany({ "comments.user": userId }, { $pull: { comments: { user: userId } } });

    await Post.updateMany({ likes: userId }, { $pull: { likes: userId } });

    await User.updateMany({ followers: userId }, { $pull: { followers: userId } });
    await User.updateMany({ following: userId }, { $pull: { following: userId } });

    await User.findByIdAndDelete(userId);

    return res.json({ message: "Account deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/users/me error:", err);
    return res.status(500).json({
      message: "Failed to delete account",
      error: err.message,
    });
  }
});

// GET /api/users/search?q=keyword
// Search users by name or username (case-insensitive). Returns safe fields only.
// Excludes any user the current user has blocked OR who has blocked the
// current user — blocked users disappear entirely from search results both
// ways so the block feels mutual to the UI.
router.get("/search", requireAuth, async (req, res) => {
  try {
    const qRaw = String(req.query?.q || "").trim();
    if (!qRaw) return res.json({ users: [] });

    const q = escapeRegex(qRaw);
    const rx = new RegExp(q, "i");

    const roleRaw = String(req.query?.role || "").trim().toLowerCase();
    const role = roleRaw && roleRaw !== "all" ? roleRaw : "";

    const hiddenIds = await getBlockedAndBlockerIds(req.user.id);

    const query = {
      $or: [{ name: rx }, { username: rx }],
      ...(role ? { role } : {}),
      ...(hiddenIds.length ? { _id: { $nin: hiddenIds } } : {}),
    };

    const users = await User.find(query)
      .select("_id name username role profileImage faculty program")
      .limit(10)
      .sort({ name: 1 });

    return res.json({ users });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to search users", error: error.message });
  }
});

// GET /api/users/blocked
// Returns the list of users the current account has globally blocked. Used
// by the Settings → "Blocked users" panel and any "manage who I blocked"
// surface — these are users the current user CHOSE to block, not users who
// blocked them.
router.get("/blocked", requireAuth, async (req, res) => {
  try {
    const me = await User.findById(req.user.id).select("blockedUsers").lean();
    const ids = (me?.blockedUsers || []).map((id) => String(id));
    if (!ids.length) return res.json({ users: [] });

    const users = await User.find({ _id: { $in: ids } })
      .select("_id name username role profileImage")
      .sort({ name: 1 });

    return res.json({ users });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to load blocked users", error: error.message });
  }
});

// GET /api/users/:id/followers
// Return users who follow :id (hidden: anyone in a block relation with the
// caller, so blocked users never show up in the "Followers" list).
router.get("/:id/followers", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("followers");
    if (!user) return res.status(404).json({ message: "User not found" });

    const hiddenIds = await getBlockedAndBlockerIds(req.user.id);
    const filterQuery = {
      _id: { $in: user.followers || [] },
      ...(hiddenIds.length ? { _id: { $in: user.followers || [], $nin: hiddenIds } } : {}),
    };

    const populated = await User.find(filterQuery)
      .select(SAFE_USER_FIELDS)
      .sort({ name: 1 });

    return res.json({ users: populated });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load followers", error: error.message });
  }
});

// GET /api/users/:id/following
// Return users that :id follows (with the same block-aware filter).
router.get("/:id/following", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("following");
    if (!user) return res.status(404).json({ message: "User not found" });

    const hiddenIds = await getBlockedAndBlockerIds(req.user.id);
    const filterQuery = {
      _id: { $in: user.following || [] },
      ...(hiddenIds.length ? { _id: { $in: user.following || [], $nin: hiddenIds } } : {}),
    };

    const populated = await User.find(filterQuery)
      .select(SAFE_USER_FIELDS)
      .sort({ name: 1 });

    return res.json({ users: populated });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load following", error: error.message });
  }
});

// GET /api/users/:id/mutual
// Simple mutual following: intersection between logged-in user's following and :id's following.
router.get("/:id/mutual", requireAuth, async (req, res) => {
  try {
    const targetId = String(req.params.id || "");
    const currentUserId = String(req.user.id || "");
    if (!targetId) return res.status(400).json({ message: "Missing target user id" });
    if (targetId === currentUserId) return res.json({ users: [] });

    const [me, target] = await Promise.all([
      User.findById(currentUserId).select("following"),
      User.findById(targetId).select("following"),
    ]);

    if (!me) return res.status(404).json({ message: "Current user not found" });
    if (!target) return res.status(404).json({ message: "User not found" });

    const meFollowing = (me.following || []).map((id) => String(id));
    const targetFollowing = new Set((target.following || []).map((id) => String(id)));

    const mutualIds = meFollowing.filter((id) => targetFollowing.has(id));

    if (!mutualIds.length) return res.json({ users: [] });

    const users = await User.find({ _id: { $in: mutualIds } })
      .select(SAFE_USER_FIELDS)
      .sort({ name: 1 });

    return res.json({ users });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load mutual users", error: error.message });
  }
});

// GET /api/users/:id/connections
// If :id is the logged-in user -> Connections = mutual follow (followers ∩ following).
// If :id is another user -> Mutual Connections = shared following (me.following ∩ target.following).
router.get("/:id/connections", requireAuth, async (req, res) => {
  try {
    const targetId = String(req.params.id || "");
    const currentUserId = String(req.user.id || "");
    if (!targetId) return res.status(400).json({ message: "Missing target user id" });

    // Own profile: mutual follow
    if (targetId === currentUserId) {
      const me = await User.findById(currentUserId).select("followers following");
      if (!me) return res.status(404).json({ message: "Current user not found" });

      const followersSet = new Set((me.followers || []).map((id) => String(id)));
      const connectionIds = (me.following || [])
        .map((id) => String(id))
        .filter((id) => followersSet.has(id));

      if (!connectionIds.length) return res.json({ users: [] });

      const users = await User.find({ _id: { $in: connectionIds } })
        .select(SAFE_USER_FIELDS)
        .sort({ name: 1 });

      return res.json({ users });
    }

    // Other profile: shared following
    const [me, target] = await Promise.all([
      User.findById(currentUserId).select("following"),
      User.findById(targetId).select("following"),
    ]);

    if (!me) return res.status(404).json({ message: "Current user not found" });
    if (!target) return res.status(404).json({ message: "User not found" });

    const meFollowing = (me.following || []).map((id) => String(id));
    const targetFollowing = new Set((target.following || []).map((id) => String(id)));
    const sharedIds = meFollowing.filter((id) => targetFollowing.has(id));

    if (!sharedIds.length) return res.json({ users: [] });

    const users = await User.find({ _id: { $in: sharedIds } })
      .select(SAFE_USER_FIELDS)
      .sort({ name: 1 });

    return res.json({ users });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load connections", error: error.message });
  }
});

// Profile setup / update (multipart/form-data)
router.put("/me", requireAuth, upload.single("profileImage"), async (req, res) => {
  try {
    const existing = await User.findById(req.user.id).select("-password").lean();
    if (!existing) return res.status(404).json({ message: "User not found" });

    const updates = {};

    if (req.body.name !== undefined) updates.name = String(req.body.name || "");
    if (req.body.faculty !== undefined) updates.faculty = String(req.body.faculty || "");
    if (req.body.program !== undefined) updates.program = String(req.body.program || "");
    if (req.body.bio !== undefined) updates.bio = String(req.body.bio || "");

    if (req.body.skills !== undefined) updates.skills = normalizeCommaList(req.body.skills);
    if (req.body.interests !== undefined) updates.interests = normalizeCommaList(req.body.interests);

    if (req.file) {
      updates.profileImage = `/uploads/${req.file.filename}`;
    }

    const merged = { ...existing, ...updates };
    updates.isProfileComplete = computeIsProfileComplete(merged);

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
      select: "-password",
    });

    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ message: "Profile updated", user });
  } catch (error) {
    const msg = error?.message || "Failed to update profile";
    return res.status(500).json({ message: msg, error: msg });
  }
});

// PUT /api/users/:id/follow
// Toggle follow/unfollow another user.
router.put("/:id/follow", requireAuth, async (req, res) => {
  try {
    const targetId = String(req.params.id || "");
    const currentUserId = String(req.user.id || "");

    if (!targetId) return res.status(400).json({ message: "Missing target user id" });
    if (targetId === currentUserId) {
      return res.status(400).json({ message: "You cannot follow yourself" });
    }

    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId),
      User.findById(targetId),
    ]);

    if (!currentUser) return res.status(404).json({ message: "Current user not found" });
    if (!targetUser) return res.status(404).json({ message: "User not found" });

    // Reject follow attempts in either direction when a block is in place.
    // We compute it from the docs we already loaded so we don't pay an
    // extra round-trip on the hot path.
    const myBlocked = (currentUser.blockedUsers || []).map((id) => String(id));
    const theirBlocked = (targetUser.blockedUsers || []).map((id) => String(id));
    if (myBlocked.includes(targetId) || theirBlocked.includes(currentUserId)) {
      return res.status(403).json({ message: "You cannot connect with this user." });
    }

    const alreadyFollowing = (currentUser.following || []).some(
      (id) => String(id) === targetId
    );
    const wasFollower = (targetUser.following || []).some((id) => String(id) === currentUserId);

    if (alreadyFollowing) {
      currentUser.following = (currentUser.following || []).filter(
        (id) => String(id) !== targetId
      );
      targetUser.followers = (targetUser.followers || []).filter(
        (id) => String(id) !== currentUserId
      );
    } else {
      currentUser.following = [...(currentUser.following || []), targetUser._id];
      targetUser.followers = [...(targetUser.followers || []), currentUser._id];
    }

    await Promise.all([currentUser.save(), targetUser.save()]);

    const isFollowing = !alreadyFollowing;
    const isFollower = (targetUser.following || []).some((id) => String(id) === currentUserId);
    const isFriend = Boolean(isFollowing && isFollower);

    // Notification cleanup on unfollow (undo).
    if (!isFollowing) {
      try {
        await Notification.deleteMany({
          sender: currentUser._id,
          recipient: targetUser._id,
          type: { $in: ["follow", "follow_back", "friend"] },
        });

        // If they were friends before, also remove the counterpart friend notification.
        await Notification.deleteMany({
          sender: targetUser._id,
          recipient: currentUser._id,
          type: "friend",
        });
      } catch (notifErr) {
        // Intentionally ignore cleanup failures for thesis demo.
      }
    }

    // Notifications: only on follow (not unfollow), never notify yourself.
    if (isFollowing && targetId !== currentUserId) {
      try {
        if (!wasFollower) {
          await Notification.create({
            recipient: targetUser._id,
            sender: currentUser._id,
            type: "follow",
          });
        } else {
          // Follow-back happened and mutual following exists -> friend.
          await Notification.create({
            recipient: targetUser._id,
            sender: currentUser._id,
            type: "follow_back",
          });

          await Notification.insertMany([
            {
              recipient: targetUser._id,
              sender: currentUser._id,
              type: "friend",
            },
            {
              recipient: currentUser._id,
              sender: targetUser._id,
              type: "friend",
            },
          ]);
        }
      } catch (notifErr) {
        // Intentionally ignore notification failures for thesis demo.
      }
    }

    return res.json({
      message: isFollowing ? "Followed" : "Unfollowed",
      isFollowing,
      isFollower,
      isFriend,
      followersCount: (targetUser.followers || []).length,
      followingCount: (currentUser.following || []).length,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to toggle follow", error: error.message });
  }
});

// PUT /api/users/:id/block
// Globally block a user: hides their profile / posts / messages from the
// caller and vice-versa. We use this single endpoint as the canonical block
// action across the app — Profile "Block" and Messages "Block" both call it.
//
// Side-effects are intentional and best-effort:
//   1. Add target → currentUser.blockedUsers (idempotent).
//   2. Remove the follow relationship in BOTH directions so a stale follow
//      can't keep notifying the blocked user about the blocker's activity.
//   3. Mark every existing conversation between the two as blockedBy the
//      caller, so the chat UI's existing conversation-level block banner
//      keeps working without a second source of truth.
//   4. Delete every notification between the two users (any direction, any
//      type) so the bell doesn't keep echoing follow / friend / message
//      requests they were never going to act on anyway.
router.put("/:id/block", requireAuth, async (req, res) => {
  try {
    const targetId = String(req.params.id || "");
    const currentUserId = String(req.user.id || "");

    if (!targetId) return res.status(400).json({ message: "Missing target user id" });
    if (targetId === currentUserId) {
      return res.status(400).json({ message: "You cannot block yourself" });
    }

    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId),
      User.findById(targetId),
    ]);

    if (!currentUser) return res.status(404).json({ message: "Current user not found" });
    if (!targetUser) return res.status(404).json({ message: "User not found" });

    const alreadyBlocked = (currentUser.blockedUsers || []).some(
      (id) => String(id) === targetId
    );
    if (!alreadyBlocked) {
      currentUser.blockedUsers = [
        ...(currentUser.blockedUsers || []),
        targetUser._id,
      ];
    }

    // Clean up follow relationships both ways so neither sees each other's
    // future post-to-followers notifications either.
    currentUser.following = (currentUser.following || []).filter(
      (id) => String(id) !== targetId
    );
    currentUser.followers = (currentUser.followers || []).filter(
      (id) => String(id) !== targetId
    );
    targetUser.following = (targetUser.following || []).filter(
      (id) => String(id) !== currentUserId
    );
    targetUser.followers = (targetUser.followers || []).filter(
      (id) => String(id) !== currentUserId
    );

    await Promise.all([currentUser.save(), targetUser.save()]);

    // Block any existing conversation so the chat UI immediately reflects
    // the new state. Best-effort: never fail the request because of this.
    try {
      await Conversation.updateMany(
        {
          participants: { $all: [currentUserId, targetId] },
          blockedBy: { $ne: currentUser._id },
        },
        { $addToSet: { blockedBy: currentUser._id } }
      );
    } catch (_) {
      // Intentionally ignore — global block still wins on /send routes.
    }

    // Wipe notifications between the two users in both directions so the
    // bell doesn't keep showing stale activity from the blocked user.
    try {
      await Notification.deleteMany({
        $or: [
          { sender: currentUser._id, recipient: targetUser._id },
          { sender: targetUser._id, recipient: currentUser._id },
        ],
      });
    } catch (_) {
      // Best-effort cleanup.
    }

    return res.json({ blocked: true });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to block user", error: error.message });
  }
});

// PUT /api/users/:id/unblock
// Reverses a global block. Removes the target from the caller's blockedUsers
// array AND clears any conversation-level block the caller put in place via
// the old per-conversation flow. Doesn't restore follow relationships — the
// user has to re-follow if they want to.
router.put("/:id/unblock", requireAuth, async (req, res) => {
  try {
    const targetId = String(req.params.id || "");
    const currentUserId = String(req.user.id || "");

    if (!targetId) return res.status(400).json({ message: "Missing target user id" });
    if (targetId === currentUserId) {
      return res.status(400).json({ message: "You cannot unblock yourself" });
    }

    const currentUser = await User.findById(currentUserId);
    if (!currentUser) {
      return res.status(404).json({ message: "Current user not found" });
    }

    currentUser.blockedUsers = (currentUser.blockedUsers || []).filter(
      (id) => String(id) !== targetId
    );
    await currentUser.save();

    // Mirror the unblock onto every conversation between the two — the
    // caller is the only side that could have set their own conversation
    // block, so we only pull their id from `blockedBy`.
    try {
      await Conversation.updateMany(
        {
          participants: { $all: [currentUserId, targetId] },
          blockedBy: currentUser._id,
        },
        { $pull: { blockedBy: currentUser._id } }
      );
    } catch (_) {
      // Best-effort cleanup.
    }

    return res.json({ blocked: false });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to unblock user", error: error.message });
  }
});

export default router;

