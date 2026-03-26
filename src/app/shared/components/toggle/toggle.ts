import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-toggle',
  templateUrl: './toggle.html',
  styleUrl: './toggle.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Toggle), multi: true }],
})
export class Toggle implements ControlValueAccessor {
  label = input('');
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
  registerOnChange(fn: (v: boolean) => void) {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void) {
    this.onTouched = fn;
  }
  setDisabledState(d: boolean) {
    this.isDisabled.set(d);
  }
}
