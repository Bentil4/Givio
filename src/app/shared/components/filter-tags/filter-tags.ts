import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export interface FilterTag {
  label: string;
  value: string;
}

@Component({
  selector: 'app-filter-tags',
  templateUrl: './filter-tags.html',
  styleUrl: './filter-tags.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterTags {
  public tags = input<FilterTag[]>([]);
  public active = model('');

  public select(value: string) {
    this.active.set(value);
  }
}
