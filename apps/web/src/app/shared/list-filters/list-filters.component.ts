import { Component, computed, DestroyRef, EventEmitter, inject, Input, OnInit, Output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { debounceTime, Subject } from 'rxjs';
import { DateRangePickerComponent, DateRange } from '../date-range-picker/date-range-picker.component';
import { DirectoryService } from '../directory/directory.service';
import { SearchableSelectComponent, SelectOption } from '../searchable-select/searchable-select.component';

export interface ListFilters {
  q: string;
  status: string;
  waiting: boolean;
  approver: string;
  dateFrom: string;
  dateTo: string;
  type?: string;
}

export const WAITING_FOR_ME = '__waiting';

@Component({
  selector: 'app-list-filters',
  standalone: true,
  imports: [FormsModule, DateRangePickerComponent, SearchableSelectComponent],
  templateUrl: './list-filters.component.html',
  styleUrl: './list-filters.component.scss',
})
export class ListFiltersComponent implements OnInit {
  private readonly directory = inject(DirectoryService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly typing = new Subject<void>();

  @Input() statuses: { value: string; label: string }[] = [];
  @Input() waitingCount = 0;
  @Input() showWaiting = true;
  @Input() typeLabel = 'Type';
  @Input() typeOptions: { value: string; label: string }[] = [];
  @Input() searchPlaceholder = 'Search requester, approver or voucher no.';
  @Input() set initialWaiting(value: boolean) { if (value) this.status.set(WAITING_FOR_ME); }
  @Output() changed = new EventEmitter<ListFilters>();

  readonly q = signal('');
  readonly status = signal('');
  readonly approver = signal('');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly type = signal('');
  readonly approverOptions = signal<SelectOption[]>([]);
  readonly waitingValue = WAITING_FOR_ME;
  readonly hasFilters = computed(() => !!(this.q() || this.type() || this.status() || this.approver() || this.dateFrom() || this.dateTo()));

  ngOnInit(): void {
    this.typing.pipe(debounceTime(350), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.emit());
    this.directory.listUsers().subscribe({
      next: (res) => this.approverOptions.set(res.data.map((u) => ({ value: u.username, label: u.displayName }))),
      error: () => undefined,
    });
  }

  onQuery(value: string): void {
    this.q.set(value);
    this.typing.next();
  }

  submitSearch(): void { this.emit(); }

  onStatus(value: string): void {
    this.status.set(value);
    this.emit();
  }

  onType(value: string): void {
    this.type.set(value);
    this.emit();
  }

  onApprover(value: string): void {
    this.approver.set(value);
    this.emit();
  }

  onRange(range: DateRange): void {
    this.dateFrom.set(range.from);
    this.dateTo.set(range.to);
    this.emit();
  }

  clearAll(): void {
    this.q.set('');
    this.status.set('');
    this.type.set('');
    this.approver.set('');
    this.dateFrom.set('');
    this.dateTo.set('');
    this.emit();
  }

  private emit(): void {
    const status = this.status();
    this.changed.emit({
      q: this.q().trim(),
      status: status === WAITING_FOR_ME ? '' : status,
      waiting: status === WAITING_FOR_ME,
      approver: this.approver(),
      dateFrom: this.dateFrom(),
      dateTo: this.dateTo(),
      ...(this.typeOptions.length ? { type: this.type() } : {}),
    });
  }
}
