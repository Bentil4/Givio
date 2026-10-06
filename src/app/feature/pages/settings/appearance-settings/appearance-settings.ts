import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ThemeService, type ThemePreference } from '../../../../core/services/theme.service';

const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Match my device' },
];

/** Settings → Appearance: applied as soon as it's picked, and remembered on this device. */
@Component({
  selector: 'app-appearance-settings',
  template: `
    <article class="support-card glass" aria-labelledby="appearance-title">
      <h2 id="appearance-title" class="t-card-title">Theme</h2>
      <fieldset class="theme-options">
        <legend class="field-hint">Choose how Givio looks on this device.</legend>
        @for (option of options; track option.value) {
          <label class="theme-option">
            <input
              type="radio"
              name="theme-preference"
              [value]="option.value"
              [checked]="preference() === option.value"
              (change)="themeService.setPreference(option.value)"
            />
            {{ option.label }}
          </label>
        }
      </fieldset>
    </article>
  `,
  styleUrl: '../settings-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppearanceSettings {
  protected readonly themeService = inject(ThemeService);
  protected readonly options = THEME_OPTIONS;
  public readonly preference = this.themeService.preference;
}
