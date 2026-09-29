/**
 * Global account role, read only from an Appwrite Label (AD-1) — never account.prefs.
 * Lives in the Data layer since it's the layer other layers depend on, not the reverse.
 */
export type Role = 'admin' | 'operator';

/**
 * Not a Role: the one Super Admin holds both this and `admin` (AD-11), so every existing admin
 * check includes them for free. Seeded out-of-band, never granted in-app.
 */
export const SUPER_ADMIN_LABEL = 'super_admin';
