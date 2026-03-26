import { Component, input } from '@angular/core';
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: 'app-stat-card',
  imports: [MatIconModule],
  templateUrl: './stat-card.html',
  styleUrl: './stat-card.scss',
})
export class StatCard {
  public value = input.required<string | number>();
  public label = input.required<string>();
  public trend = input<'positive' | 'negative' | null>(null);
  public trendValue = input<string>('');
  public icon = input<string>('');
}

export interface IStatCard {
  value: string | number;
  label: string;
  icon: string;
}