import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, finalize, switchMap, takeUntil } from 'rxjs/operators';
import { EmployeeOption, EmployeeService } from 'app/core/services/employee.service';
import { remoteSearchTerms } from 'app/shared/remote-search/remote-search.util';

export interface FilterOption {
  value: string;
  label: string;
}

export interface PurchaseFormsFilterConfig {
  searchLabel: string;
  searchPlaceholder: string;
  statusFilterLabel: string;
  statusOptions: FilterOption[];
  statusLabelFn?: (value: string) => string;
  showStatusFilter?: boolean;
  thirdFilterLabel?: string;
  thirdFilterOptions?: FilterOption[];
  showThirdFilter?: boolean;
  monthFilterLabel?: string;
  showMonthFilter?: boolean;
}

export interface PurchaseFormsFilterValues {
  searchTerm: string;
  statusFilter: string;
  thirdFilter: string;
  monthFilter?: string;
  approvedBy?: string;
  approvedDateFrom?: string;
  approvedDateTo?: string;
}

@Component({
  selector: 'app-purchase-forms-filter',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    NgxMatSelectSearchModule
  ],
  templateUrl: './purchase-forms-filter.component.html',
  styleUrls: ['./purchase-forms-filter.component.scss']
})
export class PurchaseFormsFilterComponent implements OnInit, OnDestroy {
  private readonly employeeService = inject(EmployeeService);
  private readonly destroy$ = new Subject<void>();
  private readonly barChanges$ = new Subject<void>();
  @Input() config!: PurchaseFormsFilterConfig;
  @Input() variant: 'card' | 'panel' | 'bar' = 'card';
  @Input() manualSearch = false;
  @Input() showResultCount = true;
  @Input() approvedByFilter = '';
  @Input() approvedDateFrom = '';
  @Input() approvedDateTo = '';
  approvedByOptions: EmployeeOption[] = [];
  approvedByLoading = false;
  approvedBySearchCtrl = new FormControl('');
  showMoreFilters = false;
  private _searchTerm: string = '';
  private _statusFilter: string = '';
  private _thirdFilter: string = '';
  private _monthFilter: string = '';

  @Input() 
  get searchTerm(): string {
    return this._searchTerm;
  }
  set searchTerm(value: string) {
    this._searchTerm = value || '';
  }

  @Input()
  get statusFilter(): string {
    return this._statusFilter;
  }
  set statusFilter(value: string) {
    this._statusFilter = value || '';
  }

  @Input()
  get thirdFilter(): string {
    return this._thirdFilter;
  }
  set thirdFilter(value: string) {
    this._thirdFilter = value || '';
  }

  @Input()
  get monthFilter(): string {
    return this._monthFilter;
  }
  set monthFilter(value: string) {
    this._monthFilter = value || '';
  }

  @Input() filteredCount: number = 0;
  @Input() totalCount: number = 0;
  @Input() actionRequestCount?: number;
  @Input() selectedTabIndex: number = 0;

  @Output() searchTermChange = new EventEmitter<string>();
  @Output() statusFilterChange = new EventEmitter<string>();
  @Output() thirdFilterChange = new EventEmitter<string>();
  @Output() monthFilterChange = new EventEmitter<string>();
  @Output() searchFilters = new EventEmitter<PurchaseFormsFilterValues>();
  @Output() clearFilters = new EventEmitter<void>();

