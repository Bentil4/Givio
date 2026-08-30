export interface ILoginRequest {
  email: string;
  password: string;
}

export interface INavbarItem {
  name: string;
  route: string;
  icon: string;
  /** Shown but not navigable — e.g. a planned feature with no screen yet. */
  disabled?: boolean;
}

export interface IUserProfile {
  name: string;
  role: string;
  avatar?: string;
}
