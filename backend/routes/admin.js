import express from "express";
import fs from "fs";
import path from "path";

import User from "../models/User.js";
import Post from "../models/Post.js";
import Notification from "../models/Notification.js";
import Message from "../models/Message.js";
import Report from "../models/Report.js";

const router = express.Router();

function clampInt(value, fallback, { min = 1, max = 100 } = {}) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function escapeRegex(str) {
  return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function deleteUploadsFileIfLocal(fileUrlOrPath) {
  try {
    if (typeof fileUrlOrPath !== "string") return;
    if (!fileUrlOrPath.startsWith("/uploads/")) return;

    const filename = path.basename(fileUrlOrPath);
    if (!filename) return;

    const fullPath = path.join(process.cwd(), "uploads", filename);
    if (!fs.existsSync(fullPath)) return;

    await fs.promises.unlink(fullPath);
  } catch (_) {
    // best-effort
  }
}

router.get("/stats", async (req, res) => {
  try {
    const [usersCount, postsCount, notificationsCount, messagesCount, reportsCount] =
      await Promise.all([
        User.countDocuments({}),
        Post.countDocuments({}),
        Notification.countDocuments({}),
        Message.countDocuments({}),
        Report.countDocuments({}),
      ]);

    const [commentsAgg, recentUsers, recentPosts] = await Promise.all([
      Post.aggregate([
        { $project: { c: { $size: { $ifNull: ["$comments", []] } } } },
        { $group: { _id: null, total: { $sum: "$c" } } },
      ]),
      User.find({})
        .select("_id name username email role profileImage isProfileComplete createdAt")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Post.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("author", "name username profileImage role")
        .lean(),
    ]);

    const commentsCount = Number(commentsAgg?.[0]?.total || 0);

    return res.json({
      usersCount,
      postsCount,
      commentsCount,
      notificationsCount,
      messagesCount,
      reportsCount,
      recentUsers,
      recentPosts,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load admin stats" });
  }
});

router.get("/users", async (req, res) => {
  try {
    const qRaw = String(req.query?.q || "").trim();
    const roleRaw = String(req.query?.role || "").trim().toLowerCase();
    const role = roleRaw && roleRaw !== "all" ? roleRaw : "";
    const page = clampInt(req.query?.page, 1, { min: 1, max: 100000 });
    const limit = clampInt(req.query?.limit, 20, { min: 1, max: 100 });
    const skip = (page - 1) * limit;

    const filter = {};
    if (qRaw) {
      const q = escapeRegex(qRaw);
      const rx = new RegExp(q, "i");
      filter.$or = [{ name: rx }, { username: rx }, { email: rx }];
    }
    if (role) filter.role = role;

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select("_id name username email role profileImage isProfileComplete createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    const hasMore = page * limit < total;

    return res.json({ users, page, limit, total, totalPages, hasMore });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load users" });
  }
});

router.put("/users/:id/role", async (req, res) => {
  try {
    const targetId = String(req.params.id || "");
    const role = String(req.body?.role || "").trim().toLowerCase();
    const allowed = new Set(["student", "lecturer", "professor", "admin"]);

    if (!targetId) return res.status(400).json({ message: "Missing user id" });
    if (!allowed.has(role)) {
      return res
        .status(400)
        .json({ message: 'Invalid role. Allowed: "student", "lecturer", "professor", "admin".' });
    }

    if (String(req.user.id) === targetId && role !== "admin") {
      return res.status(400).json({ message: "You cannot remove your own admin role" });
    }

    const user = await User.findByIdAndUpdate(
      targetId,
      { role },
      { new: true, runValidators: true, select: "_id name username email role profileImage isProfileComplete createdAt" }
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({ user });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update user role" });
  }
});

router.get("/posts", async (req, res) => {
  try {
    const page = clampInt(req.query?.page, 1, { min: 1, max: 100000 });
    const limit = clampInt(req.query?.limit, 20, { min: 1, max: 100 });
    const qRaw = String(req.query?.q || "").trim();
    const skip = (page - 1) * limit;

    const filter = {};
    if (qRaw) {
      const q = escapeRegex(qRaw);
      const rx = new RegExp(q, "i");
      filter.content = rx;
    }

    const [total, posts] = await Promise.all([
      Post.countDocuments(filter),
      Post.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("author", "name username profileImage role")
        .lean(),
    ]);

    const shaped = (posts || []).map((p) => ({
      _id: p._id,
      author: p.author,
      content: p.content || "",
      image: p.image || "",
      category: p.category || "general",
      likesCount: Array.isArray(p.likes) ? p.likes.length : 0,
      commentsCount: Array.isArray(p.comments) ? p.comments.length : 0,
      createdAt: p.createdAt,
    }));

    const totalPages = Math.max(1, Math.ceil(total / limit));
    const hasMore = page * limit < total;

    return res.json({ posts: shaped, page, limit, total, totalPages, hasMore });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load posts" });
  }
});

router.get("/posts/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("author", "name username profileImage role")
      .populate("likes", "name username profileImage role")
      .populate("comments.user", "name username profileImage role")
      .lean();

    if (!post) return res.status(404).json({ message: "Post not found" });
    return res.json({ post });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load post" });
  }
});

router.delete("/posts/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    await deleteUploadsFileIfLocal(post.image);

    try {
      await Notification.deleteMany({ post: post._id });
    } catch (_) {
      // best-effort
    }

    await post.deleteOne();
    return res.json({ message: "Post deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete post" });
  }
});

router.delete("/posts/:postId/comments/:commentId", async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const rawCommentUser = comment.user;
    const commentUserId =
      rawCommentUser && typeof rawCommentUser === "object" && rawCommentUser._id
        ? rawCommentUser._id
        : rawCommentUser;

    const commentTextToDelete = String(comment.text || "");
    comment.deleteOne();
    await post.save();

    try {
      await Notification.deleteMany({
        recipient: post.author,
        sender: commentUserId,
        type: "comment",
        post: post._id,
        commentText: commentTextToDelete,
      });
    } catch (_) {
      // best-effort
    }

    return res.json({ message: "Comment deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete comment" });
  }
});

