import { writable } from 'svelte/store';

export interface KeypadConfig {
  /** Unique identifier for this keypad instance (used to highlight the active cell) */
  id?: string;
  /** Current value string (digits, decimal point, and/or 'x' for shorthand) */
  value: string;
  /** Whether a decimal point is allowed (weight fields) */
  allowDecimal: boolean;
  /** Whether the 'x' shorthand key is shown (reps fields) */
  allowShorthand: boolean;
  /** Display label shown above the value e.g. "Reps" */
  label?: string;
  /** Called on every keypress with the updated value */
  onInput: (v: string) => void | Promise<void>;
  /** Called when the user taps "Done" (last field) */
  onDone: () => void | Promise<void>;
  /** Called when the user taps "Next →" (moves to the next field) */
  onNext?: () => void | Promise<void>;
  /** Called when the user cancels (backdrop tap or Cancel button) */
  onCancel?: () => void | Promise<void>;
}

export const keypadConfig = writable<KeypadConfig | null>(null);

export function openKeypad(config: KeypadConfig): void {
  keypadConfig.set(config);
}

export function closeKeypad(): void {
  keypadConfig.set(null);
}
