import { Component } from '@angular/core';
import { StatCard } from '../../../components/stat-card/stat-card';
import { RecentActivity } from '../../../components/recent-activity/recent-activity';
import { QuickActions } from "../../../components/quick-actions/quick-actions";
import { SystemHealth } from "../../../components/system-health/system-health";

@Component({
  selector: 'app-admin-dashboard',
  imports: [StatCard, RecentActivity, QuickActions, SystemHealth],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboard {}
