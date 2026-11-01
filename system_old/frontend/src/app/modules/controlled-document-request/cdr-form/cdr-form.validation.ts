import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

const CATEGORY_OPTION_KEYS = [
    'ims',
    'acp',
    'masterTechSpecs',
    'antiCorruption',
    'other',
];

const REQUEST_FOR_OPTION_KEYS = ['addition', 'amendment', 'deletion', 'copy'];

function checkedCount(control: AbstractControl, keys: string[]): number {
    return keys.filter((key) => control.get(key)?.value === true).length;
}

export const exactlyOneCdrCategoryValidator: ValidatorFn = (
    control: AbstractControl
): ValidationErrors | null =>
    checkedCount(control, CATEGORY_OPTION_KEYS) === 1
        ? null
        : { exactlyOneCategory: true };

export const atLeastOneCdrRequestForValidator: ValidatorFn = (
    control: AbstractControl
): ValidationErrors | null =>
    checkedCount(control, REQUEST_FOR_OPTION_KEYS) >= 1
        ? null
        : { requestForRequired: true };

export function addCalendarDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    result.setHours(0, 0, 0, 0);
    return result;
}
