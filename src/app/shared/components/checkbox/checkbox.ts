import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let nextId = 0;

@Component({
  selector: 'app-checkbox',
  templateUrl: './checkbox.html',
  styleUrl: './checkbox.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Checkbox), multi: true }],
})
export class Checkbox implements ControlValueAccessor {
  label = input('');
  checkboxId = signal(`checkbox-${nextId++}`);
  checked = signal(false);
  isDisabled = signal(false);

  onChange: (v: boolean) => void = () => {
    //
  };
  onTouched = () => {
    //
  };

  toggle() {
    if (this.isDisabled()) return;
    this.checked.set(!this.checked());
    this.onChange(this.checked());
    this.onTouched();
  }

  writeValue(v: boolean) {
    this.checked.set(!!v);
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
