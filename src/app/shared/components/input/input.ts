/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let nextId = 0;

@Component({
  selector: 'app-input',
  imports: [],
  templateUrl: './input.html',
  styleUrl: './input.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Input),
      multi: true,
    },
  ],
})
export class Input implements ControlValueAccessor {
  public label = input('');
  public type = input('text');
  public placeholder = input('');
  public disabled = input(false);
  public error = input(false);
  public success = input(false);
  public errorMessage = input('');
  public inputId = signal(`input-${nextId++}`);

  public value = signal('');
  public isDisabled = signal(false);

  public onChange: (value: any) => void = () => {
    //
  };
  public onTouched = () => {
    //
  };

  public onInput(event: Event) {
    const inputValue = (event.target as HTMLInputElement).value;
    this.value.set(inputValue);
    this.onChange(inputValue);
  }

  public writeValue(obj: any): void {
    this.value.set(obj || '');
    // throw new Error("Method not implemented.");
  }
  public registerOnChange(fn: any): void {
    this.onChange = fn;
    // throw new Error("Method not implemented.");
  }
  public registerOnTouched(fn: any): void {
    this.onTouched = fn;
    // throw new Error("Method not implemented.");
  }
  public setDisabledState?(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
    // throw new Error("Method not implemented.");
  }

  public onBlur(): void {
    this.onTouched();
  }
}
