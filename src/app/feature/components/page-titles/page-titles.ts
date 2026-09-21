import { Component, ChangeDetectionStrategy } from '@angular/core';
import { Button } from '../../../shared/components';
import { MatIconModule } from '@angular/material/icon';
import { RouterLinkActive } from "@angular/router";
@Component({
  selector: 'app-page-titles',
  imports: [Button, MatIconModule, RouterLinkActive],
  templateUrl: './page-titles.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './page-titles.scss',
})
export class PageTitles {}
