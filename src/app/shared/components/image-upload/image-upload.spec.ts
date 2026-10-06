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

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  it('encodes the chosen file in the requested format and size', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 1000, height: 500, close: vi.fn() }),
    );
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,logo');
    const onChange = vi.fn();
    component.registerOnChange(onChange);
    fixture.componentRef.setInput('format', 'png');
    fixture.componentRef.setInput('maxDimension', 256);
    const file = new File([new Uint8Array(10)], 'logo.png', { type: 'image/png' });
    const target = { files: [file], value: 'logo.png' } as unknown as HTMLInputElement;

    await component.onFileSelected({ target } as unknown as Event);

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 256, 128);
    expect(toDataURL).toHaveBeenCalledWith('image/png', 0.75);
    expect(onChange).toHaveBeenCalledWith('data:image/png;base64,logo');
  });

  it('setDisabledState toggles isDisabled', () => {
    component.setDisabledState?.(true);
    expect(component.isDisabled()).toBe(true);
  });
});
