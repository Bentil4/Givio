/** How long a soft-deleted donation stays recoverable before it is archived (never erased). */
export const RECOVERY_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

/** Whole days left to recover a donation deleted at `deletedAt`, as of `nowMs`; 0 once past. */
export function recoveryDaysLeft(deletedAt: string | null | undefined, nowMs: number): number {
  if (!deletedAt) return RECOVERY_WINDOW_DAYS;
  const elapsed = (nowMs - new Date(deletedAt).getTime()) / DAY_MS;
  return Math.max(0, Math.ceil(RECOVERY_WINDOW_DAYS - elapsed));
}

/** "12 days left", "1 day left", or "archived". */
export function recoveryDaysLabel(daysLeft: number): string {
  if (daysLeft === 0) return 'archived';
  return daysLeft === 1 ? '1 day left' : `${daysLeft} days left`;
}

/** Under a week left is worth flagging — after that the record only lives in the archive. */
export function isRecoveryExpiring(daysLeft: number): boolean {
  return daysLeft <= 7;
}
