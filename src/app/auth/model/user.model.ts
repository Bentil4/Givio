export interface ILoginRequest {
  email: string;
  password: string;
}

export interface INavbarItem {
  name: string;
  route: string;
  icon: string;
}

export interface IUserProfile {
  name: string;
  role: string;
  avatar?: string;
}
