import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
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
      enum: ["student", "professor", "admin"],
      default: "student",
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
    isProfileComplete: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);