import { AbstractControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

const FINAL_ACTION_TYPE = 'acknowledged_by_status_2';

export const nonWhitespaceRequiredValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null =>
  String(control.value ?? '').trim() === '' ? { whitespaceRequired: true } : null;

export function configureCdrActionValidation(
  form: FormGroup,
  actionType: string | null | undefined
): void {
  const newRevisionControl = form.get('newRevision');
  if (!newRevisionControl) return;

  if (actionType === FINAL_ACTION_TYPE) {
    newRevisionControl.setValidators([
      Validators.required,
      nonWhitespaceRequiredValidator,
    ]);
  } else {
    newRevisionControl.clearValidators();
  }

  newRevisionControl.updateValueAndValidity({ emitEvent: false });
}
