import type { SidebarProfile } from '../data/models/user.model';

export type UserTier = 'super_admin' | 'admin' | 'super_organizer' | 'organizer' | 'operator';

/** UX DESIGN.md tier badge: label + tier icon (crown, shield, building, id-card). */
const TIER_BADGES: Record<UserTier, { label: string; icon: string }> = {
  super_admin: { label: 'Super Admin', icon: 'workspace_premium' },
  admin: { label: 'Admin', icon: 'shield' },
  super_organizer: { label: 'Super Organizer', icon: 'domain' },
  organizer: { label: 'Organizer', icon: 'domain' },
  operator: { label: 'Operator', icon: 'badge' },
};

/** Null until both the account and its tier are known, so the footer never shows a guess. */
export function buildSidebarProfile(
  user: { name: string; email: string } | null,
  tier: UserTier | null,
  settingsRoute?: string,
): SidebarProfile | null {
  if (!user || !tier) return null;
  const { label, icon } = TIER_BADGES[tier];
  const name = user.name.trim() || user.email;
  return { name, email: user.email, tierLabel: label, tierIcon: icon, settingsRoute };
}

/** "Ama Kofi Mensah" → "AM": first and last word, so long names stay two letters. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}
