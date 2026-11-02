import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { finalize } from 'rxjs';
import { ApprovalsService } from '../../shared/approvals/approvals.service';
import { ListFilters, ListFiltersComponent } from '../../shared/list-filters/list-filters.component';
import { SortHeaderComponent, SortState } from '../../shared/sort-header/sort-header.component';
import { PurchaseRequisition, PurchaseRequisitionService } from './purchase-requisition.service';
import { isPrTurnOf } from './purchase-requisition-steps';

@Component({
  selector: 'app-purchase-requisition-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ListFiltersComponent, SortHeaderComponent],
  templateUrl: './purchase-requisition-list.component.html',
  styleUrl: './purchase-requisition-list.component.scss',
})
export class PurchaseRequisitionListComponent implements OnInit {
  private readonly service = inject(PurchaseRequisitionService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  readonly approvals = inject(ApprovalsService);
  readonly waiting = signal(false);
  readonly canCreate = this.auth.hasPermission('purchase-requisition.create');

  readonly records = signal<PurchaseRequisition[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly filters = signal<ListFilters>({ q: '', status: '', waiting: false, approver: '', dateFrom: '', dateTo: '', type: '' });
  readonly sortState = signal<SortState>({ sort: 'created_at', dir: 'desc' });
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);
  readonly totalPages = signal(1);
  readonly pageSizeOptions = [10, 25, 50];

  readonly pageStart = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1));
  readonly pageEnd = computed(() => Math.min(this.page() * this.pageSize(), this.total()));
  readonly pageNumbers = computed(() => {
    const t = this.totalPages(), c = this.page();
    if (t <= 5) return Array.from({ length: t }, (_, i) => i + 1);
    if (c <= 3) return [1, 2, 3, 4, 5];
    if (c >= t - 2) return [t - 4, t - 3, t - 2, t - 1, t];
    return [c - 2, c - 1, c, c + 1, c + 2];
  });

  readonly statuses = [
    { value: '', label: 'All statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'verified', label: 'Verified' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
  ];

  ngOnInit(): void {
    const waiting = this.route.snapshot.queryParamMap.get('waiting') === 'me';
    this.waiting.set(waiting);
    if (waiting) this.filters.update((f) => ({ ...f, waiting: true }));
    this.load();
  }

  load(): void {
    const f = this.filters();
    const sort = this.sortState();
    this.loading.set(true);
    this.error.set('');
    this.service.list({
      q: f.q, status: f.status, waiting: f.waiting, approver: f.approver, dateFrom: f.dateFrom, dateTo: f.dateTo,
      page: this.page(), limit: this.pageSize(), sort: sort.sort, dir: sort.dir,
    }).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (res) => {
        this.records.set(res.data);
        this.total.set(res.meta.total);
        this.totalPages.set(res.meta.pages);
      },
      error: () => {
        this.records.set([]);
        this.total.set(0);
        this.totalPages.set(1);
        this.error.set('Failed to load records.');
      },
    });
  }

  onFilters(filters: ListFilters): void {
    this.filters.set(filters);
    this.page.set(1);
    this.load();
  }

  onSort(state: SortState): void {
    this.sortState.set(state);
    this.page.set(1);
    this.load();
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages() || p === this.page()) return;
    this.page.set(p);
    this.load();
  }

  changePageSize(size: number): void {
    this.pageSize.set(Number(size));
    this.page.set(1);
    this.load();
  }

  /** Matches the API rule: only the creator, the requester or an administrator may edit a draft or rejected request. */
  canEdit(rec: PurchaseRequisition): boolean {
    const me = this.auth.currentUser();
    if (!this.canCreate || !me || !(rec.status === 'draft' || rec.status === 'rejected')) return false;
    return this.auth.isAdministrator() || rec.createBy === me.username || rec.requestedBy === me.displayName;
  }

  isMyTurn(rec: PurchaseRequisition): boolean {
    return isPrTurnOf(rec, this.auth.currentUser()?.username);
  }

  statusLabel(status: string): string { return this.statuses.find((s) => s.value === status)?.label ?? status; }

  formatAmount(value: string | number): string {
    return Number(value).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
