import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrganizerDashboard } from './organizer-dashboard';

describe('OrganizerDashboard', () => {
  let component: OrganizerDashboard;
  let fixture: ComponentFixture<OrganizerDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizerDashboard],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizerDashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
