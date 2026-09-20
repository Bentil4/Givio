import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { filter } from 'rxjs';

export interface BreadcrumbItem {
  label: string;
  path: string;
}

interface Crumb extends BreadcrumbItem {
  current: boolean;
}

/**
 * admin.routes.ts/organizer.routes.ts are flat siblings (e.g. `events`, `events/:id`,
 * `events/:id/edit` all sit directly under `dashboard`, not nested under an `events` parent),
 * so a trail built purely from the ActivatedRoute chain would only ever be 2 levels deep. Routes
 * that are conceptually — but not structurally — nested opt in via `data.breadcrumb` to insert
 * the extra crumb(s) that chain-walking alone can't produce.
 */
@Component({
  selector: 'app-breadcrumb',
  imports: [RouterLink, MatIconModule],
  templateUrl: './breadcrumb.html',
  styleUrl: './breadcrumb.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Breadcrumb {
  private readonly router = inject(Router);

  public readonly crumbs = signal<Crumb[]>(this.buildCrumbs());

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.crumbs.set(this.buildCrumbs()));
  }

  private buildCrumbs(): Crumb[] {
    let route = this.router.routerState.snapshot.root;
    let path = '';
    let portalRoot: Crumb | null = null;
    let leafTitle: string | undefined;

    while (route.firstChild) {
      route = route.firstChild;
      const segment = route.url.map((s) => s.path).join('/');
      if (segment) path += `/${segment}`;
      if (!portalRoot && segment && route.title) {
        portalRoot = { label: route.title, path, current: false };
      }
      if (route.title) leafTitle = route.title;
    }

    if (!portalRoot) return [];

    // The deepest matched route captured no URL segment of its own (e.g. the empty-path index
    // route under /dashboard or /organizer) — that's a portal landing page, not a nested page,
    // so it gets no crumb of its own beyond the portal root (which then hides via the
    // "≤ 1 crumb" rule in the template).
    if (route.url.length === 0) {
      return [{ ...portalRoot, current: true }];
    }

    const extra: Crumb[] = (
      (route.data['breadcrumb'] as BreadcrumbItem[] | undefined) ?? []
    ).map((item) => ({ ...item, current: false }));

    const base: Crumb[] = [portalRoot, ...extra];
    const last = base.at(-1)!;
    if (leafTitle && last.label === leafTitle) {
      return [...base.slice(0, -1), { ...last, current: true }];
    }
    return leafTitle ? [...base, { label: leafTitle, path, current: true }] : base;
  }
}