  ngOnInit(): void {
    if (!this.config) {
      throw new Error('PurchaseFormsFilterComponent: config is required');
    }
    if (this.variant === 'bar') {
      this.barChanges$.pipe(debounceTime(350), takeUntil(this.destroy$)).subscribe(() => this.onApplyFilters());
      remoteSearchTerms(this.approvedBySearchCtrl, this.destroy$)
        .pipe(switchMap((term) => {
          this.approvedByLoading = true;
          return this.employeeService.getEmployeeOptionsFromApi(term, 20).pipe(
            catchError(() => of([] as EmployeeOption[])),
            finalize(() => this.approvedByLoading = false)
          );
        }))
        .subscribe((options) => {
          const selected = this.approvedByOptions.find((option) => option.code === this.approvedByFilter);
          this.approvedByOptions = selected && !options.some((option) => option.code === selected.code)
            ? [selected, ...options]
            : options;
        });
      if (this.approvedByFilter) {
        this.employeeService.getEmployeeOptionsFromApi(this.approvedByFilter, 20)
          .pipe(takeUntil(this.destroy$))
          .subscribe((options) => {
            const selected = options.find((option) => option.code === this.approvedByFilter);
            if (selected && !this.approvedByOptions.some((option) => option.code === selected.code)) {
              this.approvedByOptions = [selected, ...this.approvedByOptions];
            }
          });
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  scheduleBarApply(): void {
    this.barChanges$.next();
  }

  onApprovedByChange(value: string): void {
    this.approvedByFilter = value || '';
    this.scheduleBarApply();
  }

  onSearchChange(value: string): void {
    this._searchTerm = value || '';
    if (this.variant === 'bar') this.scheduleBarApply();
    if (!this.manualSearch) {
      this.searchTermChange.emit(this._searchTerm);
    }
  }

  onStatusChange(value: string): void {
    this._statusFilter = value || '';
    if (this.variant === 'bar') this.scheduleBarApply();
    if (!this.manualSearch) {
      this.statusFilterChange.emit(this._statusFilter);
    }
  }

  onThirdFilterChange(value: string): void {
    this._thirdFilter = value || '';
    if (this.variant === 'bar') this.scheduleBarApply();
    if (!this.manualSearch) {
      this.thirdFilterChange.emit(this._thirdFilter);
    }
  }

  onMonthFilterChange(value: string): void {
    this._monthFilter = value || '';
    if (this.variant === 'bar') this.scheduleBarApply();
    if (!this.manualSearch) {
      this.monthFilterChange.emit(this._monthFilter);
    }
  }

  onApplyFilters(): void {
    this.searchFilters.emit({
      searchTerm: this._searchTerm,
      statusFilter: this._statusFilter,
      thirdFilter: this._thirdFilter,
      monthFilter: this._monthFilter,
      approvedBy: this.approvedByFilter,
      approvedDateFrom: this.approvedDateFrom,
      approvedDateTo: this.approvedDateTo
    });
  }

  onClearFilters(): void {
    this._searchTerm = '';
    this._statusFilter = '';
    this._thirdFilter = '';
    this._monthFilter = '';
    this.approvedByFilter = '';
    this.approvedDateFrom = '';
    this.approvedDateTo = '';
    this.clearFilters.emit();
  }

  getApprovedByLabel(): string {
    return this.approvedByOptions.find((option) => option.code === this.approvedByFilter)?.displayLabel
      || this.approvedByFilter;
  }

  getStatusLabel(value: string): string {
    if (this.config.statusLabelFn) {
      return this.config.statusLabelFn(value);
    }
    const option = this.config.statusOptions.find(opt => opt.value === value);
    return option ? option.label : value;
  }

  hasActiveFilters(): boolean {
    return !!(this._searchTerm || this._statusFilter || this._thirdFilter || this._monthFilter);
  }

  getDisplayCount(): number {
    return this.selectedTabIndex === 1 && this.actionRequestCount !== undefined
      ? this.actionRequestCount
      : this.totalCount;
  }

  getItemName(): string {
    const searchLabel = this.config.searchLabel.toLowerCase();
    if (searchLabel.includes('assessment')) return 'assessments';
    if (searchLabel.includes('requisition')) return 'requisitions';
    if (searchLabel.includes('order')) return 'orders';
    if (searchLabel.includes('evaluation')) return 'evaluations';
    if (searchLabel.includes('justification')) return 'justifications';
    return 'items';
  }
}
