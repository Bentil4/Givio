import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecentDetails } from './recent-details';

describe('RecentDetails', () => {
  let component: RecentDetails;
  let fixture: ComponentFixture<RecentDetails>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecentDetails]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RecentDetails);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
