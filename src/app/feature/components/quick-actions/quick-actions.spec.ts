import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { QuickActions } from './quick-actions';

describe('QuickActions', () => {
  let component: QuickActions;
  let fixture: ComponentFixture<QuickActions>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuickActions],
      providers: [provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(QuickActions);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('clicking "Create Event" navigates to /dashboard/events/new', () => {
    const createEventButton = fixture.nativeElement.querySelector('button');
    createEventButton.click();

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard/events/new']);
  });
});
