import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImageUpload } from './image-upload';

describe('ImageUpload', () => {
  let component: ImageUpload;
  let fixture: ComponentFixture<ImageUpload>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImageUpload],
    }).compileComponents();

    fixture = TestBed.createComponent(ImageUpload);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('writeValue sets the preview value', () => {
    component.writeValue('data:image/jpeg;base64,abc');
    expect(component.value()).toBe('data:image/jpeg;base64,abc');
  });

  it('writeValue(null) clears the preview', () => {
    component.writeValue('data:image/jpeg;base64,abc');
    component.writeValue(null);
    expect(component.value()).toBeNull();
  });

  it('clear() resets the value and notifies the registered onChange', () => {
    const onChange = vi.fn();
    component.registerOnChange(onChange);
    component.writeValue('data:image/jpeg;base64,abc');

    component.clear();

    expect(component.value()).toBeNull();
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('setDisabledState toggles isDisabled', () => {
    component.setDisabledState?.(true);
    expect(component.isDisabled()).toBe(true);
  });
});
