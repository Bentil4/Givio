import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { readAndResizeImage } from '../../../utils/image-file.util';

let nextId = 0;

@Component({
  selector: 'app-image-upload',
  imports: [],
  templateUrl: './image-upload.html',
  styleUrl: './image-upload.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ImageUpload),
      multi: true,
    },
  ],
})
export class ImageUpload implements ControlValueAccessor {
  public label = input('');
  public disabled = input(false);
  public error = input(false);
  public errorMessage = input('');
  public inputId = signal(`image-upload-${nextId++}`);

  public value = signal<string | null>(null);
  public isDisabled = signal(false);
  public localError = signal<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  public onChange: (value: string | null) => void = () => {};
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  public onTouched = () => {};

  public async onFileSelected(event: Event): Promise<void> {
    const fileInput = event.target as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await readAndResizeImage(file);
      this.localError.set(null);
      this.value.set(dataUrl);
      this.onChange(dataUrl);
    } catch (err) {
      this.localError.set(err instanceof Error ? err.message : 'Could not process the image.');
    } finally {
      // Allows re-selecting the same file after an error without a page reload.
      fileInput.value = '';
    }
    this.onTouched();
  }

  public clear(): void {
    this.value.set(null);
    this.localError.set(null);
    this.onChange(null);
    this.onTouched();
  }

  public writeValue(obj: string | null): void {
    this.value.set(obj ?? null);
  }
  public registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }
  public registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  public setDisabledState?(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
  }
}
