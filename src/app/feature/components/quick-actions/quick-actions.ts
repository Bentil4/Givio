import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Button } from "../../../shared/components";

@Component({
  selector: 'app-quick-actions',
  imports: [Button],
  templateUrl: './quick-actions.html',
  styleUrl: './quick-actions.scss',
})
export class QuickActions {
  private readonly router = inject(Router);

  navigateToCreateEvent(): void {
    this.router.navigate(['/dashboard/events/new']);
  }
}
