import mongoose from "mongoose";

const { Schema } = mongoose;

const mediaSchema = new Schema(
  {
    url: { type: String, trim: true, required: true },
    type: { type: String, enum: ["image", "video"], required: true },
    originalName: { type: String, trim: true },
  },
  { _id: false }
);

const messageSchema = new Schema(
  {
    conversation: { type: Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    recipient: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, trim: true, maxlength: 2000 },
    media: { type: [mediaSchema], default: [] },
    sharedPost: { type: Schema.Types.ObjectId, ref: "Post" },
    readAt: { type: Date },
  },
  { timestamps: true }
);

messageSchema.pre("validate", function ensureMessageHasContent(next) {
  const text = String(this.text || "").trim();
  const hasText = Boolean(text);
  const hasMedia = Array.isArray(this.media) && this.media.length > 0;
  const hasSharedPost = Boolean(this.sharedPost);

  if (!hasText && !hasMedia && !hasSharedPost) {
    this.invalidate("text", "Message must include text, media, or a shared post");
  }

  // Keep text trimmed even when empty string is passed.
  this.text = text;
  next();
});

export default mongoose.model("Message", messageSchema);

