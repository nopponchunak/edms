import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { Router, ActivatedRoute } from '@angular/router';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { FuseConfirmationService } from '@fuse/services/confirmation';

import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';

import { ProposalContractReviewService } from 'app/core/services/proposal-contract-review.service';
import { ApiService } from 'app/core/services/api.service';
import { finalize, takeUntil } from 'rxjs/operators';
import { EmployeeService } from 'app/core/services/employee.service';
import { PurchaseFormsFilterComponent, PurchaseFormsFilterConfig, PurchaseFormsFilterValues } from 'app/core/components/purchase-forms-filter';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';
import { getCurrentUserCode, isMyRequestByUserCode } from 'app/core/utils/action-request-filter.util';
import { Subject } from 'rxjs';
import {
  ListSortEvent,
  ListTableSortModule,
} from 'app/shared/list-table-sort/list-table-sort.module';

export interface ProposalContractReview {
  id: string;
  projectName: string;
  projectNo: string;
  proposalNumber: string;
  projectType: string;
  location: string;
  clientName: string;
  estimatedValue: number;
  currency: string;

  status: 'draft' | 'submitted' | 'pending_proposal_review' | 'pending_contract_review' | 'proposal_reviewed' | 'contract_reviewed' | 'contract_approved' | 'approved' | 'declined';

  filledInBy: string;
  createdAt: string;

  proposalReviewers: string[];
  contractReviewers: string[];
  createdBy?: string | null;
  contractAgreedToProceed?: boolean;
  mtProjectCount?: number;
}

@Component({
  selector: 'app-proposal-contract-review-list',
  standalone: true,
  imports: [
        ListTableSortModule,
    CommonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatPaginatorModule,
    PurchaseFormsFilterComponent,
    FuseAlertComponent,
  ],
  templateUrl: './proposal-contract-review-list.component.html',
  styleUrls: ['./proposal-contract-review-list.component.scss'],
})
export class ProposalContractReviewListComponent implements OnInit, OnDestroy {
  private _unsubscribeAll: Subject<any> = new Subject<any>();
  readonly navigationPermissionService = inject(NavigationPermissionService);
  readonly permissionNavId = 'proposal-contract-review';

  displayedColumns: string[] = [
    'proposalNumber',
    'createdAt',
    'projectName',
    'projectNo',
    'projectType',
    'clientName',
    'estimatedValue',
    'filledInBy',
    'status',
    'actions',
  ];

  actionDisplayedColumns: string[] = [
    'proposalNumber',
    'projectName',
    'clientName',
    'estimatedValue',
    'filledInBy',
    'actionStep',
    'status',
    'action',
  ];

  dataSource: ProposalContractReview[] = [];
  allActionData: ProposalContractReview[] = [];
  filteredDataSource: ProposalContractReview[] = [];

  pageIndex = 0;
  pageSize = 10;
  totalRecords = 0;
  listSort: ListSortEvent = { column: 1, dir: 'desc' };
  pagedRows: ProposalContractReview[] = [];
  employeeLookup = new Map<string, string>();
  private readonly projectTypeLookup = new Map<string, string>([
    ['A', 'A - Commercial-Office'],
    ['B', 'B - Commercial-General'],
    ['C', 'C - Industrial'],
    ['D', 'D - Institutional'],
    ['E', 'E - Leisure/Recreation/Tourism'],
    ['H', 'H - Infrastructure/Utilities'],
    ['I', 'I - Residential'],
    ['K', 'K - Miscellaneous'],
    ['L', 'L - Geotechnical'],
    ['M', 'M - Environmental'],
    ['Q', 'Q - Aviation'],
    ['R', 'R - Accredited Checking & Value Engineering'],
    ['S', 'S - Healthcare'],
    ['T', 'T - Fitout'],
    ['U', 'U - Building Audit'],
    ['V', 'V - PM/CM'],
  ]);

  isLoading = false;
  alert: { type: FuseAlertType; message: string } | null = null;

  searchTerm = '';
  statusFilter = '';
  projectTypeFilter = '';

  currentTab: 'all' | 'my' | 'pending' | 'action' = 'all';
  viewMode: 'card' | 'table' = 'table';
  showFilterPanel = false;

