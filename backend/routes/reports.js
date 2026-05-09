import express from "express";

import Post from "../models/Post.js";
import User from "../models/User.js";
import Report from "../models/Report.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.post("/", requireAuth, async (req, res) => {
  try {
    const targetType = String(req.body?.targetType || "").trim().toLowerCase();
    const postId = req.body?.postId ? String(req.body.postId) : "";
    const commentId = req.body?.commentId ? String(req.body.commentId) : "";
    const reportedUserId = req.body?.reportedUserId ? String(req.body.reportedUserId) : "";
    const conversationId = req.body?.conversationId ? String(req.body.conversationId) : "";
    const reason = String(req.body?.reason || "").trim().toLowerCase();
    const details = String(req.body?.details || "").trim();

    if (!["post", "comment", "user"].includes(targetType)) {
      return res.status(400).json({ message: 'Invalid targetType. Allowed: "post", "comment", "user".' });
    }

    const allowedReasons = new Set([
      "spam",
      "harassment",
      "inappropriate_content",
      "misinformation",
      "fake_profile",
      "other",
    ]);
    if (!allowedReasons.has(reason)) {
      return res.status(400).json({
        message:
          'Invalid reason. Allowed: "spam", "harassment", "inappropriate_content", "misinformation", "fake_profile", "other".',
      });
    }

    if (targetType === "post") {
      if (!postId) return res.status(400).json({ message: "Missing post id" });
      const post = await Post.findById(postId).select("_id");
      if (!post) return res.status(404).json({ message: "Post not found" });
    }

    if (targetType === "comment") {
      if (!postId) return res.status(400).json({ message: "Missing post id" });
      if (!commentId) return res.status(400).json({ message: "Missing commentId" });
      const post = await Post.findById(postId).select("_id comments._id");
      if (!post) return res.status(404).json({ message: "Post not found" });
      const commentExists = (post.comments || []).some((c) => String(c?._id) === commentId);
      if (!commentExists) return res.status(404).json({ message: "Comment not found" });
    }

    if (targetType === "user") {
      if (!reportedUserId) return res.status(400).json({ message: "Missing reportedUser id" });
      if (reportedUserId === String(req.user.id)) {
        return res.status(400).json({ message: "You cannot report yourself" });
      }
      const u = await User.findById(reportedUserId).select("_id");
      if (!u) return res.status(404).json({ message: "User not found" });
    }

    // Prevent duplicate open report for same target
    const dedupeFilter =
      targetType === "post"
        ? { reporter: req.user.id, targetType, post: postId, status: "open" }
        : targetType === "comment"
          ? {
              reporter: req.user.id,
              targetType,
              post: postId,
              commentId,
              status: "open",
            }
          : {
              reporter: req.user.id,
              targetType,
              reportedUser: reportedUserId,
              conversation: conversationId || null,
              status: "open",
            };

    const existing = await Report.findOne(dedupeFilter).select("_id");
    if (existing) {
      return res.status(409).json({ message: "You already reported this." });
    }

    const report = await Report.create({
      reporter: req.user.id,
      targetType,
      reportedUser: reportedUserId || null,
      post: postId || null,
      commentId: commentId || null,
      conversation: conversationId || null,
      reason,
      details,
      status: "open",
    });

    return res.status(201).json({ message: "Report submitted", report });
  } catch (error) {
    return res.status(500).json({ message: "Failed to submit report" });
  }
});

export default router;

