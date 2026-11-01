import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { ApprovalsService } from '../../shared/approvals/approvals.service';
import { ListFilters, ListFiltersComponent } from '../../shared/list-filters/list-filters.component';
import { Allowance, AllowanceService } from './allowance.service';

@Component({
  selector: 'app-allowance-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ListFiltersComponent],
  templateUrl: './allowance-list.component.html',
  styleUrl: './allowance-list.component.scss',
})
export class AllowanceListComponent implements OnInit {
  private readonly service = inject(AllowanceService);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  readonly canCreate = this.auth.hasPermission('allowance-after-10pm.create');
  readonly approvals = inject(ApprovalsService);
  readonly waiting = signal(false);
  readonly approver = signal('');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');

  readonly records = signal<Allowance[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly filterStatus = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);
  readonly totalPages = signal(1);
  readonly pageSizeOptions = [10, 25, 50];

  readonly pageStart = computed(() => (this.page() - 1) * this.pageSize() + 1);
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

  ngOnInit() {
    this.waiting.set(this.route.snapshot.queryParamMap.get('waiting') === 'me');
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.service.list({
      q: this.search(),
      status: this.filterStatus(),
      page: this.page(),
      limit: this.pageSize(),
      waiting: this.waiting(),
      approver: this.approver(),
      dateFrom: this.dateFrom(),
      dateTo: this.dateTo(),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res) => {
          this.records.set(res.data);
          this.total.set(res.meta.total);
          this.totalPages.set(res.meta.pages);
        },
        error: () => {
          this.records.set([]);
          this.total.set(0);
          this.error.set('Failed to load records.');
        },
      });
  }

  onFilters(filters: ListFilters) {
    this.search.set(filters.q);
    this.filterStatus.set(filters.status);
    this.waiting.set(filters.waiting);
    this.approver.set(filters.approver);
    this.dateFrom.set(filters.dateFrom);
    this.dateTo.set(filters.dateTo);
    this.page.set(1);
    this.load();
  }

  isMyTurn(record: { status: string; tlBy: string | null; tlByStatus: string | null; diBy: string | null; diByStatus: string | null }): boolean {
    const me = this.auth.currentUser()?.username;
    if (!me) return false;
    if (record.status === 'submitted' && record.tlBy === me && record.tlByStatus === 'pending') return true;
    const approverTurn = record.status === 'verified' || (record.status === 'submitted' && !record.tlBy);
    return approverTurn && record.diBy === me && record.diByStatus === 'pending';
  }

  goToPage(p: number) {
    if (p < 1 || p > this.totalPages() || p === this.page()) return;
    this.page.set(p);
    this.load();
  }

  changePageSize(size: number) {
    this.pageSize.set(size);
    this.page.set(1);
    this.load();
  }

  statusLabel(status: string): string {
    return this.statuses.find((s) => s.value === status)?.label ?? status;
  }

  formatBaht(val: string | number): string {
    return Number(val).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
