import { FormControl } from '@angular/forms';
import { normalizePhone, phoneValidator } from './phone.util';

describe('phone.util', () => {
  it('normalizes spaces, dashes and parentheses away', () => {
    expect(normalizePhone(' +233 (24) 123-4567 ')).toBe('+233241234567');
  });

  it('accepts a formatted international number and an empty value', () => {
    expect(phoneValidator(new FormControl('+233 24 123 4567'))).toBeNull();
    expect(phoneValidator(new FormControl(''))).toBeNull();
  });

  it('rejects a local number without the country code', () => {
    expect(phoneValidator(new FormControl('024 123 4567'))).toEqual({ phone: true });
  });
});
