import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, type Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { Breadcrumb } from './breadcrumb';

@Component({ template: '' })
class Dummy {}

const routes: Routes = [
  {
    path: 'dashboard',
    title: 'Admin',
    children: [
      { path: '', component: Dummy, title: 'Admin Dashboard' },
      { path: 'events', component: Dummy, title: 'Events' },
      { path: 'users', component: Dummy, title: 'Users' },
      {
        path: 'events/:id/edit',
        component: Dummy,
        title: 'Edit Event',
        data: { breadcrumb: [{ label: 'Events', path: '/dashboard/events' }] },
      },
    ],
  },
  {
    path: 'organizer',
    title: 'Organizer',
    children: [
      { path: '', component: Dummy, title: 'Overview' },
      { path: 'entry', component: Dummy, title: 'Record a donation' },
      {
        path: 'entry/phone',
        component: Dummy,
        title: 'Record a donation',
        data: { breadcrumb: [{ label: 'Record a donation', path: '/organizer/entry' }] },
      },
    ],
  },
];

describe('Breadcrumb', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
  });

  async function crumbsAt(url: string) {
    await RouterTestingHarness.create(url);
    const fixture = TestBed.createComponent(Breadcrumb);
    fixture.detectChanges();
    return { fixture, crumbs: fixture.componentInstance.crumbs() };
  }

  it('collapses to a single, non-rendered crumb on a portal root page', async () => {
    const { fixture, crumbs } = await crumbsAt('/dashboard');

    expect(crumbs).toEqual([{ label: 'Admin', path: '/dashboard', current: true }]);
    expect(fixture.nativeElement.querySelector('nav')).toBeNull();
  });

  it('builds a 2-level trail for a plain nested route', async () => {
    const { fixture, crumbs } = await crumbsAt('/dashboard/events');

    expect(crumbs).toEqual([
      { label: 'Admin', path: '/dashboard', current: false },
      { label: 'Events', path: '/dashboard/events', current: true },
    ]);
    expect(fixture.nativeElement.querySelectorAll('li').length).toBe(2);
  });

  it('builds a 3-level trail for a route with data.breadcrumb', async () => {
    const { crumbs } = await crumbsAt('/dashboard/events/123/edit');

    expect(crumbs).toEqual([
      { label: 'Admin', path: '/dashboard', current: false },
      { label: 'Events', path: '/dashboard/events', current: false },
      { label: 'Edit Event', path: '/dashboard/events/123/edit', current: true },
    ]);
  });

  it('collapses a duplicate label instead of repeating it', async () => {
    const { crumbs } = await crumbsAt('/organizer/entry/phone');

    expect(crumbs).toEqual([
      { label: 'Organizer', path: '/organizer', current: false },
      { label: 'Record a donation', path: '/organizer/entry', current: true },
    ]);
  });

  it('rebuilds the trail after a subsequent navigation', async () => {
    const harness = await RouterTestingHarness.create('/dashboard/events');
    const fixture = TestBed.createComponent(Breadcrumb);
    fixture.detectChanges();

    await harness.navigateByUrl('/dashboard/users');
    fixture.detectChanges();

    expect(fixture.componentInstance.crumbs()).toEqual([
      { label: 'Admin', path: '/dashboard', current: false },
      { label: 'Users', path: '/dashboard/users', current: true },
    ]);
  });
});
