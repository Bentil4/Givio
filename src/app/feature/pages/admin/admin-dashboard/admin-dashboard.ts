import { Component } from '@angular/core';
import { PageTitles } from "../../../components/page-titles/page-titles";
import { Card } from "../../../../shared/components/card/card";
import { StatCard } from "../../../components/stat-card/stat-card";

@Component({
  selector: 'app-admin-dashboard',
  imports: [PageTitles, Card, StatCard],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboard {

}
