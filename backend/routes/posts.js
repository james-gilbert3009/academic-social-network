import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";

import Post from "../models/Post.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { requireAuth } from "../middleware/auth.js";
import {
  getBlockedAndBlockerIds,
  getBlockRelation,
} from "../utils/blockHelpers.js";

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

/**
 * Returns a Mongoose Query (thenable). Must NOT be async — async + return
 * query makes await resolve to docs, breaking .exec().
 *
 * Pass a list of author IDs to exclude (e.g. users in a block relation
 * with the caller). Empty/missing list → no exclusion.
 */
function getPopulatedPostQuery(excludeAuthorIds) {
  const filter =
    Array.isArray(excludeAuthorIds) && excludeAuthorIds.length
      ? { author: { $nin: excludeAuthorIds } }
      : {};
  return Post.find(filter)
    .sort({ createdAt: -1 })
    .populate("author", "name username profileImage role")
    .populate("likes", "name username profileImage role")
    .populate("comments.user", "name username profileImage role");
}

function getPopulatedPostByIdQuery(postId) {
  return Post.findById(postId)
    .populate("author", "name username profileImage role")
    .populate("likes", "name username profileImage role")
    .populate("comments.user", "name username profileImage role");
}

function withAuthorRelationshipFlags(posts, me) {
  const followingSet = new Set((me?.following || []).map((id) => String(id)));
  const followersSet = new Set((me?.followers || []).map((id) => String(id)));

  return (posts || []).map((post) => {
    const obj = typeof post?.toObject === "function" ? post.toObject() : post;
    const author = obj?.author;
    const authorId = author && typeof author === "object" && author._id ? String(author._id) : "";
    if (!authorId) return obj;

    const isFollowing = followingSet.has(authorId);
    const isFollower = followersSet.has(authorId);
    const isFriend = Boolean(isFollowing && isFollower);

    return {
      ...obj,
      author: {
        ...author,
        isFollowing,
        isFollower,
        isFriend,
      },
    };
  });
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

    const populated = await getPopulatedPostByIdQuery(post._id);

    return res.status(201).json({ post: populated });
  } catch (error) {
    const message = error?.message || "Failed to create post";
    return res.status(500).json({ message });
  }
});

// GET /api/posts
// Get all posts (newest first). Excludes posts authored by anyone the
// caller has blocked OR who has blocked the caller — both directions are
// hidden so the block feels mutual in the feed.
router.get("/", requireAuth, async (req, res) => {
  try {
    const blockedIds = await getBlockedAndBlockerIds(req.user.id);
    const [posts, me] = await Promise.all([
      getPopulatedPostQuery(blockedIds).exec(),
      User.findById(req.user.id).select("followers following").lean(),
    ]);

    const enriched = withAuthorRelationshipFlags(posts, me);
    return res.json({ posts: enriched });
  } catch (err) {
    console.error("GET /api/posts error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/posts/user/:userId
// Get posts by a specific user (newest first). When the caller is in a
// block relation with the target we return [] (instead of 403) so the
// profile page can still render its restricted card without a network
// error popup — the empty list is consistent with the restricted profile.
router.get("/user/:userId", requireAuth, async (req, res) => {
  try {
    const targetUserId = String(req.params.userId || "");
    const currentUserId = String(req.user.id || "");

    if (targetUserId && targetUserId !== currentUserId) {
      const { isBlocked } = await getBlockRelation(currentUserId, targetUserId);
      if (isBlocked) return res.json({ posts: [] });
    }

    const [posts, me] = await Promise.all([
      Post.find({ author: req.params.userId })
        .sort({ createdAt: -1 })
        .populate("author", "name username profileImage role")
        .populate("likes", "name username profileImage role")
        .populate("comments.user", "name username profileImage role"),
      User.findById(req.user.id).select("followers following").lean(),
    ]);

    const enriched = withAuthorRelationshipFlags(posts, me);
    return res.json({ posts: enriched });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load user posts" });
  }
});

// GET /api/posts/:id
// Single post (used e.g. when opening a shared post inside Messages so the
// modal can show fresh likes/comments without redirecting to /feed). 403s
// if the post's author is in a block relation with the caller.
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const [post, me] = await Promise.all([
      getPopulatedPostByIdQuery(req.params.id),
      User.findById(req.user.id).select("followers following").lean(),
    ]);

    if (!post) return res.status(404).json({ message: "Post not found" });

    const authorId = post?.author?._id ? String(post.author._id) : "";
    const currentUserId = String(req.user.id || "");
    if (authorId && authorId !== currentUserId) {
      const { isBlocked } = await getBlockRelation(currentUserId, authorId);
      if (isBlocked) {
        return res.status(403).json({ message: "Post unavailable" });
      }
    }

    const [enriched] = withAuthorRelationshipFlags([post], me);
    return res.json({ post: enriched });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load post" });
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

    const populated = await getPopulatedPostByIdQuery(post._id);

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

    const populated = await getPopulatedPostByIdQuery(post._id);

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

    const populated = await getPopulatedPostByIdQuery(post._id);

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

    const populated = await getPopulatedPostByIdQuery(post._id);

    return res.json({ post: populated });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete comment" });
  }
});

// PUT /api/posts/:postId/comments/:commentId/like
// Like/unlike a specific comment
router.put("/:postId/comments/:commentId/like", requireAuth, async (req, res) => {
  try {
    const postId = String(req.params.postId || "");
    const commentId = String(req.params.commentId || "");
    const currentUserId = String(req.user.id || "");

    const [post, me] = await Promise.all([
      Post.findById(postId),
      User.findById(req.user.id).select("followers following").lean(),
    ]);

    if (!post) return res.status(404).json({ message: "Post not found" });

    const authorId = post?.author ? String(post.author) : "";
    if (authorId && authorId !== currentUserId) {
      const { isBlocked } = await getBlockRelation(currentUserId, authorId);
      if (isBlocked) return res.status(403).json({ message: "Post unavailable" });
    }

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const likesArr = Array.isArray(comment.likes) ? comment.likes : [];
    const alreadyLiked = likesArr.some((id) => String(id) === currentUserId);

    if (alreadyLiked) {
      comment.likes = likesArr.filter((id) => String(id) !== currentUserId);
    } else {
      comment.likes = [...likesArr, req.user.id];
    }

    await post.save();

    // Notifications: on comment-like (only when liking, not unliking),
    // notify the comment author, never notify yourself, and respect blocks.
    if (!alreadyLiked) {
      try {
        const rawCommentUser = comment.user;
        const commentUserId =
          rawCommentUser && typeof rawCommentUser === "object" && rawCommentUser._id
            ? String(rawCommentUser._id)
            : String(rawCommentUser || "");

        if (commentUserId && commentUserId !== currentUserId) {
          const { isBlocked } = await getBlockRelation(currentUserId, commentUserId);
          if (!isBlocked) {
            const existing = await Notification.findOne({
              recipient: commentUserId,
              sender: req.user.id,
              type: "comment_like",
              post: post._id,
            }).select("_id");

            if (!existing) {
              await Notification.create({
                recipient: commentUserId,
                sender: req.user.id,
                type: "comment_like",
                post: post._id,
              });
            }
          }
        }
      } catch (notifErr) {
        // Best-effort for thesis demo: never break the main request.
      }
    }

    const populated = await getPopulatedPostByIdQuery(post._id);
    const [enriched] = withAuthorRelationshipFlags([populated], me);
    return res.json({ post: enriched });
  } catch (error) {
    return res.status(500).json({ message: "Failed to toggle comment like" });
  }
});

export default router;

