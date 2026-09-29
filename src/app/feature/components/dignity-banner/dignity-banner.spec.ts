import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DignityBanner } from './dignity-banner';

@Component({
  imports: [DignityBanner],
  template: `
    <app-dignity-banner
      modal
      heading="Is this your personal phone?"
      detail="We'll close it when you leave."
    >
      <button type="button">Yes</button>
      <button type="button">No</button>
    </app-dignity-banner>
  `,
})
class ModalHost {}

@Component({
  imports: [DignityBanner],
  template: `<app-dignity-banner heading="Nothing changed for you" />`,
})
class InlineHost {}

describe('DignityBanner', () => {
  it('modal: a labelled, described aria-modal dialog that captures focus on its first action', async () => {
    const fixture = TestBed.createComponent(ModalHost);
    fixture.detectChanges();
    await fixture.whenStable();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe(
      'Is this your personal phone?',
    );
    expect(
      document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent,
    ).toContain('close it');
    expect(document.activeElement?.textContent).toBe('Yes');
  });

  it('inline: a polite status banner, not a dialog', () => {
    const fixture = TestBed.createComponent(InlineHost);
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('.dignity-banner') as HTMLElement;
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.hasAttribute('aria-modal')).toBe(false);
    expect(banner.hasAttribute('aria-describedby')).toBe(false);
  });
});
