import express from "express";
import multer from "multer";
import path from "path";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

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
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ user });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load user", error: error.message });
  }
});

// Profile setup / update (multipart/form-data)
router.put("/me", requireAuth, upload.single("profileImage"), async (req, res) => {
  try {
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

    updates.isProfileComplete = true;

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

export default router;

