import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { ApprovalCountsService } from '../../../../data/services/approval-counts.service';
import { SupportRequestDataService } from '../../../../data/services/support-request-data.service';
import type { SupportRequest, SupportRequestStatus } from '../../../../data/models/support-request';
import { SkeletonRows } from '../../../../shared/components/skeleton-rows/skeleton-rows';
import { tabIndexForKey } from '../../../../utils/tabs.util';
import { SupportRequestCard } from './support-request-card';

type LoadState = 'loading' | 'ready' | 'error';

const TABS: readonly { id: SupportRequestStatus; label: string; emptyTitle: string }[] = [
  { id: 'open', label: 'Open', emptyTitle: 'No open requests' },
  { id: 'closed', label: 'Closed', emptyTitle: 'No closed requests' },
];

const LOAD_FAILED = "Couldn't load support requests.";

/** The Admin support inbox: Contact Admin questions and suspended companies' disputes. */
@Component({
  selector: 'app-admin-support',
  imports: [MatIconModule, SkeletonRows, SupportRequestCard],
  templateUrl: './admin-support.html',
  styleUrl: './admin-support.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSupport {
  private readonly supportData = inject(SupportRequestDataService);
  private readonly approvalCounts = inject(ApprovalCountsService);
  private readonly route = inject(ActivatedRoute);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('listHeading');
  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');
  private loadToken = 0;

  public readonly tabs = TABS;
  public readonly activeTab = signal<SupportRequestStatus>(this.requestedTab());
  public readonly requests = signal<readonly SupportRequest[]>([]);
  public readonly nextCursor = signal<string | null>(null);
  public readonly loadState = signal<LoadState>('loading');
  public readonly loadingMore = signal(false);
  public readonly announcement = signal('');
  public readonly actionError = signal<string | null>(null);
  public readonly emptyTitle = computed(
    () => TABS.find((tab) => tab.id === this.activeTab())?.emptyTitle ?? '',
  );

  constructor() {
    void this.loadFirstPage();
  }

  public selectTab(tab: SupportRequestStatus): void {
    if (tab === this.activeTab()) return;
    this.activeTab.set(tab);
    void this.loadFirstPage();
  }

  /** WAI-ARIA tabs: arrow keys move between tabs; only the selected tab is in the Tab order. */
  public onTabKeydown(event: KeyboardEvent, index: number): void {
    const next = tabIndexForKey(event.key, index, TABS.length);
    if (next === undefined) return;
    event.preventDefault();
    this.selectTab(TABS[next].id);
    this.tabButtons()[next]?.nativeElement.focus();
  }

  public async loadFirstPage(): Promise<void> {
    const token = ++this.loadToken;
    this.requests.set([]);
    this.nextCursor.set(null);
    this.loadState.set('loading');
    try {
      const page = await this.supportData.listRequests({ status: this.activeTab() });
      if (token !== this.loadToken) return;
      this.requests.set(page.requests);
      this.nextCursor.set(page.nextCursor);
      this.loadState.set('ready');
    } catch {
      if (token === this.loadToken) this.loadState.set('error');
    }
  }

  public async loadMore(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) return;
    const token = this.loadToken;
    this.loadingMore.set(true);
    try {
      const page = await this.supportData.listRequests({ status: this.activeTab(), cursor });
      if (token !== this.loadToken) return;
      this.requests.update((current) => [...current, ...page.requests]);
      this.nextCursor.set(page.nextCursor);
    } catch {
      this.actionError.set(LOAD_FAILED);
    } finally {
      this.loadingMore.set(false);
    }
  }

  /** Optimistic: the request leaves this tab at once and returns to its place if the save fails. */
  public async toggleStatus(request: SupportRequest): Promise<void> {
    const target: SupportRequestStatus = request.status === 'open' ? 'closed' : 'open';
    const index = this.requests().findIndex((candidate) => candidate.id === request.id);
    this.actionError.set(null);
    this.removeFromList(request.id);
    try {
      await this.supportData.setStatus(request.id, target);
      this.announcement.set(`Request from ${companyOf(request)} ${announced(target)}.`);
      void this.approvalCounts.refreshSupportRequests();
    } catch {
      this.restoreToList(request, index);
      this.actionError.set(`Couldn't update the request from ${companyOf(request)}. It's back.`);
    }
  }

  private removeFromList(id: string): void {
    // Keyboard focus would otherwise fall to <body> when the focused card's button disappears.
    this.heading()?.nativeElement.focus();
    this.requests.update((current) => current.filter((candidate) => candidate.id !== id));
  }

  private restoreToList(request: SupportRequest, index: number): void {
    if (request.status !== this.activeTab()) return;
    const at = Math.max(index, 0);
    this.requests.update((current) => [...current.slice(0, at), request, ...current.slice(at)]);
  }

  /** The overview's tile and any bookmark can open a tab directly, e.g. `?tab=closed`. */
  private requestedTab(): SupportRequestStatus {
    const requested = this.route.snapshot.queryParamMap.get('tab');
    return TABS.find((tab) => tab.id === requested)?.id ?? 'open';
  }
}

function companyOf(request: SupportRequest): string {
  return request.tenantName ?? 'an unknown company';
}

function announced(status: SupportRequestStatus): string {
  return status === 'closed' ? 'marked closed' : 'reopened';
}
