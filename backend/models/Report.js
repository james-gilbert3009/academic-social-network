import mongoose from "mongoose";

const { Schema } = mongoose;

const reportSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    targetType: { type: String, enum: ["post", "comment", "user"], required: true, index: true },

    // Target references (vary by targetType)
    reportedUser: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    post: { type: Schema.Types.ObjectId, ref: "Post", default: null, index: true },
    commentId: { type: Schema.Types.ObjectId, default: null, index: true },
    conversation: { type: Schema.Types.ObjectId, ref: "Conversation", default: null, index: true },

    reason: {
      type: String,
      enum: ["spam", "harassment", "inappropriate_content", "misinformation", "fake_profile", "other"],
      required: true,
      index: true,
    },
    details: { type: String, trim: true, maxlength: 1000, default: "" },
    status: { type: String, enum: ["open", "reviewed", "dismissed"], default: "open", index: true },
  },
  { timestamps: true }
);

reportSchema.index({ createdAt: -1 });

// Prevent duplicate OPEN reports for the same target by the same reporter.
// Uses a partial index so reviewed/dismissed reports don't block future reports.
reportSchema.index(
  {
    reporter: 1,
    targetType: 1,
    reportedUser: 1,
    post: 1,
    commentId: 1,
    conversation: 1,
    status: 1,
  },
  { unique: true, partialFilterExpression: { status: "open" } }
);

export default mongoose.model("Report", reportSchema);

