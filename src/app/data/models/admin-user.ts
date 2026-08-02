import type { Role } from './role';

/** A row in the Admin User Management table — mapped from Appwrite's Users service. */
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role | null;
  active: boolean;
  registeredAt: string;
}
