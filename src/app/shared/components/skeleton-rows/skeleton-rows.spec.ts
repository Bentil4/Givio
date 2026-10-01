import { TestBed } from '@angular/core/testing';
import { SkeletonRows } from './skeleton-rows';

describe('SkeletonRows', () => {
  it('renders the requested decorative rows behind one status announcement', () => {
    const fixture = TestBed.createComponent(SkeletonRows);
    fixture.componentRef.setInput('rows', 2);
    fixture.componentRef.setInput('label', 'Loading totals…');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[role="status"]')?.textContent?.trim()).toBe('Loading totals…');
    expect(el.querySelectorAll('.skel-row[aria-hidden="true"]')).toHaveLength(2);
  });
});
