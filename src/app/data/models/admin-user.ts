import type { Role } from './role';

/** A row in the Admin User Management table — mapped from Appwrite's Users service. */
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role | null;
  /** Holds the `super_admin` Label on top of `admin` (AD-11). */
  superAdmin?: boolean;
  active: boolean;
  registeredAt: string;
}
