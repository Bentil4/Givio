import type { Tenant } from '../../../../data/models/tenant';

/** A pending Tenant plus the account names the queue shows beside it (resolved best-effort). */
export interface ApplicationView {
  readonly tenant: Tenant;
  readonly applicantName: string | null;
  readonly applicantEmail: string | null;
  readonly verifierName: string | null;
}
