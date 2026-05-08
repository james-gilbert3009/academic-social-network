import { api } from "../api";

export function getConversations() {
  return api.get("/api/messages/conversations");
}

export function getMessageRequests() {
  return api.get("/api/messages/requests");
}

export function getUnreadMessageCount() {
  return api.get("/api/messages/unread-count");
}

export function getBlockedUsers() {
  return api.get("/api/messages/blocked-users");
}

export function getConversation(conversationId) {
  return api.get(`/api/messages/conversations/${conversationId}`);
}

/**
 * Lookup-only "open chat with this user" call. The backend NEVER creates a
 * Conversation document here — it just returns the existing one if any, or
 * a `{ conversation: null, targetUser, isNewConversation: true }` payload
 * the frontend can use to render the new-chat composer without persisting
 * anything yet. A request is materialized lazily, only on first send via
 * sendFirstMessageToUser.
 */
export function openConversationTarget(userId) {
  return api.post("/api/messages/conversations", { userId });
}

// Backwards-compatible alias. The function used to actually create the
// conversation; the new behavior is lookup-only. Existing call sites can
// still use this name and will get the new payload shape.
export const startConversation = openConversationTarget;

export function sendMessage(conversationId, formData) {
  return api.post(`/api/messages/conversations/${conversationId}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

/**
 * Atomic "send a first message to a user I may not have a conversation with
 * yet". Hits the dedicated POST /users/:userId/message endpoint which
 * creates the Conversation, persists the Message, and (only when needed)
 * fires the message_request notification — all in a single round-trip,
 * none of which happens if the user never actually presses Send.
 *
 * Returns the same { conversation, message } shape as sendMessage so
 * callers can treat the response uniformly.
 */
export function sendFirstMessageToUser(userId, formData) {
  return api.post(`/api/messages/users/${userId}/message`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export function markConversationRead(conversationId) {
  return api.put(`/api/messages/conversations/${conversationId}/read`);
}

export function blockConversation(conversationId) {
  return api.put(`/api/messages/conversations/${conversationId}/block`);
}

export function unblockConversation(conversationId) {
  return api.put(`/api/messages/conversations/${conversationId}/unblock`);
}

export function acceptMessageRequest(conversationId) {
  return api.put(`/api/messages/conversations/${conversationId}/accept`);
}

export function declineMessageRequest(conversationId) {
  return api.put(`/api/messages/conversations/${conversationId}/decline`);
}
