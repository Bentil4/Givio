import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SystemHealth } from './system-health';

describe('SystemHealth', () => {
  let component: SystemHealth;
  let fixture: ComponentFixture<SystemHealth>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SystemHealth]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SystemHealth);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
