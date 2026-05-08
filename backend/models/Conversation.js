import mongoose from "mongoose";

const { Schema } = mongoose;

const conversationSchema = new Schema(
  {
    participants: {
      type: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
      validate: [
        {
          validator(value) {
            return Array.isArray(value) && value.length === 2;
          },
          message: "A conversation must have exactly 2 participants",
        },
        {
          validator(value) {
            if (!Array.isArray(value) || value.length !== 2) return false;
            return String(value[0]) !== String(value[1]);
          },
          message: "Conversation participants must be two different users",
        },
      ],
    },
    lastMessage: { type: Schema.Types.ObjectId, ref: "Message" },
    lastMessageAt: { type: Date },
    blockedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],

    // Message request lifecycle.
    // - "active": normal inbox conversation, both participants can chat freely.
    // - "requested": pending message request. Recipient must accept before replying.
    // - "declined": request was rejected. Hidden from both inboxes.
    status: {
      type: String,
      enum: ["active", "requested", "declined"],
      default: "active",
    },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    requestedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
    requestedAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },

    // Per-user inbox deletion/hide. Deleting a chat only hides it for the
    // deleting user. If a newer message arrives after deletedAt, the chat
    // becomes visible again.
    deletedFor: {
      type: [
        {
          user: { type: Schema.Types.ObjectId, ref: "User", required: true },
          deletedAt: { type: Date, required: true },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ status: 1, requestedTo: 1 });

export default mongoose.model("Conversation", conversationSchema);
