import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PageTitles } from './page-titles';

describe('PageTitles', () => {
  let component: PageTitles;
  let fixture: ComponentFixture<PageTitles>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PageTitles]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PageTitles);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
