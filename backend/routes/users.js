import express from "express";
import multer from "multer";
import path from "path";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { requireAuth } from "../middleware/auth.js";
import computeIsProfileComplete from "../utils/isProfileComplete.js";

const router = express.Router();

const SAFE_USER_FIELDS = "name username profileImage role faculty program";

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

// GET /api/users/:id/followers
// Return users who follow :id
router.get("/:id/followers", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("followers");
    if (!user) return res.status(404).json({ message: "User not found" });

    const populated = await User.find({ _id: { $in: user.followers || [] } })
      .select(SAFE_USER_FIELDS)
      .sort({ name: 1 });

    return res.json({ users: populated });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load followers", error: error.message });
  }
});

// GET /api/users/:id/following
// Return users that :id follows
router.get("/:id/following", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("following");
    if (!user) return res.status(404).json({ message: "User not found" });

    const populated = await User.find({ _id: { $in: user.following || [] } })
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

export default router;

