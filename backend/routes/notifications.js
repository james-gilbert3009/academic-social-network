import express from "express";

import Notification from "../models/Notification.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// GET /api/notifications
// Return logged-in user's notifications (newest first)
router.get("/", requireAuth, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user.id })
      .sort({ createdAt: -1 })
      .populate("sender", "name username profileImage role")
      .populate("post", "content image")
      .lean();

    return res.json({ notifications });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load notifications" });
  }
});

// PUT /api/notifications/:id/read
// Mark a single notification as read (recipient only)
router.put("/:id/read", requireAuth, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ message: "Notification not found" });

    if (String(notification.recipient) !== String(req.user.id)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    if (!notification.isRead) {
      notification.isRead = true;
      await notification.save();
    }

    return res.json({ notification });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update notification" });
  }
});

// PUT /api/notifications/read-all
// Mark all logged-in user's notifications as read
router.put("/read-all", requireAuth, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, isRead: false },
      { $set: { isRead: true } }
    );
    return res.json({ message: "All notifications marked as read" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to mark all as read" });
  }
});

export default router;

