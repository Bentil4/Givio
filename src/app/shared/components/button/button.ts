import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

@Component({
  selector: 'app-button',
  templateUrl: './button.html',
  styleUrl: './button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Button {
  public variant = input<ButtonVariant>('primary');
  public disabled = input(false);
  public type = input<'button' | 'submit' | 'reset'>('button');
  public clicked = output<void>();
}
