import type { AdminUser } from '../data/models/admin-user';

/**
 * A bare Appwrite user id (e.g. recordedBy, performedBy, deletedBy) means nothing to someone
 * looking at the screen — this resolves it to "Name (email)" via an id→AdminUser lookup built
 * from UserService.getUsersById(). Falls back to the raw id itself (not a blank) when the user
 * can't be found — e.g. the lookup hasn't finished loading yet, or the account no longer exists
 * — so the field never silently disappears, it's just less helpful than usual.
 */
export function formatUserDisplay(
  user: Pick<AdminUser, 'name' | 'email'> | undefined,
  fallbackId: string,
): string {
  return user ? `${user.name} (${user.email})` : fallbackId;
}
