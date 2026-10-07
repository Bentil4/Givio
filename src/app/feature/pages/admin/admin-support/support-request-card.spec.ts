import { TestBed } from '@angular/core/testing';
import type { SupportRequest } from '../../../../data/models/support-request';
import { SupportRequestCard } from './support-request-card';

const BASE: SupportRequest = {
  id: 'r1',
  type: 'question',
  status: 'open',
  message: 'How do I export?',
  createdAt: '2026-10-07T10:00:00.000Z',
  tenantId: 't1',
  tenantName: 'Asante Events',
  contactEmail: 'kwame@asante.test',
  senderName: 'Kwame',
  senderEmail: 'kwame@asante.test',
};

describe('SupportRequestCard', () => {
  async function render(overrides: Partial<SupportRequest> = {}) {
    const fixture = TestBed.createComponent(SupportRequestCard);
    fixture.componentRef.setInput('request', { ...BASE, ...overrides });
    await fixture.whenStable();
    return fixture;
  }

  const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ') ?? '';

  it('labels the type in words, with the company, sender and an absolute time', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.tag')?.textContent?.trim()).toBe('Question');
    expect(text(el)).toContain('Asante Events');
    expect(text(el)).toContain('From Kwame · kwame@asante.test');
    expect(el.querySelector('time')?.getAttribute('datetime')).toBe(BASE.createdAt);
    expect(text(el.querySelector('time')!)).toMatch(/2026/);
  });

  it('marks a dispute as a Dispute, falling back to the contact email as sender', async () => {
    const fixture = await render({
      type: 'dispute',
      senderName: null,
      senderEmail: null,
      contactEmail: 'owner@gone.test',
    });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.tag')?.textContent?.trim()).toBe('Dispute');
    expect(text(el)).toContain('From owner@gone.test');
  });

  it('offers a mailto reply to the contact email, and none when there is no address', async () => {
    const withReply = await render();
    const link = (withReply.nativeElement as HTMLElement).querySelector('a.btn');
    expect(link?.getAttribute('href')).toMatch(/^mailto:kwame@asante\.test\?subject=/);

    TestBed.resetTestingModule();
    const without = await render({ contactEmail: null, senderEmail: null });
    expect((without.nativeElement as HTMLElement).querySelector('a.btn')).toBeNull();
  });

  it('collapses a long message behind an accessible Show more toggle', async () => {
    const fixture = await render({ message: 'x'.repeat(400) });
    const el = fixture.nativeElement as HTMLElement;
    const toggle = el.querySelector<HTMLButtonElement>('.card-more')!;

    expect(el.querySelector('.message')?.classList.contains('is-clamped')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.click();
    await fixture.whenStable();

    expect(el.querySelector('.message')?.classList.contains('is-clamped')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent?.trim()).toBe('Show less');
  });

  it('shows no toggle for a short message', async () => {
    const fixture = await render();

    expect((fixture.nativeElement as HTMLElement).querySelector('.card-more')).toBeNull();
  });

  it('emits the request from a Mark closed button named for the company, Reopen when closed', async () => {
    const fixture = await render();
    const emitted: SupportRequest[] = [];
    fixture.componentInstance.statusToggled.subscribe((r) => emitted.push(r));
    const el = fixture.nativeElement as HTMLElement;
    const action = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Mark closed'),
    )!;

    expect(text(action)).toContain('Asante Events');
    action.click();
    expect(emitted).toEqual([BASE]);

    const closed = await render({ status: 'closed' });
    expect((closed.nativeElement as HTMLElement).textContent).toContain('Reopen');
  });
});
