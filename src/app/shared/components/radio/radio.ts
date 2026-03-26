import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let nextId = 0;

@Component({
  selector: 'app-radio',
  templateUrl: './radio.html',
  styleUrl: './radio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Radio), multi: true }],
})
export class Radio implements ControlValueAccessor {
  label = input('');
  value = input<string>('');
  radioId = signal(`radio-${nextId++}`);
  checked = signal(false);
  isDisabled = signal(false);

  onChange: (v: string) => void = () => {
    //
  };
  onTouched = () => {
    //
  };

  select() {
    if (this.isDisabled() || this.checked()) return;
    this.checked.set(true);
    this.onChange(this.value());
    this.onTouched();
  }

  writeValue(v: never) {
    this.checked.set(v === this.value());
  }
  registerOnChange(fn: never) {
    this.onChange = fn;
  }
  registerOnTouched(fn: never) {
    this.onTouched = fn;
  }
  setDisabledState(d: boolean) {
    this.isDisabled.set(d);
  }
}
