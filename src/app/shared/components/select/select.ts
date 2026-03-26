import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SelectOption {
  label: string;
  value: string;
}

let nextId = 0;

@Component({
  selector: 'app-select',
  templateUrl: './select.html',
  styleUrl: './select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Select), multi: true }],
})
export class Select implements ControlValueAccessor {
  placeholder = input('Choose…');
  options = input<SelectOption[]>([]);
  disabled = input(false);
  selectId = signal(`select-${nextId++}`);

  value = signal('');
  isDisabled = signal(false);

  onChange: (v: string) => void = () => {
    //
  };
  onTouched = () => {
    //
  };

  onSelect(event: Event) {
    const val = (event.target as HTMLSelectElement).value;
    this.value.set(val);
    this.onChange(val);
  }

  writeValue(v: string | null | undefined) {
    this.value.set(v || '');
  }
  registerOnChange(fn: (v: string) => void) {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void) {
    this.onTouched = fn;
  }
  setDisabledState(d: boolean) {
    this.isDisabled.set(d);
  }
}
