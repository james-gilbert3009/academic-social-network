import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["student", "lecturer", "professor", "admin"],
      default: "student",
    },
    birthdate: {
      type: Date,
      default: null,
    },
    // New canonical field for registration DOB (required for new users).
    // We keep `birthdate` for backward compatibility with existing data.
    dateOfBirth: {
      type: Date,
      required: true,
    },
    bio: {
      type: String,
      default: "",
    },
    faculty: {
      type: String,
      default: "",
    },
    program: {
      type: String,
      default: "",
    },
    skills: {
      type: [String],
      default: [],
    },
    interests: {
      type: [String],
      default: [],
    },
    profileImage: {
      type: String,
      default: "",
    },
    followers: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    following: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    // Global block list. When user A is in user B's `blockedUsers`, neither
    // of them can see the other's profile details, posts, or messages, and
    // they cannot follow each other. Blocking is one-directional in the
    // model but the access checks always look at BOTH users' lists, so the
    // result is symmetric (whoever blocks first wins). See
    // `backend/utils/blockHelpers.js` for the canonical helpers.
    blockedUsers: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    isProfileComplete: {
      type: Boolean,
      default: false,
    },
    resetToken: {
      type: String,
      default: null,
    },
    resetTokenExpiry: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);