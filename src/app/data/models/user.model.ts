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
  /** A count of items waiting on this page (e.g. pending approvals); hidden when 0. */
  badge?: number;
}

/** Who is signed in, as the sidebar footer shows it — always a name paired with a tier badge. */
export interface SidebarProfile {
  name: string;
  email: string;
  tierLabel: string;
  tierIcon: string;
  /** Where the profile block links to; plain text when absent. */
  settingsRoute?: string;
}

/** Replaces the Givio wordmark for company users: their company's logo, or its name. */
export interface SidebarBrand {
  name: string;
  logo?: string;
}
