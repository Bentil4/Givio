import { Component } from '@angular/core';
import { StatCard } from '../../../components/stat-card/stat-card';
import { RecentActivity } from '../../../components/recent-activity/recent-activity';

@Component({
  selector: 'app-admin-dashboard',
  imports: [StatCard, RecentActivity],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboard {}
