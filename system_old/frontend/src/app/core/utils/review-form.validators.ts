import {
  AbstractControl,
  FormArray,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';

export function minSelectedCheckboxes(min = 1): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const formArray = control as FormArray;
    const totalSelected = formArray?.controls?.reduce(
      (total, item) => total + (item.value ? 1 : 0),
      0
    );

    return (totalSelected ?? 0) >= min ? null : { required: true };
  };
}

export function allItemsAnswered(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const formArray = control as FormArray;
    const hasBlankValue = formArray?.controls?.some((item) => {
      const value = item.value;
      return value === null || value === undefined || String(value).trim() === '';
    });

    return hasBlankValue ? { required: true } : null;
  };
}
