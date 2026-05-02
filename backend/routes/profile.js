import express from "express";
import multer from "multer";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

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
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({ user });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load profile",
      error: error.message,
    });
  }
});

router.put("/me", requireAuth, upload.single("profileImage"), async (req, res) => {
  try {
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

    if (req.file) {
      updates.profileImage = `/uploads/${req.file.filename}`;
    }

    const removePhoto = req.body?.removeProfileImage;
    if (
      !req.file &&
      (removePhoto === true ||
        removePhoto === "true" ||
        removePhoto === "1")
    ) {
      updates.profileImage = "";
    }

    updates.isProfileComplete = true;

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