import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import computeIsProfileComplete from "../utils/isProfileComplete.js";

const router = express.Router();

async function deleteUploadsFileIfLocal(fileUrlOrPath) {
  try {
    if (typeof fileUrlOrPath !== "string") return;
    if (!fileUrlOrPath.startsWith("/uploads/")) return;

    const filename = path.basename(fileUrlOrPath);
    if (!filename) return;

    const fullPath = path.join(process.cwd(), "uploads", filename);
    if (!fs.existsSync(fullPath)) return;

    await fs.promises.unlink(fullPath);
  } catch (err) {
    // Best-effort cleanup: never crash request if file delete fails.
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, "-");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({ storage });

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return undefined;
}

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

    const safeUser = user.toObject();
    safeUser.followersCount = Array.isArray(safeUser.followers) ? safeUser.followers.length : 0;
    safeUser.followingCount = Array.isArray(safeUser.following) ? safeUser.following.length : 0;
    if (Array.isArray(safeUser.followers) && Array.isArray(safeUser.following)) {
      const followersSet = new Set(safeUser.followers.map((id) => String(id)));
      safeUser.friendsCount = safeUser.following.filter((id) => followersSet.has(String(id))).length;
    } else {
      safeUser.friendsCount = 0;
    }

    return res.json({ user: safeUser });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load profile",
      error: error.message,
    });
  }
});

// GET /api/profile/:userId
// Public-ish profile view for authenticated users (no password).
//
// When viewing another user the response is gated by the global block
// relation. If either side has blocked the other we strip the response
// down to a minimal identity card and add `isBlocked` / `isBlockedByMe` /
// `hasBlockedMe` flags so the frontend can render a "restricted" view
// without ever seeing bio, followers, etc.
router.get("/:userId", requireAuth, async (req, res) => {
  try {
    const viewingUserId = String(req.params.userId || "");
    const currentUserId = String(req.user.id || "");

    const [user, me] = await Promise.all([
      User.findById(viewingUserId).select("-password"),
      User.findById(currentUserId).select("followers following blockedUsers"),
    ]);

    if (!user) return res.status(404).json({ message: "User not found" });
    if (!me) return res.status(404).json({ message: "Current user not found" });

    const isOwnProfile = viewingUserId === currentUserId;

    // Own profile is never restricted, even if some weird state put your
    // own id in your own block list — restricting yourself would be a
    // dead-end UI.
    if (!isOwnProfile) {
      const myBlocked = (me.blockedUsers || []).map((id) => String(id));
      const theirBlocked = (user.blockedUsers || []).map((id) => String(id));
      const isBlockedByMe = myBlocked.includes(viewingUserId);
      const hasBlockedMe = theirBlocked.includes(currentUserId);

      if (isBlockedByMe || hasBlockedMe) {
        return res.json({
          user: {
            _id: user._id,
            name: user.name,
            username: user.username,
            role: user.role,
            profileImage: user.profileImage,
            isBlocked: true,
            isBlockedByMe,
            hasBlockedMe,
          },
        });
      }
    }

    const safeUser = user.toObject();
    // Never leak the block list of another user back to the client.
    delete safeUser.blockedUsers;
    safeUser.followersCount = Array.isArray(safeUser.followers) ? safeUser.followers.length : 0;
    safeUser.followingCount = Array.isArray(safeUser.following) ? safeUser.following.length : 0;

    const meFollowing = Array.isArray(me.following) ? me.following.map((id) => String(id)) : [];
    const meFollowers = Array.isArray(me.followers) ? me.followers.map((id) => String(id)) : [];

    safeUser.isFollowing = meFollowing.includes(viewingUserId);
    safeUser.isFollower = meFollowers.includes(viewingUserId);
    safeUser.isFriend = Boolean(safeUser.isFollowing && safeUser.isFollower);
    safeUser.isBlocked = false;
    safeUser.isBlockedByMe = false;
    safeUser.hasBlockedMe = false;

    if (Array.isArray(safeUser.followers) && Array.isArray(safeUser.following)) {
      const followersSet = new Set(safeUser.followers.map((id) => String(id)));
      safeUser.friendsCount = safeUser.following.filter((id) => followersSet.has(String(id))).length;
    } else {
      safeUser.friendsCount = 0;
    }

    return res.json({ user: safeUser });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load profile",
      error: error.message,
    });
  }
});

router.put("/me", requireAuth, upload.single("profileImage"), async (req, res) => {
  try {
    const existing = await User.findById(req.user.id).select("-password").lean();
    if (!existing) return res.status(404).json({ message: "User not found" });

    const updates = {};

    const allowed = ["name", "bio", "faculty", "program", "skills", "interests"];

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        updates[key] = req.body[key];
      }
    }

    if (updates.skills !== undefined) {
      updates.skills = normalizeStringArray(updates.skills) ?? [];
    }

    if (updates.interests !== undefined) {
      updates.interests = normalizeStringArray(updates.interests) ?? [];
    }

    if (updates.name !== undefined) updates.name = String(updates.name ?? "");
    if (updates.bio !== undefined) updates.bio = String(updates.bio ?? "");
    if (updates.faculty !== undefined) updates.faculty = String(updates.faculty ?? "");
    if (updates.program !== undefined) updates.program = String(updates.program ?? "");

    const removePhoto = req.body?.removeProfileImage;
    const shouldRemoveExistingPhoto =
      !req.file && (removePhoto === true || removePhoto === "true" || removePhoto === "1");

    // If user uploads a new profile image OR requests removal, delete old file (only local /uploads).
    if ((req.file || shouldRemoveExistingPhoto) && existing.profileImage) {
      await deleteUploadsFileIfLocal(existing.profileImage);
    }

    if (req.file) {
      updates.profileImage = `/uploads/${req.file.filename}`;
    }

    if (shouldRemoveExistingPhoto) {
      updates.profileImage = "";
    }

    const merged = { ...existing, ...updates };
    updates.isProfileComplete = computeIsProfileComplete(merged);

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
      select: "-password",
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({
      message: "Profile updated",
      user,
    });
  } catch (error) {
    console.error("PROFILE UPDATE ERROR:", error);

    return res.status(500).json({
      message: "Failed to update profile",
      error: error.message,
    });
  }
});

export default router;