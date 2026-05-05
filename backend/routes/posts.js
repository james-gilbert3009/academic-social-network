import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";

import Post from "../models/Post.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

const ALLOWED_POST_CATEGORIES = new Set([
  "question",
  "research",
  "announcement",
  "study",
  "event",
  "general",
]);

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

function isImageFile(file) {
  const allowedMime = ["image/jpeg", "image/png", "image/webp"];
  return allowedMime.includes(file.mimetype);
}

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (isImageFile(file)) return cb(null, true);
    return cb(new Error("Only image uploads are allowed (jpg, jpeg, png, webp)"));
  },
});

function uploadSinglePostImage(req, res, next) {
  upload.single("image")(req, res, (err) => {
    if (!err) return next();

    // Multer file size error
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "Image too large (max 5MB)" });
    }

    // fileFilter errors or other upload errors
    return res.status(400).json({ message: err.message || "Invalid image upload" });
  });
}

/** Returns a Mongoose Query (thenable). Must NOT be async — async + return query makes await resolve to docs, breaking .exec(). */
function getPopulatedPostQuery() {
  return Post.find()
    .sort({ createdAt: -1 })
    .populate("author", "name username profileImage role")
    .populate("comments.user", "name username profileImage role");
}

// POST /api/posts
// Create a new post (multipart/form-data: content, optional image)
router.post("/", requireAuth, uploadSinglePostImage, async (req, res) => {
  try {
    const content = String(req.body?.content ?? "").trim();
    const hasImage = Boolean(req.file);
    if (!content && !hasImage) {
      return res.status(400).json({ message: "Add a caption or an image" });
    }

    const rawCategory = req.body?.category;
    const category =
      rawCategory === undefined || rawCategory === null || String(rawCategory).trim() === ""
        ? "general"
        : String(rawCategory).trim().toLowerCase();

    if (!ALLOWED_POST_CATEGORIES.has(category)) {
      return res.status(400).json({
        message:
          'Invalid category. Allowed: "question", "research", "announcement", "study", "event", "general".',
      });
    }

    const post = await Post.create({
      author: req.user.id,
      category,
      content,
      image: hasImage ? `/uploads/${req.file.filename}` : "",
    });

    // Notifications: when a user creates a post, notify their followers.
    try {
      const author = await User.findById(req.user.id).select("followers");
      const followerIds = (author?.followers || []).map((id) => String(id));
      const uniqueFollowerIds = Array.from(new Set(followerIds)).filter(
        (id) => id && id !== String(req.user.id)
      );

      if (uniqueFollowerIds.length) {
        await Notification.insertMany(
          uniqueFollowerIds.map((recipientId) => ({
            recipient: recipientId,
            sender: req.user.id,
            type: "post",
            post: post._id,
          }))
        );
      }
    } catch (notifErr) {
      // Intentionally ignore notification failures for thesis demo.
    }

    const populated = await Post.findById(post._id)
      .populate("author", "name username profileImage role")
      .populate("comments.user", "name username profileImage role");

    return res.status(201).json({ post: populated });
  } catch (error) {
    const message = error?.message || "Failed to create post";
    return res.status(500).json({ message });
  }
});

// GET /api/posts
// Get all posts (newest first)
router.get("/", requireAuth, async (req, res) => {
  try {
    const posts = await getPopulatedPostQuery().exec();
    return res.json({ posts });
  } catch (err) {
    console.error("GET /api/posts error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/posts/user/:userId
// Get posts by a specific user (newest first)
router.get("/user/:userId", requireAuth, async (req, res) => {
  try {
    const posts = await Post.find({ author: req.params.userId })
      .sort({ createdAt: -1 })
      .populate("author", "name username profileImage role")
      .populate("comments.user", "name username profileImage role");

    return res.json({ posts });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load user posts" });
  }
});

// PUT /api/posts/:id
// Edit post caption only (author only). Image is not changed or accepted here.
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (String(post.author) !== String(req.user.id)) {
      return res.status(403).json({ message: "Not allowed to edit this post" });
    }

    if (req.body?.content !== undefined) {
      post.content = String(req.body.content ?? "").trim();
    }

    const hasImage = Boolean(post.image && String(post.image).trim());
    if (!post.content && !hasImage) {
      return res.status(400).json({ message: "Caption cannot be empty for a post with no image" });
    }

    await post.save();

    const populated = await Post.findById(post._id)
      .populate("author", "name username profileImage role")
      .populate("comments.user", "name username profileImage role");

    return res.json({ post: populated });
  } catch (error) {
    const message = error?.message || "Failed to update post";
    return res.status(500).json({ message });
  }
});

// DELETE /api/posts/:id
// Delete a post (only author)
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (String(post.author) !== String(req.user.id)) {
      return res.status(403).json({ message: "Not allowed to delete this post" });
    }

    // Best-effort cleanup: delete post image file (only local /uploads).
    await deleteUploadsFileIfLocal(post.image);

    // Optional cleanup: delete notifications related to this post.
    try {
      await Notification.deleteMany({ post: post._id });
    } catch (notifErr) {
      // Best-effort cleanup: ignore notification deletion failures.
    }

    await post.deleteOne();
    return res.json({ message: "Post deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete post" });
  }
});

