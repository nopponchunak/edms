import { FormGroup } from '@angular/forms';
import { EmployeeOption } from 'app/core/services/employee.service';

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function toInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  const trimmed = String(value ?? '').trim();
  if (!/^-?\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function getEmployeeCandidates(option: EmployeeOption): string[] {
  const fullName = [option.firstName, option.lastName].filter(Boolean).join(' ').trim();
  const fullNameWithCode =
    fullName && option.code ? `${fullName} (${option.code})` : '';

  return [
    option.id,
    option.code,
    option.employeeId,
    option.displayLabel,
    option.name,
    fullName,
    fullNameWithCode,
    option.email,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
}

export function resolveEmployeeOptionId(
  value: unknown,
  options: EmployeeOption[]
): number | string {
  const normalizedValue = normalize(value);

  if (!normalizedValue) {
    return '';
  }

  const matchedOption = options.find((option) =>
    getEmployeeCandidates(option).some(
      (candidate) => normalize(candidate) === normalizedValue
    )
  );

  return matchedOption?.code ?? String(value ?? '').trim();
}

export function normalizeEmployeeControlValues(
  form: FormGroup,
  controlNames: string[],
  options: EmployeeOption[]
): void {
  if (!options.length) {
    return;
  }

  const patch: Record<string, number | string> = {};

  controlNames.forEach((controlName) => {
    const control = form.get(controlName);
    if (!control) {
      return;
    }

    const currentValue = control.value;
    const resolvedValue = resolveEmployeeOptionId(currentValue, options);

    if (String(currentValue ?? '') !== String(resolvedValue ?? '')) {
      patch[controlName] = resolvedValue;
    }
  });

  if (Object.keys(patch).length) {
    form.patchValue(patch, { emitEvent: false });
  }
}
