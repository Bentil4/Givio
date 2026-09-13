import { formatUserDisplay } from './user-display.util';

describe('formatUserDisplay', () => {
  it('shows the name and email when the user is found', () => {
    expect(formatUserDisplay({ name: 'Ama Mensah', email: 'ama@example.com' }, 'op-1'))
      .toBe('Ama Mensah (ama@example.com)');
  });

  it('falls back to the raw id when the user is not found', () => {
    expect(formatUserDisplay(undefined, 'op-1')).toBe('op-1');
  });
});
