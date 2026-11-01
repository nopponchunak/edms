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
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

export interface LeedReviewItem {
  id: string;
  projectName: string;
  projectNumber: string;
  formType: 'mtlc';
  projectStage: string[];
  preparedBy: string;
  currentStep: number;
  status: 'draft' | 'in_review' | 'pe_response' | 'reviewer_followup' | 'tl_review' | 'di_acknowledge' | 'completed' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
  reviewer?: string;
  teamLead?: string;
  director?: string;
  reviewedBy: string;
  respondedBy: string;
  signedBy: string;
  signedByTL: string;
  acknowledgedBy: string;
  reviewedByStatus: string;
  respondedByStatus: string;
  signedByStatus: string;
  signedByTLStatus: string;
  acknowledgedByStatus: string;
}

@Component({
  selector: 'app-leed-review-list',
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
  templateUrl: './leed-review-list.component.html',
  styleUrls: ['./leed-review-list.component.scss'],
})
export class LeedReviewListComponent implements OnInit {
    listSort: ListSortEvent = { column: 0, dir: 'desc' };
  private readonly apiKey = 'leedReview' as const;
  readonly navigationPermissionService = inject(NavigationPermissionService);
  readonly permissionNavId = 'leed-review';
  readonly pageTitle = 'LEED Review';
  readonly pageSubtitle = 'Manage and track LEED reviews';
  readonly itemLabel = 'LEED reviews';

  displayedColumns: string[] = [
    'projectNumber',
    'project',
    'projectStage',
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
    'projectStage',
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
    { data: 'project_stage' },
    { data: 'created_at' },
    { data: 'prepared_by' },
    { data: 'reviewed_by' },
    { data: 'responded_by' },
    { data: 'signed_by' },
    { data: 'signed_by_tl' },
    { data: 'acknowledged_by' },
    { data: 'status' },
    { data: 'updated_at' },
  ];

  reviews: LeedReviewItem[] = [];
  filteredReviews: LeedReviewItem[] = [];
  loading = false;
  currentTab: 'all' | 'my' | 'pending' | 'action' = 'all';
  viewMode: 'card' | 'table' = 'table';
  showFilterPanel = false;
  searchTerm = '';
  statusFilter = '';
  projectStageFilter = '';
  totalRecords = 0;
  pageSize = 10;
  pageIndex = 0;
  allRecordsCount = 0;
  employeeLookupMap = new Map<string, string>();

