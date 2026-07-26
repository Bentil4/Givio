import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Sidebar } from './sidebar';

describe('Sidebar', () => {
  let component: Sidebar;
  let fixture: ComponentFixture<Sidebar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Sidebar],
    }).compileComponents();

    fixture = TestBed.createComponent(Sidebar);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('navItems', []);
    fixture.componentRef.setInput('userProfile', []);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('emits logout when the logout button is clicked', async () => {
    const logoutSpy = vi.fn();
    component.logout.subscribe(logoutSpy);

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.logout-button');
    button.click();
    await fixture.whenStable();

    expect(logoutSpy).toHaveBeenCalledTimes(1);
  });
});
