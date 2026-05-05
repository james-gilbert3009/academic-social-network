import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = express.Router();

// Register
router.post("/register", async (req, res) => {
  try {
    const { name, username, email, password, role, birthdate } = req.body;

    if (!name || !username || !email || !password) {
      return res.status(400).json({ message: "Please provide name, username, email, and password" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const normalizedUsername = String(username).toLowerCase().trim();

    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const existingUsername = await User.findOne({ username: normalizedUsername });
    if (existingUsername) {
      return res.status(409).json({ message: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const allowedRoles = ["student", "lecturer", "professor"];
    const requestedRole = role ? String(role).toLowerCase().trim() : "";
    let registrationRole = "student";
    if (requestedRole) {
      if (!allowedRoles.includes(requestedRole)) {
        return res.status(400).json({
          message: "Invalid role. Choose student, lecturer, or professor.",
        });
      }
      registrationRole = requestedRole;
    }

    const user = await User.create({
      name,
      username: normalizedUsername,
      email: normalizedEmail,
      password: hashedPassword,
      role: registrationRole,
      birthdate: birthdate ? new Date(birthdate) : null,
    });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username || "",
        email: user.email,
        role: user.role,
        isProfileComplete: user.isProfileComplete,
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      if (error.keyPattern?.email) {
        return res.status(409).json({ message: "Email already exists" });
      }

      if (error.keyPattern?.username) {
        return res.status(409).json({ message: "Username already exists" });
      }
    }

    res.status(500).json({ message: "Registration failed", error: error.message });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ message: "Email/username and password are required" });
    }

    const normalizedIdentifier = String(identifier).toLowerCase().trim();

    const user = await User.findOne({
      $or: [
        { email: normalizedIdentifier },
        { username: normalizedIdentifier },
      ],
    });

    if (!user) {
      return res.status(404).json({ message: "No account found with this email or username" });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      return res.status(401).json({ message: "Incorrect password" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        isProfileComplete: user.isProfileComplete,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Login failed due to server error", error: error.message });
  }
});

// Forgot password
// Demo flow: we generate a random token, save it on the user with a 15 min
// expiry, and return it directly in the response. In a real app you would
// email the token instead of returning it.
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const resetToken = crypto.randomBytes(20).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    user.resetToken = resetToken;
    user.resetTokenExpiry = resetTokenExpiry;
    await user.save();

    res.json({
      message: "Reset token generated. Use it within 15 minutes.",
      resetToken,
      expiresAt: resetTokenExpiry,
    });
  } catch (error) {
    res.status(500).json({ message: "Could not generate reset token", error: error.message });
  }
});

// Reset password
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ message: "Token and new password are required" });
    }

    const user = await User.findOne({ resetToken: token });

    if (!user) {
      return res.status(400).json({ message: "Invalid reset token" });
    }

    if (!user.resetTokenExpiry || user.resetTokenExpiry.getTime() < Date.now()) {
      return res.status(400).json({ message: "Reset token has expired" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();

    res.json({ message: "Password updated successfully. You can now log in." });
  } catch (error) {
    res.status(500).json({ message: "Could not reset password", error: error.message });
  }
});

export default router;