// PUT /api/posts/:id/like
// Like/unlike (toggle)
router.put("/:id/like", requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const userId = String(req.user.id);
    const alreadyLiked = post.likes.some((id) => String(id) === userId);

    if (alreadyLiked) {
      post.likes = post.likes.filter((id) => String(id) !== userId);
    } else {
      post.likes.push(req.user.id);
    }

    await post.save();

    // Notification cleanup on unlike (undo).
    if (alreadyLiked && String(post.author) !== userId) {
      try {
        await Notification.deleteMany({
          recipient: post.author,
          sender: req.user.id,
          type: "like",
          post: post._id,
        });
      } catch (notifErr) {
        // Intentionally ignore cleanup failures for thesis demo.
      }
    }

    // Notifications: only on like (not unlike), never notify yourself.
    if (!alreadyLiked && String(post.author) !== userId) {
      try {
        const existing = await Notification.findOne({
          recipient: post.author,
          sender: req.user.id,
          type: "like",
          post: post._id,
        }).select("_id");

        if (!existing) {
          await Notification.create({
            recipient: post.author,
            sender: req.user.id,
            type: "like",
            post: post._id,
          });
        }
      } catch (notifErr) {
        // Intentionally ignore notification failures for thesis demo.
      }
    }

    const populated = await Post.findById(post._id)
      .populate("author", "name username profileImage role")
      .populate("comments.user", "name username profileImage role");

    return res.json({ post: populated });
  } catch (error) {
    return res.status(500).json({ message: "Failed to toggle like" });
  }
});

// POST /api/posts/:id/comments
// Add comment
router.post("/:id/comments", requireAuth, async (req, res) => {
  try {
    const text = String(req.body?.text ?? "").trim();
    if (!text) return res.status(400).json({ message: "Comment text is required" });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    post.comments.push({ user: req.user.id, text });
    await post.save();

    // Notifications: on comment, notify post author, never notify yourself.
    if (String(post.author) !== String(req.user.id)) {
      try {
        await Notification.create({
          recipient: post.author,
          sender: req.user.id,
          type: "comment",
          post: post._id,
          commentText: text,
        });
      } catch (notifErr) {
        // Intentionally ignore notification failures for thesis demo.
      }
    }

    const populated = await Post.findById(post._id)
      .populate("author", "name username profileImage role")
      .populate("comments.user", "name username profileImage role");

    return res.status(201).json({ post: populated });
  } catch (error) {
    return res.status(500).json({ message: "Failed to add comment" });
  }
});

// DELETE /api/posts/:postId/comments/:commentId
// Allow comment owner OR post owner
router.delete("/:postId/comments/:commentId", requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const isPostOwner = String(post.author) === String(req.user.id);
    const rawCommentUser = comment.user;
    const commentUserId =
      rawCommentUser && typeof rawCommentUser === "object" && rawCommentUser._id
        ? rawCommentUser._id
        : rawCommentUser;
    const isCommentOwner = String(commentUserId) === String(req.user.id);

    if (!isPostOwner && !isCommentOwner) {
      return res.status(403).json({ message: "Not allowed to delete this comment" });
    }

    const commentTextToDelete = String(comment.text || "");
    comment.deleteOne();
    await post.save();

    // Notification cleanup on comment delete (undo).
    try {
      await Notification.deleteMany({
        recipient: post.author,
        sender: commentUserId,
        type: "comment",
        post: post._id,
        commentText: commentTextToDelete,
      });
    } catch (notifErr) {
      // Intentionally ignore cleanup failures for thesis demo.
    }

    const populated = await Post.findById(post._id)
      .populate("author", "name username profileImage role")
      .populate("comments.user", "name username profileImage role");

    return res.json({ post: populated });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete comment" });
  }
});

export default router;

