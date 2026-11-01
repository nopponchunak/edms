import { AbstractControl } from '@angular/forms';
import { Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, startWith, takeUntil } from 'rxjs/operators';

export function normalizeRemoteSearchTerm(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function remoteSearchTerms(
  control: AbstractControl,
  destroy$: Observable<unknown>
): Observable<string> {
  return control.valueChanges.pipe(
    startWith(control.value ?? ''),
    map(normalizeRemoteSearchTerm),
    debounceTime(500),
    distinctUntilChanged(),
    takeUntil(destroy$)
  );
}
