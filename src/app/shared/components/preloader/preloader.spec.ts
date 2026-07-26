import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Preloader } from './preloader';

describe('Preloader', () => {
  let component: Preloader;
  let fixture: ComponentFixture<Preloader>;
  let matchMediaSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    matchMediaSpy = vi.fn().mockReturnValue({ matches: false });
    vi.stubGlobal('matchMedia', matchMediaSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function create() {
    await TestBed.configureTestingModule({ imports: [Preloader] }).compileComponents();
    fixture = TestBed.createComponent(Preloader);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', async () => {
    await create();
    expect(component).toBeTruthy();
  });

  it('animates progress from 0 toward 100, sets exiting, then emits done', async () => {
    vi.useFakeTimers();
    await create();

    expect(component.progress()).toBe(0);
    expect(component.exiting()).toBe(false);

    const doneSpy = vi.fn();
    component.done.subscribe(doneSpy);

    // Cover the full active-fill duration, plus one frame of margin so the final
    // rAF tick (which flips `exiting`) has actually fired, not just scheduled.
    await vi.advanceTimersByTimeAsync(1100 + 32);
    expect(component.progress()).toBe(100);
    expect(component.exiting()).toBe(true);
    expect(doneSpy).not.toHaveBeenCalled(); // still mid exit-transition

    // Cover the exit-transition delay before `done` fires.
    await vi.advanceTimersByTimeAsync(450);
    expect(doneSpy).toHaveBeenCalledTimes(1);
  });

  it('skips the animation and emits done quickly when the user prefers reduced motion', async () => {
    matchMediaSpy.mockReturnValue({ matches: true });
    vi.useFakeTimers();
    await create();

    expect(component.progress()).toBe(100);
    expect(component.exiting()).toBe(true);

    const doneSpy = vi.fn();
    component.done.subscribe(doneSpy);

    await vi.advanceTimersByTimeAsync(450);
    expect(doneSpy).toHaveBeenCalledTimes(1);
  });

  it('cancels the animation frame and exit timer on destroy without emitting done', async () => {
    vi.useFakeTimers();
    await create();

    const doneSpy = vi.fn();
    component.done.subscribe(doneSpy);

    fixture.destroy();
    await vi.advanceTimersByTimeAsync(2000);

    expect(doneSpy).not.toHaveBeenCalled();
  });
});
