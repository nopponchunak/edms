import { FormGroup } from '@angular/forms';
import { getCurrentUserCode } from './action-request-filter.util';

interface PreparedByDefaultOptions {
  syncRespondedBy?: boolean;
  syncReviewedBy?: boolean;
}

export function patchDefaultPreparedBy(
  form: FormGroup,
  options: PreparedByDefaultOptions = {}
): string | null {
  const currentUser = getCurrentUserCode();

  if (!currentUser) {
    return null;
  }

  const patch: Record<string, string> = {};
  patchIfEmpty(form, patch, 'preparedBy', currentUser);

  if (options.syncRespondedBy) {
    patchIfEmpty(form, patch, 'respondedBy', currentUser);
  }

  if (options.syncReviewedBy) {
    patchIfEmpty(form, patch, 'reviewedBy', currentUser);
  }

  if (Object.keys(patch).length) {
    form.patchValue(patch, { emitEvent: false });
  }

  return currentUser;
}

function patchIfEmpty(
  form: FormGroup,
  patch: Record<string, string>,
  controlName: string,
  value: string
): void {
  const control = form.get(controlName);

  if (!control || String(control.value ?? '').trim()) {
    return;
  }

  patch[controlName] = value;
}
