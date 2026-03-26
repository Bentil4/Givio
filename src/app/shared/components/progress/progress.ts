import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-progress',
  templateUrl: './progress.html',
  styleUrl: './progress.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Progress {
  public value = input(0);
  public max = input(100);
  public raisedLabel = input('');
  public goalLabel = input('');

  public percent = computed(() => Math.min(100, Math.round((this.value() / this.max()) * 100)));
}
