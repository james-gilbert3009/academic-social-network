import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import fs from "fs";

import authRoutes from "./routes/auth.js";
import profileRoutes from "./routes/profile.js";
import userRoutes from "./routes/users.js";
import postsRoutes from "./routes/posts.js";
import notificationsRoutes from "./routes/notifications.js";

dotenv.config();

const app = express();
app.use(express.json());

// Ensure uploads folder exists (for multer)
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded images
app.use("/uploads", express.static("uploads"));

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow non-browser clients (Postman, curl) that send no Origin header.
      if (!origin) return cb(null, true);

      // Allow explicit origin via env (single value).
      if (process.env.CORS_ORIGIN && origin === process.env.CORS_ORIGIN) return cb(null, true);

      // Allow Vite dev servers on any localhost port (5173, 5174, etc.).
      if (/^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true);

      return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
  })
);

app.get("/", (req, res) => {
  res.send("API running");
});

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/users", userRoutes);
app.use("/api/posts", postsRoutes);
app.use("/api/notifications", notificationsRoutes);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));