  filterConfig: PurchaseFormsFilterConfig = {
    searchLabel: 'Search Reviews',
    searchPlaceholder: 'Search by Project Name, Project Number, Proposal Number, Client...',
    statusFilterLabel: 'Filter by Status',
    statusOptions: [
      { value: 'draft', label: 'Draft' },
      { value: 'submitted', label: 'Submitted' },
      { value: 'pending_proposal_review', label: 'Pending Proposal Review' },
      { value: 'pending_contract_review', label: 'Pending Contract Review' },
      { value: 'proposal_reviewed', label: 'Proposal Reviewed' },
      { value: 'contract_reviewed', label: 'Contract Reviewed' },
      { value: 'contract_approved', label: 'Contract Approved' },
      { value: 'approved', label: 'Approved' },
      { value: 'declined', label: 'Declined' },
    ],
    statusLabelFn: (value: string) => this.getStatusLabel(value),
    thirdFilterLabel: 'Filter by Project Type',
    thirdFilterOptions: [],
    showThirdFilter: true,
  };

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private fuseConfirmationService: FuseConfirmationService,
    private proposalContractReviewService: ProposalContractReviewService,
    private apiService: ApiService,
    private employeeService: EmployeeService
  ) {}

  ngOnInit(): void {
    this.employeeService.getEmployeeLookupMap()
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe((lookup) => {
        this.employeeLookup = lookup;
      });

    if (!this.navigationPermissionService.hasViewAllPermissionByNavId(this.permissionNavId)) {
      this.currentTab = 'my';
    }

    this.route.queryParamMap
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe((pm) => {
      const tabParam = pm.get('tab');
      if (tabParam === 'all' || tabParam === 'my' || tabParam === 'pending' || tabParam === 'action') {
        this.currentTab = tabParam;
      } else if (tabParam === 'action') {
        this.currentTab = 'action';
      }

      if (this.currentTab === 'all' && !this.navigationPermissionService.hasViewAllPermissionByNavId(this.permissionNavId)) {
        this.currentTab = 'my';
      }

      this.pageIndex = 0;
      if (this.currentTab !== 'action') {
        this.loadActionRequestCount();
      }
      this.loadReviews();
    });
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  // -----------------------------
  // Derive status from API fields (supports snake_case + camelCase)
  // Page API returns contract_agreed_to_proceed (0 = declined, 1 = approved)
  // -----------------------------
  private normalizeStatus(value: any): ProposalContractReview['status'] | null {
    switch (String(value ?? '').trim().toLowerCase()) {
      case 'draft':
      case 'submitted':
      case 'pending_proposal_review':
      case 'pending_contract_review':
      case 'proposal_reviewed':
      case 'contract_reviewed':
      case 'contract_approved':
      case 'approved':
      case 'declined':
        return String(value).trim().toLowerCase() as ProposalContractReview['status'];
      default:
        return null;
    }
  }

  private deriveStatus(d: any): ProposalContractReview['status'] {
    const explicitStatus = this.normalizeStatus(d.status);
    if (explicitStatus) return explicitStatus;

    const n = (v: any) => Number(v ?? 0);

    const contractDecline = n(d.contract_decline ?? d.contractDecline);
    const contractProceed = n(d.contract_agreed_to_proceed ?? d.contractAgreedToProceed);

    if (contractDecline === 1) return 'declined';
    if (contractProceed === 1) return 'approved';

    const hasContractReviewer =
      !!d.contract_reviewer1 ||
      !!d.contract_reviewer2 ||
      !!d.contract_reviewer3 ||
      (Array.isArray(d.contractReviewers) && d.contractReviewers.length > 0);

    const hasProposalReviewer =
      !!d.proposal_reviewer1 ||
      !!d.proposal_reviewer2 ||
      !!d.proposal_reviewer3 ||
      (Array.isArray(d.proposalReviewers) && d.proposalReviewers.length > 0);

    if (hasContractReviewer) return 'contract_reviewed';
    if (hasProposalReviewer) return 'proposal_reviewed';

    const filledInDate = d.filled_in_date ?? d.filledInDate;
    const createdAt = d.created_at ?? d.createdAt;

    if (filledInDate || createdAt) return 'submitted';
    return 'draft';
  }

  // -----------------------------
  // ✅ map API object -> row
  // -----------------------------
  private mapToRow(d: any): ProposalContractReview {
    const num = (v: any) => {
      const n = typeof v === 'string' ? Number(v) : Number(v ?? 0);
      return isNaN(n) ? 0 : n;
    };

    const location = [d.city ?? d.cityName, d.country].filter(Boolean).join(', ');

    const proposalReviewers = this.reviewersFromApi(d, 'proposal', [
      d.proposal_reviewer1,
      d.proposal_reviewer2,
      d.proposal_reviewer3,
      ...(Array.isArray(d.proposalReviewers) ? d.proposalReviewers : []),
    ]);

    const contractReviewers = this.reviewersFromApi(d, 'contract', [
      d.contract_reviewer1,
      d.contract_reviewer2,
      d.contract_reviewer3,
      ...(Array.isArray(d.contractReviewers) ? d.contractReviewers : []),
    ]);

    return {
      id: String(d.id),
      projectName: d.project_name ?? d.projectName ?? '-',
      projectNo: d.project_no ?? d.projectNo ?? '-',
      proposalNumber: d.proposal_number ?? d.proposalNumber ?? '-',
      projectType: this.getProjectTypeLabel(d.project_type ?? d.projectType),
      location: location || d.location || '-',
      clientName: d.client_name ?? d.clientName ?? '-',
      estimatedValue: num(d.estimated_total_fees ?? d.estimatedValue),
      currency: d.currency ?? 'THB',

      status: this.deriveStatus(d),

      filledInBy: d.filled_in_by ?? d.filledInBy ?? '-',
      createdAt: d.created_at ?? d.createdAt ?? '',
      proposalReviewers,
      contractReviewers,
      createdBy: d.created_by ?? d.createdBy ?? d.create_by ?? d.createBy ?? d.filled_in_by ?? d.filledInBy ?? null,
      contractAgreedToProceed: this.toBool(d.contract_agreed_to_proceed ?? d.contractAgreedToProceed),
      mtProjectCount: Array.isArray(d.projects)
        ? d.projects.length
        : Array.isArray(d.mt_projects)
          ? d.mt_projects.length
          : 0,
    };
  }

  // -----------------------------
  // Load list via POST /api/proposal_contract_reviews_page only
  // -----------------------------
  private extractRows(response: any): any[] {
    if (Array.isArray(response)) {
      return response;
    }

    if (Array.isArray(response?.data?.data)) {
      return response.data.data;
    }

    if (Array.isArray(response?.data)) {
      return response.data;
    }

    return [];
  }

  private reviewersFromApi(d: any, stage: 'proposal' | 'contract', fallback: any[]): string[] {
    const fromApprovals = Array.isArray(d?.approvals)
      ? d.approvals
          .filter((approval: any) => approval.stage === stage)
          .sort((a: any, b: any) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0))
          .map((approval: any) => approval.approver_code)
          .filter(Boolean)
      : [];

    return (fromApprovals.length ? fromApprovals : fallback).filter(Boolean).map((value: any) => String(value));
  }

  private loadActionReviews(): void {
    const userCode = getCurrentUserCode() || '';
    if (!userCode) {
      this.dataSource = [];
      this.filteredDataSource = [];
      this.pagedRows = [];
      this.totalRecords = 0;
      this.isLoading = false;
      return;
    }

    this.proposalContractReviewService.getActionItems(userCode)
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (items: any[]) => {
          const mappedRows = items.map((r: any) => this.mapToRow(r));
          this.dataSource = mappedRows;
          this.allActionData = mappedRows;
          this.totalRecords = mappedRows.length;
          this.updateFilterConfigFrom(mappedRows);
          this.onFilterChange(false);
        },
        error: (err) => {
          this.alert = { type: 'error', message: err?.error?.message || 'Failed to load action requests' };
          this.dataSource = [];
          this.totalRecords = 0;
          this.onFilterChange(false);
        },
      });
  }

  private loadPendingReviews(): void {
    this.proposalContractReviewService.getAll()
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (items: ProposalContractReview[]) => {
          this.dataSource = items.filter((item) => this.isPendingApprovalItem(item));
          this.totalRecords = this.dataSource.length;
          this.updateFilterConfigFrom(this.dataSource);
          this.onFilterChange(false);
        },
        error: (err) => {
          this.alert = { type: 'error', message: err?.error?.message || 'Failed to load pending approvals' };
          this.dataSource = [];
          this.totalRecords = 0;
          this.onFilterChange(false);
        },
      });
  }

  loadReviews(): void {
    this.isLoading = true;
    this.alert = null;

    if (this.currentTab === 'action') {
      this.loadActionReviews();
      return;
    }

    if (this.currentTab === 'pending') {
      this.loadPendingReviews();
      return;
    }

    const requestBody = {
      draw: this.pageIndex + 1,
      type: 'deposit',
      columns: [
        { data: 'No' },
        { data: 'name' },
        { data: 'create_by' },
        { data: 'update_by' },
        { data: 'created_at' },
        { data: 'updated_at' },
        { data: 'action' },
      ],
      order: [this.listSort],
      start: this.pageIndex * this.pageSize,
      length: this.pageSize,
      search: {
        value: this.searchTerm || '',
        regex: false,
      },
      filters: {
        status: this.statusFilter || '',
        projectType: this.projectTypeFilter || '',
      },
    };

    this.apiService.getProposalContractReviewsPage(requestBody).pipe(
      finalize(() => (this.isLoading = false))
    ).subscribe({
      next: (response: any) => {
        const rawItems = this.extractRows(response);
        const isExplicitFailure = response?.status === false;

        if (isExplicitFailure && rawItems.length === 0) {
          this.alert = { type: 'error', message: response?.message || 'Failed to load reviews' };
          this.dataSource = [];
          this.totalRecords = 0;
          this.onFilterChange(false);
          return;
        }

        const mappedRows = rawItems.map((r: any) => this.mapToRow(r));
        this.dataSource = mappedRows;
        if (this.currentTab === 'action') {
          this.allActionData = mappedRows;
        }
        this.updateFilterConfigFrom(mappedRows);

        const total = Number(
          response?.data?.total ??
            response?.data?.recordsTotal ??
            response?.recordsTotal ??
            response?.recordsFiltered ??
            rawItems.length
        );

        this.totalRecords = Number.isFinite(total) ? total : rawItems.length;
        this.onFilterChange(false);
      },
      error: (err) => {
        this.alert = { type: 'error', message: err?.error?.message || 'Failed to load reviews' };
        this.dataSource = [];
        this.totalRecords = 0;
        this.onFilterChange(false);
      },
    });
  }

  private loadActionRequestCount(): void {
    const userCode = getCurrentUserCode() || '';
    if (!userCode) {
      this.allActionData = [];
      return;
    }

    this.proposalContractReviewService.getActionItems(userCode)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: (items: any[]) => {
          this.allActionData = items.map((r: any) => this.mapToRow(r));
        },
        error: (error) => {
          console.error('Error loading proposal contract review action request count:', error);
        },
      });
  }

  updateFilterConfigFrom(items: ProposalContractReview[]): void {
    const projectTypes = Array.from(
      new Set(items.map((item) => item.projectType).filter((type) => !!type && type !== '-'))
    ).sort() as string[];

    this.filterConfig.thirdFilterOptions = projectTypes.map((type) => ({
      value: type,
      label: type,
    }));
  }

  // ✅ filter แล้วค่อย paginate
  onFilterChange(resetPage: boolean = true): void {
    const term = this.searchTerm.trim().toLowerCase();
    const userCode = getCurrentUserCode();

    this.filteredDataSource = this.dataSource.filter((item) => {
      let matchesTab = true;
      if (this.currentTab === 'my') {
        matchesTab = this.isMyRequest(item, userCode);
      } else if (this.currentTab === 'pending') {
        matchesTab = this.isPendingApprovalItem(item) && (
          this.navigationPermissionService.hasEditPermissionByNavId(this.permissionNavId) ||
          this.isRelatedToCurrentUser(item, userCode)
        );
      } else if (this.currentTab === 'action') {
        matchesTab = this.isActionItem(item) && this.isRelatedToCurrentUser(item, userCode);
      }

      const matchesSearch =
        !term ||
        item.projectName?.toLowerCase().includes(term) ||
        item.projectNo?.toLowerCase().includes(term) ||
        item.proposalNumber?.toLowerCase().includes(term) ||
        item.clientName?.toLowerCase().includes(term) ||
        this.getEmployeeLabel(item.filledInBy).toLowerCase().includes(term);

      const matchesStatus = !this.statusFilter || item.status === (this.statusFilter as any);
      const matchesProjectType = !this.projectTypeFilter || item.projectType === this.projectTypeFilter;

      return matchesTab && matchesSearch && matchesStatus && matchesProjectType;
    });

    if (resetPage) this.pageIndex = 0;
    this.applyPagination();
  }

  private applyPagination(): void {
    // API returns one page; displayedFilteredDataSource is that page (optionally filtered by status/projectType/tab)
    this.pagedRows = this.filteredDataSource;
    // totalRecords is set by loadReviews() from API response.data.total
  }

  onPageChange(e: PageEvent): void {
    this.pageIndex = e.pageIndex;
    this.pageSize = e.pageSize;
    this.loadReviews();
  }

  onListSortChange(sort: ListSortEvent): void {
    this.listSort = sort;
    if (this.currentTab === 'all' || this.currentTab === 'my') {
      this.pageIndex = 0;
      this.loadReviews();
    }
  }

  onCreateNew(): void {
    this.router.navigate(['/proposal-contract-review/new']);
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookup, 'N/A');
  }

  private getProjectTypeLabel(value: any): string {
    const key = String(value ?? '').trim();
    if (!key) return '-';
    return this.projectTypeLookup.get(key) ?? key;
  }

  onView(id: string): void {
    this.router.navigate(['/proposal-contract-review/view', id]);
  }

  onEdit(id: string): void {
    this.router.navigate(['/proposal-contract-review/edit', id]);
  }

  onStage2(id: string): void {
    this.router.navigate(['/proposal-contract-review/stage-2', id]);
  }

  onDelete(id: string): void {
    const confirmation = this.fuseConfirmationService.open({
      title: 'Delete',
      message: 'Please verify the information. Once deleted, the data cannot be recovered.',
      icon: { show: true, name: 'heroicons_outline:exclamation-triangle', color: 'warn' },
      actions: {
        confirm: { show: true, label: 'Delete', color: 'warn' },
        cancel: { show: true, label: 'Cancel' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result === 'confirmed') {
        this.isLoading = true;

        this.proposalContractReviewService
          .remove(id)
          .pipe(finalize(() => (this.isLoading = false)))
          .subscribe({
            next: () => {
              this.showAlert('success', 'Review deleted successfully!');
              this.loadReviews();
            },
            error: (err) => {
              this.showAlert('error', err?.error?.message || 'Delete failed!');
            },
          });
      }
    });
  }

  onReview(id: string): void {
    this.router.navigate(['/proposal-contract-review/review', id]);
  }

  onManageMtProjects(id: string): void {
    this.router.navigate(['/proposal-contract-review/projects', id]);
  }

  canManageMtProjects(item: ProposalContractReview): boolean {
    return item.contractAgreedToProceed === true
      || item.projectNo !== '-'
      || ['contract_approved', 'approved', 'contract_reviewed'].includes(item.status);
  }

  canStartStage2(item: ProposalContractReview): boolean {
    return item.status === 'pending_contract_review' && item.contractAgreedToProceed !== true;
  }

  getStatusOptions(): string[] {
    return ['draft', 'submitted', 'pending_proposal_review', 'pending_contract_review', 'proposal_reviewed', 'contract_reviewed', 'contract_approved', 'approved', 'declined'];
  }

  getProjectTypeOptions(): string[] {
    const types = this.dataSource.map((item) => item.projectType);
    return [...new Set(types)].sort();
  }

  /** Called when search term changes – reload from API with first page */
  onSearchTermChange(value: string): void {
    this.searchTerm = value || '';
    this.pageIndex = 0;
    this.loadReviews();
  }

  onStatusFilterChange(value: string): void {
    this.statusFilter = value || '';
    this.pageIndex = 0;
    this.loadReviews();
  }

  onProjectTypeFilterChange(value: string): void {
    this.projectTypeFilter = value || '';
    this.pageIndex = 0;
    this.loadReviews();
  }

  applyFilters(filters: PurchaseFormsFilterValues): void {
    this.searchTerm = filters.searchTerm || '';
    this.statusFilter = filters.statusFilter || '';
    this.projectTypeFilter = filters.thirdFilter || '';
    this.pageIndex = 0;
    this.loadReviews();
    this.closeFilterPanel();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.statusFilter = '';
    this.projectTypeFilter = '';
    this.pageIndex = 0;
    this.loadReviews();
  }

  toggleFilterPanel(): void {
    this.showFilterPanel = !this.showFilterPanel;
  }

  closeFilterPanel(): void {
    this.showFilterPanel = false;
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.closeFilterPanel();
  }

  get activeFilterCount(): number {
    return [this.searchTerm, this.statusFilter, this.projectTypeFilter]
      .filter((value) => !!value).length;
  }

  onTabChange(tab: 'all' | 'my' | 'pending' | 'action'): void {
    if (tab === 'all' && !this.navigationPermissionService.hasViewAllPermissionByNavId(this.permissionNavId)) {
      tab = 'my';
    }
    this.currentTab = tab;
    this.closeFilterPanel();
    this.pageIndex = 0;
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab }, queryParamsHandling: 'merge' });
  }

  // ✅ Action tab แสดงเฉพาะที่ยังต้อง action
  get actionRequestCount(): number {
    const userCode = getCurrentUserCode();
    const source = this.allActionData.length > 0 ? this.allActionData : this.dataSource;
    return source.filter((item) => this.isActionItem(item) && this.isRelatedToCurrentUser(item, userCode)).length;
  }

  private isActionItem(item: ProposalContractReview): boolean {
    return ['pending_proposal_review', 'pending_contract_review'].includes(item.status);
  }

  private isPendingItem(item: ProposalContractReview): boolean {
    return this.isPendingApprovalItem(item);
  }

  private isPendingApprovalItem(item: ProposalContractReview): boolean {
    return ['pending_proposal_review', 'pending_contract_review'].includes(item.status);
  }

  get actionBaseCount(): number {
    const userCode = getCurrentUserCode();
    const source = this.allActionData.length > 0 ? this.allActionData : this.dataSource;
    return source.filter((i) => this.isActionItem(i) && this.isRelatedToCurrentUser(i, userCode)).length;
  }

  get totalCount(): number {
    return this.totalRecords;
  }

  private isMyRequest(item: ProposalContractReview, userCode: string | null): boolean {
    if (!userCode) return false;
    return isMyRequestByUserCode(
      {
        ...item,
        filledInBy: item.filledInBy,
        filled_in_by: item.filledInBy,
        createdBy: item.createdBy,
        created_by: item.createdBy,
      },
      userCode
    );
  }

  private isRelatedToCurrentUser(item: ProposalContractReview, userCode: string | null): boolean {
    if (!userCode) return false;
    const target = String(userCode).trim().toLowerCase();
    const refs = [
      item.filledInBy,
      item.createdBy,
      ...item.proposalReviewers,
      ...item.contractReviewers,
    ];

    return refs.some((ref) => String(ref ?? '').trim().toLowerCase() === target);
  }

  private toBool(value: any): boolean {
    const normalized = String(value ?? '').trim().toLowerCase();
    return value === true || value === 1 || normalized === '1' || normalized === 'true' || normalized === 'yes';
  }

  showAlert(type: FuseAlertType, message: string): void {
    this.alert = { type, message };
    setTimeout(() => (this.alert = null), 5000);
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      case 'submitted':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'pending_proposal_review':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300';
      case 'pending_contract_review':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300';
      case 'proposal_reviewed':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'contract_reviewed':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'contract_approved':
      case 'approved':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'declined':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'draft': return 'Draft';
      case 'submitted': return 'Submitted';
      case 'pending_proposal_review': return 'Pending Proposal Review';
      case 'pending_contract_review': return 'Pending Contract Review';
      case 'proposal_reviewed': return 'Proposal Reviewed';
      case 'contract_reviewed': return 'Contract Reviewed';
      case 'contract_approved': return 'Contract Approved';
      case 'approved': return 'Approved';
      case 'declined': return 'Declined';
      default: return status;
    }
  }

  getListTitle(): string {
    switch (this.currentTab) {
      case 'all':
        return 'All Proposal & Contract Reviews';
      case 'my':
        return 'My Proposal & Contract Reviews';
      case 'pending':
        return 'Pending Proposal & Contract Reviews';
      case 'action':
        return 'Action Requests';
      default:
        return 'Proposal & Contract Reviews';
    }
  }

  getActionStepText(item: ProposalContractReview): string {
    switch (item.status) {
      case 'pending_proposal_review':
        return 'Proposal Review';
      case 'pending_contract_review':
        return 'Contract Review';
      default:
        return this.getStatusLabel(item.status);
    }
  }

  formatDate(dateString: string): string {
    return formatDateDisplay(dateString);
  }

  formatDateTime(dateString: string): string {
    return formatDateTimeDisplay(dateString);
  }

  formatCurrency(value: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'THB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);
  }
}
