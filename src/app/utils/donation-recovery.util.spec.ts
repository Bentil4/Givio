import {
  RECOVERY_WINDOW_DAYS,
  isRecoveryExpiring,
  recoveryDaysLabel,
  recoveryDaysLeft,
} from './donation-recovery.util';

describe('donation recovery window', () => {
  const deletedAt = '2026-10-01T12:00:00.000Z';
  const daysLater = (days: number) => Date.parse(deletedAt) + days * 86_400_000;

  it('counts whole days left out of the 30-day window, never below zero', () => {
    expect(recoveryDaysLeft(deletedAt, daysLater(0))).toBe(RECOVERY_WINDOW_DAYS);
    expect(recoveryDaysLeft(deletedAt, daysLater(29.5))).toBe(1);
    expect(recoveryDaysLeft(deletedAt, daysLater(45))).toBe(0);
  });

  it('treats a live donation as having the whole window', () => {
    expect(recoveryDaysLeft(null, daysLater(10))).toBe(RECOVERY_WINDOW_DAYS);
  });

  it('labels the days and flags the last week', () => {
    expect(recoveryDaysLabel(0)).toBe('archived');
    expect(recoveryDaysLabel(1)).toBe('1 day left');
    expect(recoveryDaysLabel(12)).toBe('12 days left');
    expect(isRecoveryExpiring(7)).toBe(true);
    expect(isRecoveryExpiring(8)).toBe(false);
  });
});
