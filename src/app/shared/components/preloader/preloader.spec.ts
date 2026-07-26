import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Preloader } from './preloader';

describe('Preloader', () => {
  let component: Preloader;
  let fixture: ComponentFixture<Preloader>;

  async function create(active: boolean) {
    await TestBed.configureTestingModule({ imports: [Preloader] }).compileComponents();
    fixture = TestBed.createComponent(Preloader);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('active', active);
    fixture.detectChanges();
  }

  it('should create', async () => {
    await create(false);
    expect(component).toBeTruthy();
  });

  it('applies the active class when active() is true', async () => {
    await create(true);
    const el: HTMLElement = fixture.nativeElement.querySelector('.preloader');
    expect(el.classList.contains('active')).toBe(true);
  });

  it('does not apply the active class when active() is false', async () => {
    await create(false);
    const el: HTMLElement = fixture.nativeElement.querySelector('.preloader');
    expect(el.classList.contains('active')).toBe(false);
  });

  it('reflects a change in the active input immediately, with no internal delay', async () => {
    await create(true);
    let el: HTMLElement = fixture.nativeElement.querySelector('.preloader');
    expect(el.classList.contains('active')).toBe(true);

    fixture.componentRef.setInput('active', false);
    fixture.detectChanges();
    el = fixture.nativeElement.querySelector('.preloader');
    expect(el.classList.contains('active')).toBe(false);
  });
});
