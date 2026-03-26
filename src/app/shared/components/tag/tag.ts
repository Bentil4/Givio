import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type TagVariant = 'success' | 'error' | 'info' | 'default';

@Component({
  selector: 'app-tag',
  templateUrl: './tag.html',
  styleUrl: './tag.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Tag {
  variant = input<TagVariant>('default');
}