router.get("/reports", async (req, res) => {
  try {
    const page = clampInt(req.query?.page, 1, { min: 1, max: 100000 });
    const limit = clampInt(req.query?.limit, 20, { min: 1, max: 100 });
    const statusRaw = String(req.query?.status || "").trim().toLowerCase();
    const status = statusRaw && statusRaw !== "all" ? statusRaw : "";
    const targetTypeRaw = String(req.query?.targetType || "").trim().toLowerCase();
    const targetType = targetTypeRaw && targetTypeRaw !== "all" ? targetTypeRaw : "";
    const skip = (page - 1) * limit;

    const filter = {};
    if (status) filter.status = status;
    if (targetType) filter.targetType = targetType;

    const [total, reports] = await Promise.all([
      Report.countDocuments(filter),
      Report.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("reporter", "name username profileImage role")
        .populate("reportedUser", "name username profileImage role")
        .populate({
          path: "post",
          select: "_id content image category createdAt likes comments author",
          populate: [
            { path: "author", select: "_id name username role profileImage" },
            { path: "likes", select: "_id name username role profileImage" },
            { path: "comments.user", select: "_id name username role profileImage" },
          ],
        })
        .populate("conversation", "participants status lastMessageAt")
        .lean(),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    const hasMore = page * limit < total;

    return res.json({ reports, page, limit, total, totalPages, hasMore });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load reports" });
  }
});

router.put("/reports/:id/status", async (req, res) => {
  try {
    const status = String(req.body?.status || "").trim().toLowerCase();
    const allowed = new Set(["open", "reviewed", "dismissed"]);
    if (!allowed.has(status)) {
      return res
        .status(400)
        .json({ message: 'Invalid status. Allowed: "open", "reviewed", "dismissed".' });
    }

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    )
      .populate("reporter", "name username profileImage role")
      .populate("reportedUser", "name username profileImage role")
      .populate("post", "content image category author createdAt")
      .populate("conversation", "participants status lastMessageAt");

    if (!report) return res.status(404).json({ message: "Report not found" });

    return res.json({ report });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update report status" });
  }
});

export default router;

