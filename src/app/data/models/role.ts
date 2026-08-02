/**
 * Global account role, read only from an Appwrite Label (AD-1) — never account.prefs.
 * Lives in the Data layer since it's the layer other layers depend on, not the reverse.
 */
export type Role = 'admin' | 'operator';
