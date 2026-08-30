import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';

const CODE_LENGTH = 8;
const MAX_TRIES = 5;
const COOLDOWN_MINUTES = 10;

type CodeError = 'not-found' | 'paused' | 'closed' | 'cooldown' | null;

/**
 * Family access. No account, no password — an 8-character code IS the credential.
 *
 * This screen is reached by people who have just been bereaved, often on a borrowed phone,
 * often on 3G. So: one input, large characters, and a recognition confirmation ("Code
 * recognised — Odoi Funeral Service") BEFORE they commit, so a mistyped code costs nothing.
 *
 * The failure copy never says which half of the code is wrong — that would turn the field
 * into an oracle for guessing codes to events the person has no business seeing.
 */
@Component({
  selector: 'app-family-code',
  imports: [MatIconModule, RouterLink],
  templateUrl: './family-code.html',
  styleUrl: './family-code.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FamilyCode {
  private readonly router = inject(Router);

  public readonly code = signal('');
  public readonly checking = signal(false);
  public readonly error = signal<CodeError>(null);
  public readonly recognisedEvent = signal<string | null>(null);
  public readonly lastKnownTotal = signal<string | null>(null);
  public readonly tries = signal(0);
  public readonly cooldownUntil = signal<number | null>(null);

  public readonly length = CODE_LENGTH;
  public readonly cooldownMinutes = COOLDOWN_MINUTES;

  public readonly boxes = computed(() => {
    const chars = this.code().padEnd(CODE_LENGTH, ' ').slice(0, CODE_LENGTH).split('');
    const focusIndex = Math.min(this.code().length, CODE_LENGTH - 1);
    return chars.map((ch, i) => ({
      char: ch.trim(),
      focused: i === focusIndex && !this.complete(),
      index: i,
    }));
  });

  public readonly complete = computed(() => this.code().length === CODE_LENGTH);
  public readonly cooling = computed(() => {
    const until = this.cooldownUntil();
    return until !== null && until > Date.now();
  });

  public readonly canSubmit = computed(() =>
    this.complete() && !this.checking() && !this.cooling(),
  );

  public readonly errorCopy = computed(() => {
    switch (this.error()) {
      case 'not-found':
        return {
          title: 'That code did not work',
          body: 'Check the code with whoever shared it and try again.',
        };
      case 'paused':
        return {
          title: 'Giving is paused right now',
          body: this.lastKnownTotal()
            ? `The family has received ${this.lastKnownTotal()} so far. The organisers have paused `
              + 'new entries — this page will come back to life when they resume.'
            : 'The organisers have paused new entries. Try again shortly.',
        };
      case 'closed':
        return {
          title: 'This event has closed',
          body: 'You can still view the final summary and download the donor list for 90 days.',
        };
      case 'cooldown':
        return {
          title: 'Too many tries',
          body: `For everyone's privacy, this device has to wait ${COOLDOWN_MINUTES} minutes before `
            + 'trying another code. Ask the organiser to confirm the code in the meantime.',
        };
      default:
        return null;
    }
  });

  /** Uppercase, strip anything that is not a letter or digit, cap at the code length. */
  public onInput(raw: string): void {
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
    this.code.set(cleaned);
    if (this.error() === 'not-found') this.error.set(null);

    // Resolve the event as soon as the code is complete, so the name appears before submit.
    if (cleaned.length === CODE_LENGTH) void this.peek();
    else this.recognisedEvent.set(null);
  }

  /** A read-only lookup that returns the event name only — never any donation data. */
  private async peek(): Promise<void> {
    // const found = await eventService.peekByCode(this.code());
    // this.recognisedEvent.set(found?.name ?? null);
  }

  public async submit(): Promise<void> {
    if (!this.canSubmit()) return;

    this.checking.set(true);
    this.error.set(null);

    try {
      // const event = await eventService.byCode(this.code());
      // if (event.status === 'paused') { this.error.set('paused'); return; }
      // this.router.navigate(['/family', this.code()]);
    } catch {
      const tries = this.tries() + 1;
      this.tries.set(tries);

      if (tries >= MAX_TRIES) {
        this.cooldownUntil.set(Date.now() + COOLDOWN_MINUTES * 60_000);
        this.error.set('cooldown');
      } else {
        this.error.set('not-found');
      }
    } finally {
      this.checking.set(false);
    }
  }
}
