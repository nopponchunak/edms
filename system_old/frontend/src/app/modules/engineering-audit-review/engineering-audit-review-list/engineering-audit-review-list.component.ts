import { Component, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { deriveEngineeringAuditStatus, mergeProjectReviewEmployeeLookup, pickDate, pickString, pickStringArray, ProjectReviewApiService } from 'app/core/services/project-review-api.service';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import {
  PurchaseFormsFilterComponent,
  PurchaseFormsFilterConfig,
  PurchaseFormsFilterValues,
} from 'app/core/components/purchase-forms-filter';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';
import { getCurrentUserCode, isMyRequestByUserCode } from 'app/core/utils/action-request-filter.util';
import { EmployeeService } from 'app/core/services/employee.service';
import { isLegacyRecord } from 'app/core/utils/legacy-source.util';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

export interface EngineeringAuditReview {
  id: string;
  projectName: string;
  projectNumber: string;
  formType: 'mtea' | 'mtve';
  discipline: string[];
  preparedBy: string;
  currentStep: number;
  status: 'draft' | 'in_review' | 'pe_response' | 'reviewer_followup' | 'tl_review' | 'di_acknowledge' | 'completed' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
  isLegacy: boolean;
  reviewer?: string;
  teamLead?: string;
  director?: string;
  reviewedBy: string;
  respondedBy: string;
  signedBy: string;
  clientProjectManagerSignedBy: string;
  acknowledgedBy: string;
  reviewedByStatus: string;
  respondedByStatus: string;
  signedByStatus: string;
  clientProjectManagerSignedByStatus: string;
  acknowledgedByStatus: string;
}

@Component({
  selector: 'app-engineering-audit-review-list',
  standalone: true,
  imports: [
        ListTableSortModule,
    CommonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatPaginatorModule,
    MatTableModule,
    PurchaseFormsFilterComponent,
  ],
  templateUrl: './engineering-audit-review-list.component.html',
  styleUrls: ['./engineering-audit-review-list.component.scss'],
})
export class EngineeringAuditReviewListComponent implements OnInit {
    listSort: ListSortEvent = { column: 0, dir: 'desc' };
  private readonly apiKey = 'engineeringAuditReview' as const;
  readonly navigationPermissionService = inject(NavigationPermissionService);
  readonly permissionNavId = 'engineering-audit-review';
  readonly pageTitle = 'Engineering Audit Review';
  readonly pageSubtitle = 'Manage and track engineering audit reviews';
  readonly itemLabel = 'engineering audit reviews';

  displayedColumns: string[] = [
    'projectNumber',
    'project',
    'discipline',
    'createdAt',
    'teamEngineer',
    'reviewer',
    'teamlead',
    'director',
    'status',
    'actions',
  ];

  actionDisplayedColumns: string[] = [
    'projectNumber',
    'project',
    'discipline',
    'createdAt',
    'teamEngineer',
    'reviewer',
    'teamlead',
    'director',
    'status',
    'action',
  ];

  private readonly pageColumns = [
    { data: 'id' },
    { data: 'project_number' },
    { data: 'project_name' },
    { data: 'form_type' },
    { data: 'discipline' },
    { data: 'created_at' },
    { data: 'prepared_by' },
    { data: 'reviewed_by' },
    { data: 'responded_by' },
    { data: 'signed_by' },
    { data: 'client_project_manager_signed_by' },
    { data: 'acknowledged_by' },
    { data: 'status' },
    { data: 'updated_at' },
  ];

  reviews: EngineeringAuditReview[] = [];
  filteredReviews: EngineeringAuditReview[] = [];
  loading = false;
  currentTab: 'all' | 'my' | 'pending' | 'action' = 'all';
  viewMode: 'card' | 'table' = 'table';
  showFilterPanel = false;
  searchTerm = '';
  statusFilter = '';
  formTypeFilter = '';
  totalRecords = 0;
  pageSize = 10;
  pageIndex = 0;
  allRecordsCount = 0;
  employeeLookupMap = new Map<string, string>();

  filterConfig: PurchaseFormsFilterConfig = {
    searchLabel: 'Search Engineering Audit Reviews',
    searchPlaceholder: 'Search by project, prepared by, reviewer...',
    statusFilterLabel: 'Filter by Status',
    statusOptions: [
      { value: 'draft', label: 'Draft' },
      { value: 'in_review', label: 'In Review' },
      { value: 'pe_response', label: 'PE Response' },
      { value: 'reviewer_followup', label: 'Reviewer Follow-up' },
      { value: 'tl_review', label: 'TL Review' },
      { value: 'di_acknowledge', label: 'DI Acknowledge' },
      { value: 'completed', label: 'Completed' },
      { value: 'rejected', label: 'Rejected' },
    ],
    statusLabelFn: (value: string) => this.getStatusText(value),
    thirdFilterLabel: 'Filter by Form Type',
    thirdFilterOptions: [
      { value: 'mtea', label: 'MTEA-01' },
      { value: 'mtve', label: 'MTVE-01' },
    ],
    showThirdFilter: true,
  };

  constructor(
    private router: Router,
    private snackBar: MatSnackBar,
    private fuseConfirmationService: FuseConfirmationService,
    private projectReviewApi: ProjectReviewApiService,
    private employeeService: EmployeeService
  ) {}

  ngOnInit(): void {
    if (!this.navigationPermissionService.hasViewAllPermissionByNavId(this.permissionNavId)) {
      this.currentTab = 'my';
    }
    this.refreshCurrentView(false);
  }

  private loadAllReviewsViaPage(silent: boolean = false): void {
    if (!silent) this.loading = true;
    this.projectReviewApi.page(this.apiKey, {
      draw: 1,
      columns: this.pageColumns,
      order: [this.listSort],
      start: 0,
      length: 1000,
      search: {
        value: this.searchTerm.trim(),
        regex: false,
      },
      status: this.statusFilter || '',
      form_type: this.formTypeFilter || '',
    }).pipe(finalize(() => {
      if (!silent) this.loading = false;
    })).subscribe({
      next: (response) => {
        const items = Array.isArray(response?.data) ? response.data : [];
        mergeProjectReviewEmployeeLookup(items, this.employeeLookupMap);
        this.reviews = items.map((item) => this.mapReview(item));
        this.updateFilterConfigFrom(this.reviews);
        this.allRecordsCount = Number(response?.recordsFiltered ?? this.reviews.length);
        this.resolveEmployeeNames(this.reviews);
        if (!silent) {
          this.applyClientFilters(false);
        }
      },
      error: (error) => {
        console.error('Error loading engineering audit reviews:', error);
        this.reviews = [];
        this.allRecordsCount = 0;
        if (!silent) {
          this.applyClientFilters(false);
          this.snackBar.open('Failed to load engineering audit reviews', 'Close', { duration: 3000 });
        }
      },
    });
  }

  private updateFilterConfigFrom(items: EngineeringAuditReview[]): void {
    if (!items?.length) return;
    const formTypes = [...new Set(items.map((item) => item.formType).filter(Boolean))].sort();
    this.filterConfig = {
      ...this.filterConfig,
      thirdFilterOptions: formTypes.map((value) => ({ value, label: this.getFormTypeText(value) })),
    };
  }

  private resolveEmployeeNames(items: EngineeringAuditReview[]): void {
    const codes = new Set<string>();
    items.forEach((r) => {
      [
        r.preparedBy,
        r.reviewedBy,
        r.respondedBy,
        r.signedBy,
        r.clientProjectManagerSignedBy,
        r.acknowledgedBy,
      ].forEach((c) => {
        if (c && c !== '-') codes.add(String(c).trim());
      });
    });

    if (codes.size === 0) return;

    this.employeeService
      .ensureEmployeesInLookup(this.employeeLookupMap, Array.from(codes))
      .subscribe({
        next: (lookup) => {
          this.employeeLookupMap = new Map(lookup);
        },
      });
  }

  resolveName(code: string | number | undefined): string {
    if (!code || code === '-') return '-';
    const normalized = String(code).trim();
    return this.employeeLookupMap.get(normalized) || normalized;
  }

  private loadPagedReviews(): void {
    this.loading = true;
    this.projectReviewApi.page(this.apiKey, {
      draw: 1,
      columns: this.pageColumns,
      order: [this.listSort],
      start: this.pageIndex * this.pageSize,
      length: this.pageSize,
      search: {
        value: this.searchTerm.trim(),
        regex: false,
      },
      status: this.statusFilter || '',
      form_type: this.formTypeFilter || '',
    }).pipe(finalize(() => (this.loading = false))).subscribe({
      next: (response) => {
        const items = Array.isArray(response?.data) ? response.data : [];
        mergeProjectReviewEmployeeLookup(items, this.employeeLookupMap);
        this.filteredReviews = items.map((item) => this.mapReview(item));
        this.totalRecords = Number(response?.recordsFiltered ?? this.filteredReviews.length);
        this.resolveEmployeeNames(this.filteredReviews);
      },
      error: (error) => {
        console.error('Error loading engineering audit review page:', error);
        this.filteredReviews = [];
        this.totalRecords = 0;
        this.snackBar.open('Failed to load engineering audit reviews', 'Close', { duration: 3000 });
      },
    });
  }

  onTabChange(tab: 'all' | 'my' | 'pending' | 'action'): void {
    if (tab === 'all' && !this.navigationPermissionService.hasViewAllPermissionByNavId(this.permissionNavId)) tab = 'my';
    this.currentTab = tab;
    this.pageIndex = 0;
    this.refreshCurrentView(false);
  }

  onSearchTermChange(value: string): void { this.searchTerm = value || ''; this.refreshCurrentView(); }
  onStatusFilterChange(value: string): void { this.statusFilter = value || ''; this.refreshCurrentView(); }
  onThirdFilterChange(value: string): void { this.formTypeFilter = value || ''; this.refreshCurrentView(); }
  clearFilters(): void {
    this.searchTerm = '';
    this.statusFilter = '';
    this.formTypeFilter = '';
    this.closeFilterPanel();
    this.refreshCurrentView();
  }

  applyFilters(filters: PurchaseFormsFilterValues): void {
    this.searchTerm = filters.searchTerm || '';
    this.statusFilter = filters.statusFilter || '';
    this.formTypeFilter = filters.thirdFilter || '';
    this.closeFilterPanel();
    this.refreshCurrentView();
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

  private refreshCurrentView(resetPage: boolean = true): void {
    if (resetPage) {
      this.pageIndex = 0;
    }

    if (this.currentTab === 'all') {
      this.loadPagedReviews();
      this.loadAllReviewsViaPage(true);
      return;
    }

    this.loadAllReviewsViaPage();
  }

  private applyClientFilters(resetPage: boolean = true): void {
    const term = this.searchTerm.trim().toLowerCase();
    const userCode = getCurrentUserCode();
    this.filteredReviews = this.reviews.filter((review) => {
      let matchesTab = true;
      if (this.currentTab === 'my') matchesTab = this.isMyRequest(review, userCode);
      else if (this.currentTab === 'pending') matchesTab = this.isPendingItem(review) && this.isRelatedToCurrentUser(review, userCode);
      else if (this.currentTab === 'action') matchesTab = this.isActionItem(review);

      const matchesSearch =
        !term ||
        review.projectName.toLowerCase().includes(term) ||
        review.projectNumber.toLowerCase().includes(term) ||
        this.getDisciplineText(review.discipline).toLowerCase().includes(term) ||
        this.getFormTypeText(review.formType).toLowerCase().includes(term) ||
        this.resolveName(review.preparedBy).toLowerCase().includes(term) ||
        this.getTeamEngineer(review).toLowerCase().includes(term) ||
        this.getReviewer(review).toLowerCase().includes(term) ||
        this.getTeamlead(review).toLowerCase().includes(term) ||
        this.getDirector(review).toLowerCase().includes(term);
      const matchesStatus = !this.statusFilter || review.status === this.statusFilter;
      const matchesFormType = !this.formTypeFilter || review.formType === this.formTypeFilter;
      return matchesTab && matchesSearch && matchesStatus && matchesFormType;
    });
    this.totalRecords = this.filteredReviews.length;
    if (resetPage) this.pageIndex = 0;
  }

  get pagedReviews(): EngineeringAuditReview[] {
    if (this.currentTab === 'all') {
      return this.filteredReviews;
    }

    const start = this.pageIndex * this.pageSize;
    return this.filteredReviews.slice(start, start + this.pageSize);
  }

  get visibleReviews(): EngineeringAuditReview[] {
    return this.currentTab === 'action' ? this.filteredReviews : this.pagedReviews;
  }

  get currentDisplayedColumns(): string[] {
    return this.currentTab === 'action' ? this.actionDisplayedColumns : this.displayedColumns;
  }

  get filterTotalCount(): number {
    return this.allRecordsCount;
  }

  get filterFilteredCount(): number {
    return this.currentTab === 'all' ? this.totalRecords : this.filteredReviews.length;
  }

  get activeFilterCount(): number {
    return [this.searchTerm, this.statusFilter, this.formTypeFilter].filter((value) => !!value).length;
  }

  get filteredCount(): number {
    return this.currentTab === 'all' ? this.totalRecords : this.filteredReviews.length;
  }

  get listTitle(): string {
    if (this.currentTab === 'action') return 'Action Requests';
    if (this.currentTab === 'my') return 'My Engineering Audit Reviews';
    if (this.currentTab === 'pending') return 'My Pending Engineering Audit Reviews';
    return 'All Engineering Audit Reviews';
  }

  get listCountText(): string {
    if (this.currentTab === 'action') {
      return `${this.filteredReviews.length} action requests`;
    }

    return `${this.filteredCount} ${this.itemLabel}`;
  }

  get emptyTitle(): string {
    return this.currentTab === 'action' ? 'No action requests found' : 'No reviews found';
  }

  get emptyDescription(): string {
    if (this.currentTab === 'action') {
      return 'No action requests found. All reviews have been processed.';
    }

    if (this.currentTab === 'pending') {
      return 'No reviews are pending your action at the moment.';
    }

    if (this.currentTab === 'my') {
      return "You haven't created any reviews yet.";
    }

    return 'No engineering audit reviews have been created yet.';
  }

  canShowCreateEmptyButton(): boolean {
    return (this.currentTab === 'all' || this.currentTab === 'my') && !this.activeFilterCount;
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.refreshCurrentView(false);
  }

  get actionRequestCount(): number {
    return this.reviews.filter((review) => this.isActionItem(review)).length;
  }

  private isPendingItem(review: EngineeringAuditReview): boolean {
    return ['draft', 'in_review', 'pe_response', 'reviewer_followup', 'tl_review', 'di_acknowledge'].includes(review.status);
  }
  private isActionItem(review: EngineeringAuditReview): boolean {
    if (review.status === 'completed' || review.status === 'rejected') {
      return false;
    }

    const nextAction = this.getNextPendingAction(review);
    if (!nextAction) {
      return false;
    }

    const userCode = getCurrentUserCode();
    if (!userCode) {
      return false;
    }

    const responsibleUser = this.getResponsibleUserForAction(review, nextAction);
    return this.matchesCurrentUser(responsibleUser);
  }

  private isMyRequest(review: EngineeringAuditReview, userCode: string | null): boolean { return isMyRequestByUserCode({ ...review, prepared_by: review.preparedBy, create_by: review.preparedBy, filled_in_by: review.preparedBy }, userCode); }
  private isRelatedToCurrentUser(review: EngineeringAuditReview, userCode: string | null): boolean {
    if (!userCode) return false;
    return [
      review.preparedBy,
      review.reviewer,
      review.teamLead,
      review.director,
      review.reviewedBy,
      review.respondedBy,
      review.signedBy,
      review.clientProjectManagerSignedBy,
      review.acknowledgedBy,
    ].some((value) => this.matchesCurrentUser(value));
  }

  private matchesCurrentUser(value: unknown): boolean {
    const normalizedValue = String(value ?? '').trim().toLowerCase();
    return !!normalizedValue && this.getCurrentUserCandidateSet().has(normalizedValue);
  }

  private getCurrentUserCandidateSet(): Set<string> {
    const candidates = new Set<string>();
    const push = (value: unknown): void => {
      const normalized = String(value ?? '').trim().toLowerCase();
      if (normalized) {
        candidates.add(normalized);
      }
    };

    push(getCurrentUserCode());

    try {
      const userRawData = localStorage.getItem('user_raw_data');
      if (userRawData) {
        const userData = JSON.parse(userRawData);
        [
          userData.code,
          userData.employeeCode,
          userData.employee_code,
          userData.username,
          userData.userName,
          userData.id,
          userData.user_id,
          userData.employeeId,
          userData.employee_id,
        ].forEach(push);
      }
    } catch (error) {
      console.error('Error reading current user candidates:', error);
    }

    return candidates;
  }

  private getNextPendingAction(review: EngineeringAuditReview): string {
    if (!this.isApprovedStatus(review.reviewedByStatus)) {
      return 'reviewed_by_status';
    }
    if (!this.isApprovedStatus(review.respondedByStatus)) {
      return 'responded_by_status';
    }
    if (!this.isApprovedStatus(review.signedByStatus)) {
      return 'signed_by_status';
    }
    if (!this.isApprovedStatus(review.clientProjectManagerSignedByStatus)) {
      return 'client_project_manager_signed_by_status';
    }
    if (!this.isApprovedStatus(review.acknowledgedByStatus)) {
      return 'acknowledged_by_status';
    }
    return '';
  }

  private getResponsibleUserForAction(review: EngineeringAuditReview, action: string): string {
    switch (action) {
      case 'reviewed_by_status':
        return review.reviewedBy;
      case 'responded_by_status':
        return review.respondedBy;
      case 'signed_by_status':
        return review.signedBy;
      case 'client_project_manager_signed_by_status':
        return review.clientProjectManagerSignedBy;
      case 'acknowledged_by_status':
        return review.acknowledgedBy;
      default:
        return '';
    }
  }

  private isApprovedStatus(status: string): boolean {
    return ['approved', 'approve', 'signed', 'acknowledged', 'completed'].includes(
      String(status || '').trim().toLowerCase()
    );
  }

  getActionButtonLabel(review: EngineeringAuditReview): string {
    switch (this.getNextPendingAction(review)) {
      case 'reviewed_by_status':
        return 'Review';
      case 'responded_by_status':
        return 'Respond';
      case 'signed_by_status':
        return 'Verify Actions';
      case 'client_project_manager_signed_by_status':
        return 'Verify Feedback';
      case 'acknowledged_by_status':
        return 'Acknowledge';
      default:
        return 'Review';
    }
  }

  getDisplayStatusLabel(review: EngineeringAuditReview): string {
    return this.getDisplayStatusText(review);
  }

  getDisplayStatusText(review: EngineeringAuditReview): string {
    if (review.status === 'completed' || review.status === 'rejected') {
      return this.getStatusText(review.status);
    }

    const action = this.getNextPendingAction(review);
    switch (action) {
      case 'reviewed_by_status':
        return `Pending Review (${this.resolveName(review.reviewedBy) || '-'})`;
      case 'responded_by_status':
        return `Pending Response (${this.resolveName(review.respondedBy) || '-'})`;
      case 'signed_by_status':
        return `Pending Action Verification (${this.resolveName(review.signedBy) || '-'})`;
      case 'client_project_manager_signed_by_status':
        return `Pending Feedback Verification (${this.resolveName(review.clientProjectManagerSignedBy) || '-'})`;
      case 'acknowledged_by_status':
        return `Pending Acknowledgment (${this.resolveName(review.acknowledgedBy) || '-'})`;
      default:
        return this.getStatusText(review.status);
    }
  }

  getTableStatusLabel(review: EngineeringAuditReview): string {
    if (review.status === 'rejected') {
      return 'Rejected';
    }

    if (review.status === 'completed' || !this.getNextPendingAction(review)) {
      return 'Complete';
    }

    switch (this.getNextPendingAction(review)) {
      case 'reviewed_by_status':
        return 'Reviewer to review';
      case 'responded_by_status':
        return 'TE to response';
      case 'signed_by_status':
        return 'Reviewer to approve';
      case 'client_project_manager_signed_by_status':
        return 'TL to approve';
      case 'acknowledged_by_status':
        return 'DI to acknowledge';
      default:
        return 'Pending';
    }
  }

  getTableStatusColor(review: EngineeringAuditReview): string {
    const label = this.getTableStatusLabel(review);

    if (label === 'Complete') {
      return 'bg-green-100 text-green-800';
    }

    if (label === 'Rejected') {
      return 'bg-red-100 text-red-800';
    }

    return 'bg-yellow-100 text-yellow-800';
  }

  isPendingOwnerColumn(
    review: EngineeringAuditReview,
    column: 'teamEngineer' | 'reviewer' | 'teamlead' | 'director'
  ): boolean {
    const action = this.getNextPendingAction(review);

    if (!action || review.status === 'completed') {
      return false;
    }

    switch (action) {
      case 'responded_by_status':
        return column === 'teamEngineer';
      case 'reviewed_by_status':
      case 'signed_by_status':
        return column === 'reviewer';
      case 'client_project_manager_signed_by_status':
        return column === 'teamlead';
      case 'acknowledged_by_status':
        return column === 'director';
      default:
        return false;
    }
  }

  getTeamEngineer(review: EngineeringAuditReview): string {
    return this.resolveName(review.respondedBy && review.respondedBy !== '-' ? review.respondedBy : review.preparedBy);
  }

  getReviewer(review: EngineeringAuditReview): string {
    const action = this.getNextPendingAction(review);
    if (action === 'signed_by_status' && review.signedBy && review.signedBy !== '-') {
      return this.resolveName(review.signedBy);
    }

    return this.resolveName(review.reviewedBy && review.reviewedBy !== '-' ? review.reviewedBy : review.signedBy);
  }

  getTeamlead(review: EngineeringAuditReview): string {
    return this.resolveName(review.clientProjectManagerSignedBy);
  }

  getDirector(review: EngineeringAuditReview): string {
    return this.resolveName(review.acknowledgedBy);
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'in_review': return 'bg-blue-100 text-blue-800';
      case 'pe_response': return 'bg-yellow-100 text-yellow-800';
      case 'reviewer_followup': return 'bg-orange-100 text-orange-800';
      case 'tl_review': return 'bg-purple-100 text-purple-800';
      case 'di_acknowledge': return 'bg-indigo-100 text-indigo-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'draft': return 'Draft';
      case 'in_review': return 'In Review';
      case 'pe_response': return 'PE Response';
      case 'reviewer_followup': return 'Reviewer Follow-up';
      case 'tl_review': return 'TL Review';
      case 'di_acknowledge': return 'DI Acknowledge';
      case 'completed': return 'Completed';
      case 'rejected': return 'Rejected';
      default: return status;
    }
  }

  getFormTypeText(formType: string): string { return formType === 'mtea' ? 'MTEA-01' : 'MTVE-01'; }
  getStepText(step: number): string { return ['PE Create', 'Reviewer Review', 'PE Response', 'Reviewer Follow-up', 'TL Review', 'DI Acknowledge'][step - 1] || 'Unknown'; }
  formatDate(date: Date): string { return formatDateDisplay(date); }
  getDisciplineText(discipline: string[]): string {
    return Array.isArray(discipline) && discipline.length ? discipline.join(', ') : '-';
  }
  navigateToNew(): void { this.router.navigate(['/engineering-audit-review/new']); }
  navigateToView(id: string): void { this.viewReview(id); }
  navigateToEdit(id: string): void { this.editReview(id); }
  editReview(id: string): void { this.router.navigate(['/engineering-audit-review/edit', id]); }
  viewReview(id: string): void { this.router.navigate(['/engineering-audit-review/view', id]); }
  navigateToAction(reviewOrId: EngineeringAuditReview | string): void {
    const review = typeof reviewOrId === 'string'
      ? this.reviews.find((item) => item.id === reviewOrId) || this.filteredReviews.find((item) => item.id === reviewOrId)
      : reviewOrId;
    if (!review) return;

    const targetAction = this.getNextPendingAction(review) || 'reviewed_by_status';
    this.router.navigate(['/engineering-audit-review/action', review.id, targetAction]);
  }

  deleteReview(id: string): void {
    const confirmation = this.fuseConfirmationService.open({
      title: 'Delete engineering audit review',
      message: 'Are you sure you want to delete this engineering audit review? This action cannot be undone!',
      icon: { show: true, name: 'heroicons_outline:exclamation-triangle', color: 'warn' },
      actions: { confirm: { show: true, label: 'Delete', color: 'warn' }, cancel: { show: true, label: 'Cancel' } },
      dismissible: false,
    });
    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;
      this.projectReviewApi.delete(this.apiKey, id).subscribe({
        next: () => { this.reviews = this.reviews.filter((review) => review.id !== id); this.refreshCurrentView(false); this.snackBar.open('Review deleted successfully!', 'Close', { duration: 3000 }); },
        error: (error) => { console.error('Error deleting engineering audit review:', error); this.snackBar.open('Failed to delete review', 'Close', { duration: 3000 }); },
      });
    });
  }

  private mapReview(item: any): EngineeringAuditReview {
    const status = deriveEngineeringAuditStatus(item);
    const reviewedBy = pickString(item, 'reviewedBy', 'reviewed_by', 'reviewerForAction', 'reviewer_for_action') || '-';
    const respondedBy = pickString(item, 'respondedBy', 'responded_by') || '-';
    const signedBy = pickString(item, 'signedBy', 'signed_by', 'teamLeadForAction', 'team_lead_for_action') || '-';
    const clientProjectManagerSignedBy = pickString(
      item,
      'clientProjectManagerSignedBy',
      'client_project_manager_signed_by'
    ) || '-';
    const acknowledgedBy = pickString(item, 'acknowledgedBy', 'acknowledged_by', 'directorForAction', 'director_for_action') || '-';

    return {
      isLegacy: isLegacyRecord(item),
      id: pickString(item, 'id'),
      projectName: pickString(item, 'projectName', 'project_name', 'name') || '-',
      projectNumber: pickString(item, 'projectNumber', 'project_number', 'project_no') || '-',
      formType: (pickString(item, 'formType', 'form_type') || 'mtea').toLowerCase() === 'mtve' ? 'mtve' : 'mtea',
      discipline: pickStringArray(item, 'discipline').length
        ? pickStringArray(item, 'discipline')
        : [pickString(item, 'discipline', 'disciplineOther', 'discipline_other')].filter(Boolean),
      preparedBy: pickString(item, 'preparedBy', 'prepared_by', 'create_by', 'filled_in_by') || '-',
      currentStep: Number(item?.currentStep ?? item?.current_step) || this.deriveStepFromStatus(status),
      status,
      createdAt: pickDate(item, 'createdAt', 'created_at') ?? new Date(),
      updatedAt: pickDate(item, 'updatedAt', 'updated_at', 'createdAt', 'created_at') ?? new Date(),
      reviewer: reviewedBy !== '-' ? reviewedBy : undefined,
      teamLead: signedBy !== '-' ? signedBy : undefined,
      director: acknowledgedBy !== '-' ? acknowledgedBy : undefined,
      reviewedBy,
      respondedBy,
      signedBy,
      clientProjectManagerSignedBy,
      acknowledgedBy,
      reviewedByStatus: pickString(item, 'reviewedByStatus', 'reviewed_by_status') || '',
      respondedByStatus: pickString(item, 'respondedByStatus', 'responded_by_status') || '',
      signedByStatus: pickString(item, 'signedByStatus', 'signed_by_status') || '',
      clientProjectManagerSignedByStatus: pickString(
        item,
        'clientProjectManagerSignedByStatus',
        'client_project_manager_signed_by_status'
      ) || '',
      acknowledgedByStatus: pickString(item, 'acknowledgedByStatus', 'acknowledged_by_status') || '',
    };
  }

  private deriveStepFromStatus(status: EngineeringAuditReview['status']): number {
    switch (status) {
      case 'draft': return 1;
      case 'in_review': return 2;
      case 'pe_response': return 3;
      case 'reviewer_followup': return 4;
      case 'tl_review': return 5;
      default: return 6;
    }
  }
    onListSortChange(event: ListSortEvent): void {
        this.listSort = event;
        this.pageIndex = 0;
        this.refreshCurrentView();
    }
}
