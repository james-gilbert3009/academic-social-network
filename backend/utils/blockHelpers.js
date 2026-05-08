import User from "../models/User.js";

/**
 * Helpers for the global per-user block list (`User.blockedUsers`).
 *
 * Blocking is stored as a single one-directional ObjectId reference on the
 * blocker's document, but every access check looks at BOTH users' lists so
 * that the visibility / interaction guarantees are symmetric:
 *
 *   - if A blocked B  → neither can see the other's profile / posts / messages
 *   - if B blocked A  → same thing, just from the other side
 *
 * Use `getBlockRelation` once per request when you need the answer to both
 * questions; use `getBlockedAndBlockerIds` when you just need a set of
 * "users this current user shouldn't see / be seen by" for query filters.
 */

/**
 * Returns the IDs of every user that should be invisible to `meId`:
 * - users that `meId` has blocked
 * - users that have blocked `meId`
 *
 * Returned as an array of strings so callers can either feed it directly
 * into a Mongoose `$nin` filter or wrap it in a Set for fast lookup.
 */
export async function getBlockedAndBlockerIds(meId) {
  if (!meId) return [];

  const me = await User.findById(meId).select("blockedUsers").lean();
  const blockedByMe = (me?.blockedUsers || []).map((id) => String(id));

  const blockers = await User.find({ blockedUsers: meId }).select("_id").lean();
  const blockingMe = blockers.map((u) => String(u._id));

  // Deduplicate — the same user can appear in both lists if both sides
  // blocked each other independently, which we want to count once.
  return Array.from(new Set([...blockedByMe, ...blockingMe]));
}

/**
 * Decide whether `meId` and `otherId` are blocked relative to each other.
 *
 * Always reads both documents in a single round-trip and returns:
 *   {
 *     isBlockedByMe: true if meId.blockedUsers includes otherId
 *     hasBlockedMe:  true if otherId.blockedUsers includes meId
 *     isBlocked:     either of the above
 *   }
 *
 * Designed to be called once per profile / message / follow request and
 * the resulting booleans threaded through the rest of the handler.
 */
export async function getBlockRelation(meId, otherId) {
  if (!meId || !otherId || String(meId) === String(otherId)) {
    return { isBlockedByMe: false, hasBlockedMe: false, isBlocked: false };
  }

  const [me, other] = await Promise.all([
    User.findById(meId).select("blockedUsers").lean(),
    User.findById(otherId).select("blockedUsers").lean(),
  ]);

  const myBlocked = (me?.blockedUsers || []).map((id) => String(id));
  const theirBlocked = (other?.blockedUsers || []).map((id) => String(id));

  const isBlockedByMe = myBlocked.includes(String(otherId));
  const hasBlockedMe = theirBlocked.includes(String(meId));

  return {
    isBlockedByMe,
    hasBlockedMe,
    isBlocked: isBlockedByMe || hasBlockedMe,
  };
}