  filterConfig: PurchaseFormsFilterConfig = {
    searchLabel: 'Search LEED Reviews',
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
    thirdFilterLabel: 'Filter by Project Stage',
    thirdFilterOptions: [],
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
      project_stage: this.projectStageFilter || '',
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
        console.error('Error loading LEED reviews:', error);
        this.reviews = [];
        this.allRecordsCount = 0;
        if (!silent) {
          this.applyClientFilters(false);
          this.snackBar.open('Failed to load LEED reviews', 'Close', { duration: 3000 });
        }
      },
    });
  }

  private updateFilterConfigFrom(items: LeedReviewItem[]): void {
    const projectStages = [
      ...new Set(
        items
          .map((item) => this.getProjectStageText(item.projectStage))
          .filter((value) => value && value !== '-')
      ),
    ].sort();
    this.filterConfig = {
      ...this.filterConfig,
      thirdFilterOptions: projectStages.map((value) => ({ value, label: value })),
    };
  }

  private resolveEmployeeNames(items: LeedReviewItem[]): void {
    const codes = new Set<string>();
    items.forEach((r) => {
      [
        r.preparedBy,
        r.reviewedBy,
        r.respondedBy,
        r.signedBy,
        r.signedByTL,
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
      project_stage: this.projectStageFilter || '',
    }).pipe(finalize(() => (this.loading = false))).subscribe({
      next: (response) => {
        const items = Array.isArray(response?.data) ? response.data : [];
        mergeProjectReviewEmployeeLookup(items, this.employeeLookupMap);
        this.filteredReviews = items.map((item) => this.mapReview(item));
        this.totalRecords = Number(response?.recordsFiltered ?? this.filteredReviews.length);
        this.resolveEmployeeNames(this.filteredReviews);
      },
      error: (error) => {
        console.error('Error loading LEED review page:', error);
        this.filteredReviews = [];
        this.totalRecords = 0;
        this.snackBar.open('Failed to load LEED reviews', 'Close', { duration: 3000 });
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
  onThirdFilterChange(value: string): void { this.projectStageFilter = value || ''; this.refreshCurrentView(); }
  clearFilters(): void {
    this.searchTerm = '';
    this.statusFilter = '';
    this.projectStageFilter = '';
    this.closeFilterPanel();
    this.refreshCurrentView();
  }

  applyFilters(filters: PurchaseFormsFilterValues): void {
    this.searchTerm = filters.searchTerm || '';
    this.statusFilter = filters.statusFilter || '';
    this.projectStageFilter = filters.thirdFilter || '';
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
        this.getProjectStageText(review.projectStage).toLowerCase().includes(term) ||
        this.resolveName(review.preparedBy).toLowerCase().includes(term) ||
        this.getTeamEngineer(review).toLowerCase().includes(term) ||
        this.getReviewer(review).toLowerCase().includes(term) ||
        this.getTeamlead(review).toLowerCase().includes(term) ||
        this.getDirector(review).toLowerCase().includes(term);
      const matchesStatus = !this.statusFilter || review.status === this.statusFilter;
      const matchesProjectStage =
        !this.projectStageFilter || this.getProjectStageText(review.projectStage) === this.projectStageFilter;
      return matchesTab && matchesSearch && matchesStatus && matchesProjectStage;
    });
    this.totalRecords = this.filteredReviews.length;
    if (resetPage) this.pageIndex = 0;
  }

  get pagedReviews(): LeedReviewItem[] {
    if (this.currentTab === 'all') {
      return this.filteredReviews;
    }

    const start = this.pageIndex * this.pageSize;
    return this.filteredReviews.slice(start, start + this.pageSize);
  }

  get visibleReviews(): LeedReviewItem[] {
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
    return [this.searchTerm, this.statusFilter, this.projectStageFilter].filter((value) => !!value).length;
  }

  get filteredCount(): number {
    return this.currentTab === 'all' ? this.totalRecords : this.filteredReviews.length;
  }

  get listTitle(): string {
    if (this.currentTab === 'action') return 'Action Requests';
    if (this.currentTab === 'my') return 'My LEED Reviews';
    if (this.currentTab === 'pending') return 'My Pending LEED Reviews';
    return 'All LEED Reviews';
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

    return 'No LEED reviews have been created yet.';
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

  private isPendingItem(review: LeedReviewItem): boolean {
    return ['draft', 'in_review', 'pe_response', 'reviewer_followup', 'tl_review', 'di_acknowledge'].includes(review.status);
  }
  private isActionItem(review: LeedReviewItem): boolean {
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

  private isMyRequest(review: LeedReviewItem, userCode: string | null): boolean { return isMyRequestByUserCode({ ...review, prepared_by: review.preparedBy, create_by: review.preparedBy, filled_in_by: review.preparedBy }, userCode); }
  private isRelatedToCurrentUser(review: LeedReviewItem, userCode: string | null): boolean {
    if (!userCode) return false;
    return [
      review.preparedBy,
      review.reviewer,
      review.teamLead,
      review.director,
      review.reviewedBy,
      review.respondedBy,
      review.signedBy,
      review.signedByTL,
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

  private getNextPendingAction(review: LeedReviewItem): string {
    if (!this.isApprovedStatus(review.reviewedByStatus)) {
      return 'reviewed_by_status';
    }
    if (!this.isApprovedStatus(review.respondedByStatus)) {
      return 'responded_by_status';
    }
    if (!this.isApprovedStatus(review.signedByStatus)) {
      return 'signed_by_status';
    }
    if (!this.isApprovedStatus(review.signedByTLStatus)) {
      return 'signed_by_tl_status';
    }
    if (!this.isApprovedStatus(review.acknowledgedByStatus)) {
      return 'acknowledged_by_status';
    }
    return '';
  }

  private getResponsibleUserForAction(review: LeedReviewItem, action: string): string {
    switch (action) {
      case 'reviewed_by_status':
        return review.reviewedBy;
      case 'responded_by_status':
        return review.respondedBy;
      case 'signed_by_status':
        return review.signedBy;
      case 'signed_by_tl_status':
        return review.signedByTL;
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

  getActionButtonLabel(review: LeedReviewItem): string {
    switch (this.getNextPendingAction(review)) {
      case 'reviewed_by_status':
        return 'Review';
      case 'responded_by_status':
        return 'Respond';
      case 'signed_by_status':
        return 'Sign';
      case 'signed_by_tl_status':
        return 'TL Sign';
      case 'acknowledged_by_status':
        return 'Acknowledge';
      default:
        return 'Review';
    }
  }

  getDisplayStatusLabel(review: LeedReviewItem): string {
    return this.getDisplayStatusText(review);
  }

  getDisplayStatusText(review: LeedReviewItem): string {
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
        return `Pending Signing (${this.resolveName(review.signedBy) || '-'})`;
      case 'signed_by_tl_status':
        return `Pending TL Signing (${this.resolveName(review.signedByTL) || '-'})`;
      case 'acknowledged_by_status':
        return `Pending Acknowledgment (${this.resolveName(review.acknowledgedBy) || '-'})`;
      default:
        return this.getStatusText(review.status);
    }
  }

  getTableStatusLabel(review: LeedReviewItem): string {
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
      case 'signed_by_tl_status':
        return 'TL to acknowledge';
      case 'acknowledged_by_status':
        return 'DI to acknowledge';
      default:
        return 'Pending';
    }
  }

  getTableStatusColor(review: LeedReviewItem): string {
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
    review: LeedReviewItem,
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
      case 'signed_by_tl_status':
        return column === 'teamlead';
      case 'acknowledged_by_status':
        return column === 'director';
      default:
        return false;
    }
  }

  getTeamEngineer(review: LeedReviewItem): string {
    return this.resolveName(review.respondedBy && review.respondedBy !== '-' ? review.respondedBy : review.preparedBy);
  }

  getReviewer(review: LeedReviewItem): string {
    const action = this.getNextPendingAction(review);
    if (action === 'signed_by_status' && review.signedBy && review.signedBy !== '-') {
      return this.resolveName(review.signedBy);
    }

    return this.resolveName(review.reviewedBy && review.reviewedBy !== '-' ? review.reviewedBy : review.signedBy);
  }

  getTeamlead(review: LeedReviewItem): string {
    return this.resolveName(review.signedByTL);
  }

  getDirector(review: LeedReviewItem): string {
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

  getFormTypeText(_formType: string): string { return 'MTLC-01'; }
  getStepText(step: number): string { return ['PE Create', 'Reviewer Review', 'PE Response', 'Reviewer Follow-up', 'TL Review', 'DI Acknowledge'][step - 1] || 'Unknown'; }
  formatDate(date: Date): string { return formatDateDisplay(date); }
  getProjectStageText(projectStage: string[]): string {
    return Array.isArray(projectStage) && projectStage.length ? projectStage.join(', ') : '-';
  }
  navigateToNew(): void { this.router.navigate(['/leed-review/new']); }
  navigateToView(id: string): void { this.viewReview(id); }
  navigateToEdit(id: string): void { this.editReview(id); }
  editReview(id: string): void { this.router.navigate(['/leed-review/edit', id]); }
  viewReview(id: string): void { this.router.navigate(['/leed-review/view', id]); }
  navigateToAction(reviewOrId: LeedReviewItem | string): void {
    const review = typeof reviewOrId === 'string'
      ? this.reviews.find((item) => item.id === reviewOrId) || this.filteredReviews.find((item) => item.id === reviewOrId)
      : reviewOrId;
    if (!review) return;

    const targetAction = this.getNextPendingAction(review) || 'reviewed_by_status';
    this.router.navigate(['/leed-review/action', review.id, targetAction]);
  }

  deleteReview(id: string): void {
    const confirmation = this.fuseConfirmationService.open({
      title: 'Delete LEED review',
      message: 'Are you sure you want to delete this LEED review? This action cannot be undone!',
      icon: { show: true, name: 'heroicons_outline:exclamation-triangle', color: 'warn' },
      actions: { confirm: { show: true, label: 'Delete', color: 'warn' }, cancel: { show: true, label: 'Cancel' } },
      dismissible: false,
    });
    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;
      this.projectReviewApi.delete(this.apiKey, id).subscribe({
        next: () => { this.reviews = this.reviews.filter((review) => review.id !== id); this.refreshCurrentView(false); this.snackBar.open('Review deleted successfully!', 'Close', { duration: 3000 }); },
        error: (error) => { console.error('Error deleting LEED review:', error); this.snackBar.open('Failed to delete review', 'Close', { duration: 3000 }); },
      });
    });
  }

  private mapReview(item: any): LeedReviewItem {
    const status = deriveEngineeringAuditStatus(item);
    const reviewedBy = pickString(item, 'reviewedBy', 'reviewed_by', 'reviewerForAction', 'reviewer_for_action') || '-';
    const respondedBy = pickString(item, 'respondedBy', 'responded_by') || '-';
    const signedBy = pickString(item, 'signedBy', 'signed_by') || '-';
    const signedByTL = pickString(
      item,
      'signedByTL',
      'signed_by_tl',
      'teamLeadForAction',
      'team_lead_for_action'
    ) || '-';
    const acknowledgedBy = pickString(item, 'acknowledgedBy', 'acknowledged_by', 'directorForAction', 'director_for_action') || '-';

    return {
      id: pickString(item, 'id'),
      projectName: pickString(item, 'projectName', 'project_name', 'name') || '-',
      projectNumber: pickString(item, 'projectNumber', 'project_number', 'project_no') || '-',
      formType: 'mtlc',
      projectStage: pickStringArray(item, 'projectStage', 'project_stage').length
        ? pickStringArray(item, 'projectStage', 'project_stage')
        : [pickString(item, 'projectStage', 'project_stage', 'projectStageOther', 'project_stage_other')].filter(Boolean),
      preparedBy: pickString(item, 'preparedBy', 'prepared_by', 'create_by', 'filled_in_by') || '-',
      currentStep: Number(item?.currentStep ?? item?.current_step) || this.deriveStepFromStatus(status),
      status,
      createdAt: pickDate(item, 'createdAt', 'created_at') ?? new Date(),
      updatedAt: pickDate(item, 'updatedAt', 'updated_at', 'createdAt', 'created_at') ?? new Date(),
      reviewer: reviewedBy !== '-' ? reviewedBy : undefined,
      teamLead: signedByTL !== '-' ? signedByTL : undefined,
      director: acknowledgedBy !== '-' ? acknowledgedBy : undefined,
      reviewedBy,
      respondedBy,
      signedBy,
      signedByTL,
      acknowledgedBy,
      reviewedByStatus: pickString(item, 'reviewedByStatus', 'reviewed_by_status') || '',
      respondedByStatus: pickString(item, 'respondedByStatus', 'responded_by_status') || '',
      signedByStatus: pickString(item, 'signedByStatus', 'signed_by_status') || '',
      signedByTLStatus: pickString(
        item,
        'signedByTLStatus',
        'signed_by_tl_status',
        'signed_by_t_l_status'
      ) || '',
      acknowledgedByStatus: pickString(item, 'acknowledgedByStatus', 'acknowledged_by_status') || '',
    };
  }

  private deriveStepFromStatus(status: LeedReviewItem['status']): number {
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
