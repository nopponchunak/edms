import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import {
  deriveChecklistStatus,
  mergeProjectReviewEmployeeLookup,
  pickDate,
  pickString,
  pickStringArray,
  ProjectReviewApiService,
} from 'app/core/services/project-review-api.service';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { getCurrentUserCode, isMyRequestByUserCode } from 'app/core/utils/action-request-filter.util';
import { isLegacyRecord } from 'app/core/utils/legacy-source.util';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';
import {
  PurchaseFormsFilterComponent,
  PurchaseFormsFilterConfig,
  PurchaseFormsFilterValues,
} from 'app/core/components/purchase-forms-filter';

export interface ConstructionValidationItem {
  id: string;
  projectName: string;
  projectNumber: string;
  stage: string;
  preparedBy: string;
  preparedByCode: string;
  discipline: string;
  documentTypes: string[];
  status:
    | 'draft'
    | 'in-review'
    | 'responded'
    | 'signed'
    | 'acknowledged'
    | 'completed'
    | 'rejected';
  completedBy: string;
  completedByCode: string;
  respondedBy: string;
  respondedByCode: string;
  signedByTL: string;
  signedByTLCode: string;
  acknowledgedBy: string;
  acknowledgedByCode: string;
  reviewerForAction: string;
  teamLeadForAction: string;
  directorForAction: string;
  completedByStatus: string;
  respondedByStatus: string;
  signedByTLStatus: string;
  acknowledgedByTLStatus: string;
  acknowledgedByDIStatus: string;
  createdAt: Date;
  updatedAt: Date;
  isLegacy: boolean;
}

@Component({
  selector: 'app-construction-validation-list',
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
  templateUrl: './construction-validation-list.component.html',
  styleUrls: ['./construction-validation-list.component.scss'],
})
export class ConstructionValidationListComponent implements OnInit {
    listSort: ListSortEvent = { column: 0, dir: 'desc' };
  private readonly apiKey = 'constructionValidation' as const;
  readonly navigationPermissionService = inject(NavigationPermissionService);
  readonly permissionNavId = 'construction-validation';
  readonly pageTitle = 'Construction Validation';
  readonly pageSubtitle = 'MTDD-05 - Construction Validation Checklist/Action Sheet';
  readonly itemLabel = 'construction validations';

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
    { data: 'discipline' },
    { data: 'created_at' },
    { data: 'prepared_by' },
    { data: 'completed_by' },
    { data: 'responded_by' },
    { data: 'signed_by_tl' },
    { data: 'acknowledged_by_tl' },
    { data: 'acknowledged_by_di' },
    { data: 'status' },
    { data: 'updated_at' },
  ];

  loading = false;
  currentTab: 'all' | 'my' | 'pending' | 'action' = 'all';
  viewMode: 'card' | 'table' = 'table';
  showFilterPanel = false;
  searchTerm = '';
  statusFilter = '';
  thirdFilter = '';
  totalRecords = 0;
  pageSize = 10;
  pageIndex = 0;
  reviews: ConstructionValidationItem[] = [];
  filteredReviews: ConstructionValidationItem[] = [];
  allRecordsCount = 0;
  employeeLookupMap = new Map<string, string>();

  filterConfig: PurchaseFormsFilterConfig = {
    searchLabel: 'Search Construction Validation',
    searchPlaceholder: 'Search by project, prepared by, completed by...',
    statusFilterLabel: 'Filter by Status',
    statusOptions: [
      { value: 'draft', label: 'Draft' },
      { value: 'in-review', label: 'In Review' },
      { value: 'responded', label: 'Responded' },
      { value: 'signed', label: 'Signed' },
      { value: 'acknowledged', label: 'Acknowledged' },
      { value: 'completed', label: 'Completed' },
      { value: 'rejected', label: 'Rejected' },
    ],
    statusLabelFn: (value: string) => this.getStatusLabel(value),
    thirdFilterLabel: 'Filter by Discipline',
    thirdFilterOptions: [],
    showThirdFilter: true,
  };

  constructor(
    private router: Router,
    private fuseConfirmationService: FuseConfirmationService,
    private snackBar: MatSnackBar,
    private projectReviewApi: ProjectReviewApiService
  ) {}

  ngOnInit(): void {
    if (!this.navigationPermissionService.hasViewAllPermissionByNavId(this.permissionNavId)) {
      this.currentTab = 'my';
    }
    this.refreshCurrentView(false);
  }

  private loadAllReviewsViaPage(silent: boolean = false): void {
    if (!silent) this.loading = true;
    this.projectReviewApi
      .page(this.apiKey, {
        draw: 1,
        columns: this.pageColumns,
        order: [this.listSort],
        start: 0,
        length: 1000,
        search: {
          value: this.searchTerm.trim(),
          regex: false,
        },
        discipline: this.thirdFilter || '',
        status: this.statusFilter || '',
      })
      .pipe(finalize(() => {
        if (!silent) this.loading = false;
      }))
      .subscribe({
        next: (response) => {
          const items = Array.isArray(response?.data) ? response.data : [];
          mergeProjectReviewEmployeeLookup(items, this.employeeLookupMap);
          this.reviews = items.map((item) => this.mapReview(item));
          this.allRecordsCount = Number(response?.recordsFiltered ?? this.reviews.length);
          this.updateFilterConfigFrom(this.reviews);
          if (!silent) {
            this.applyClientFilters(false);
          }
        },
        error: (error) => {
          console.error('Error loading construction validations:', error);
          this.reviews = [];
          this.allRecordsCount = 0;
          if (!silent) {
            this.applyClientFilters(false);
            this.loading = false;
            this.snackBar.open('Failed to load construction validations.', 'Close', { duration: 3000 });
          }
        },
      });
  }

  onTabChange(tab: 'all' | 'my' | 'pending' | 'action'): void {
    if (tab === 'all' && !this.navigationPermissionService.hasViewAllPermissionByNavId(this.permissionNavId)) {
      tab = 'my';
    }
    this.currentTab = tab;
    this.pageIndex = 0;
    this.refreshCurrentView(false);
  }

  onSearchTermChange(value: string): void {
    this.searchTerm = value || '';
    this.refreshCurrentView();
  }

  onStatusFilterChange(value: string): void {
    this.statusFilter = value || '';
    this.refreshCurrentView();
  }

  onThirdFilterChange(value: string): void {
    this.thirdFilter = value || '';
    this.refreshCurrentView();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.statusFilter = '';
    this.thirdFilter = '';
    this.closeFilterPanel();
    this.refreshCurrentView();
  }

  applyFilters(filters: PurchaseFormsFilterValues): void {
    this.searchTerm = filters.searchTerm || '';
    this.statusFilter = filters.statusFilter || '';
    this.thirdFilter = filters.thirdFilter || '';
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

    this.loadDataAfterLookup();
  }

  private loadDataAfterLookup(): void {
    if (this.currentTab === 'all') {
      this.loadPagedReviews();
      this.loadAllReviewsViaPage(true);
      return;
    }

    this.loadAllReviewsViaPage();
  }

  private loadPagedReviews(): void {
    this.loading = true;

    this.projectReviewApi
      .page(this.apiKey, {
        draw: 1,
        columns: this.pageColumns,
        order: [this.listSort],
        start: this.pageIndex * this.pageSize,
        length: this.pageSize,
        search: {
          value: this.searchTerm.trim(),
          regex: false,
        },
        discipline: this.thirdFilter || '',
        status: this.statusFilter || '',
      })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          const items = Array.isArray(response?.data) ? response.data : [];
          mergeProjectReviewEmployeeLookup(items, this.employeeLookupMap);
          this.filteredReviews = items.map((item) => this.mapReview(item));
          this.totalRecords = Number(response?.recordsFiltered ?? this.filteredReviews.length);
        },
        error: (error) => {
          console.error('Error loading construction validation page:', error);
          this.filteredReviews = [];
          this.totalRecords = 0;
          this.snackBar.open('Failed to load construction validations.', 'Close', {
            duration: 3000,
          });
        },
      });
  }

  private applyClientFilters(resetPage: boolean = true): void {
    const term = this.searchTerm.trim().toLowerCase();
    const userCode = getCurrentUserCode();

    this.filteredReviews = this.reviews.filter((review) => {
      let matchesTab = true;
      if (this.currentTab === 'my') {
        matchesTab = this.isMyRequest(review, userCode);
      } else if (this.currentTab === 'pending') {
        matchesTab = this.isPendingItem(review) && this.isRelatedToCurrentUser(review, userCode);
      } else if (this.currentTab === 'action') {
        matchesTab = this.isActionItem(review) && this.isRelatedToCurrentUser(review, userCode);
      }

      const matchesSearch =
        !term ||
        review.projectName.toLowerCase().includes(term) ||
        review.projectNumber.toLowerCase().includes(term) ||
        review.stage.toLowerCase().includes(term) ||
        review.preparedBy.toLowerCase().includes(term) ||
        review.completedBy.toLowerCase().includes(term) ||
        review.respondedBy.toLowerCase().includes(term) ||
        this.getTeamEngineer(review).toLowerCase().includes(term) ||
        this.getReviewer(review).toLowerCase().includes(term) ||
        this.getTeamlead(review).toLowerCase().includes(term) ||
        this.getDirector(review).toLowerCase().includes(term);
      const matchesStatus = !this.statusFilter || review.status === this.statusFilter;
      const matchesThird = !this.thirdFilter || this.getThirdFilterValue(review) === this.thirdFilter;

      return matchesTab && matchesSearch && matchesStatus && matchesThird;
    });

    this.totalRecords = this.filteredReviews.length;
    if (resetPage) {
      this.pageIndex = 0;
    }
  }

  get pagedReviews(): ConstructionValidationItem[] {
    if (this.currentTab === 'all') {
      return this.filteredReviews;
    }

    const start = this.pageIndex * this.pageSize;
    return this.filteredReviews.slice(start, start + this.pageSize);
  }

  get visibleReviews(): ConstructionValidationItem[] {
    return this.currentTab === 'action' ? this.filteredReviews : this.pagedReviews;
  }

  get currentDisplayedColumns(): string[] {
    return this.currentTab === 'action' ? this.actionDisplayedColumns : this.displayedColumns;
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;

    if (this.currentTab === 'all') {
      this.loadPagedReviews();
    }
  }

  get filterTotalCount(): number {
    return this.allRecordsCount;
  }

  get filterFilteredCount(): number {
    return this.currentTab === 'all' ? this.totalRecords : this.filteredReviews.length;
  }

  get actionRequestCount(): number {
    const userCode = getCurrentUserCode();
    return this.reviews.filter((review) => this.isActionItem(review) && this.isRelatedToCurrentUser(review, userCode)).length;
  }

  get activeFilterCount(): number {
    return [this.searchTerm, this.statusFilter, this.thirdFilter].filter((value) => !!value).length;
  }

  get filteredCount(): number {
    return this.currentTab === 'all' ? this.totalRecords : this.filteredReviews.length;
  }

  get listTitle(): string {
    if (this.currentTab === 'action') return 'Action Requests';
    if (this.currentTab === 'my') return 'My Construction Validations';
    if (this.currentTab === 'pending') return 'My Pending Construction Validations';
    return 'All Construction Validations';
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

    return 'No reviews have been created yet.';
  }

  canShowCreateEmptyButton(): boolean {
    return (this.currentTab === 'all' || this.currentTab === 'my') && !this.activeFilterCount;
  }

  private isPendingItem(review: ConstructionValidationItem): boolean {
    return ['draft', 'in-review', 'responded', 'signed', 'acknowledged'].includes(review.status);
  }

  isActionItem(review: any): boolean {
    const userCode = getCurrentUserCode();
    if (!userCode) return false;

    const actionType = this.getActionType(review);
    if (!actionType) return false;

    const assignee = this.getActionAssignee(review, actionType);
    return String(assignee || '').trim().toLowerCase() === String(userCode || '').trim().toLowerCase();
  }

  getActionType(review: any): string | null {
    if (review.status === 'completed' || review.status === 'rejected' || review.status === 'draft') return null;

    const isApproved = (s: string) => ['approved', 'approve', 'signed', 'acknowledged'].includes(String(s || '').trim().toLowerCase());

    // 1. Completion (TL)
    if (!isApproved(review.completedByStatus)) return 'completed_by_status';

    // 2. Response (PE)
    if (!isApproved(review.respondedByStatus)) return 'responded_by_status';

    // 3. Sign (TL)
    if (!isApproved(review.signedByTLStatus)) return 'signed_by_t_l_status';

    // 4. Acknowledge (TL)
    if (!isApproved(review.acknowledgedByTLStatus)) return 'acknowledged_by_tl_status';

    // 5. Acknowledge (DI)
    if (!isApproved(review.acknowledgedByDIStatus)) return 'acknowledged_by_di_status';

    return null;
  }

  private isMyRequest(review: ConstructionValidationItem, userCode: string | null): boolean {
    return isMyRequestByUserCode(
      {
        ...review,
        prepared_by: review.preparedByCode,
        create_by: review.preparedByCode,
        filled_in_by: review.preparedByCode,
      },
      userCode
    );
  }

  private isRelatedToCurrentUser(review: ConstructionValidationItem, userCode: string | null): boolean {
    if (!userCode) return false;
    const target = userCode.trim().toLowerCase();

    return [
      review.preparedByCode,
      review.completedByCode,
      review.respondedByCode,
      review.signedByTLCode,
      review.acknowledgedByCode,
      review.reviewerForAction,
      review.teamLeadForAction,
      review.directorForAction,
    ].some((value) => String(value ?? '').trim().toLowerCase() === target);
  }

  private getThirdFilterValue(review: ConstructionValidationItem): string {
    return String(review.discipline ?? '');
  }

  updateFilterConfigFrom(items: ConstructionValidationItem[]): void {
    const options = Array.from(new Set(items.map((item) => this.getThirdFilterValue(item)).filter(Boolean))).sort();
    this.filterConfig.thirdFilterOptions = options.map((value) => ({ value, label: value }));
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'in-review':
      case 'in_review':
        return 'bg-blue-100 text-blue-800';
      case 'responded':
        return 'bg-yellow-100 text-yellow-800';
      case 'signed':
        return 'bg-purple-100 text-purple-800';
      case 'acknowledged':
        return 'bg-indigo-100 text-indigo-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  getDisplayStatusLabel(review: ConstructionValidationItem): string {
    if (review.status === 'completed' || review.status === 'rejected' || review.status === 'draft') {
      return this.getStatusLabel(review.status);
    }

    const nextAction = this.getNextPendingAction(review);
    if (!nextAction) return this.getStatusLabel(review.status);

    let stepLabel = '';
    let person = '';

    switch (nextAction) {
      case 'completed_by_status':
        stepLabel = 'Pending Review';
        person = this.getEmployeeName(review.completedByCode || review.preparedByCode);
        break;
      case 'responded_by_status':
        stepLabel = 'Pending Response (PE)';
        person = this.getEmployeeName(review.respondedByCode || review.preparedByCode);
        break;
      case 'signed_by_tl_status':
      case 'signed_by_t_l_status':
        stepLabel = 'Pending Approval by Reviewer';
        person = this.getEmployeeName(review.signedByTLCode || review.completedByCode);
        break;
      case 'acknowledged_by_tl_status':
        stepLabel = 'Pending Acknowledge (TL)';
        person = this.getEmployeeName(review.acknowledgedByCode);
        break;
      case 'acknowledged_by_di_status':
        stepLabel = 'Pending Acknowledge (DI)';
        person = this.getEmployeeName(review.directorForAction);
        break;
      default:
        return this.getStatusLabel(review.status);
    }

    return `${stepLabel} (${person || 'Unassigned'})`;
  }

  getTableStatusLabel(review: ConstructionValidationItem): string {
    if (review.status === 'rejected') {
      return 'Rejected';
    }

    if (review.status === 'completed' || !this.getNextPendingAction(review)) {
      return 'Complete';
    }

    switch (this.getNextPendingAction(review)) {
      case 'completed_by_status':
        return 'Reviewer to review';
      case 'responded_by_status':
        return 'TE to response';
      case 'signed_by_tl_status':
      case 'signed_by_t_l_status':
        return 'Reviewer to approve';
      case 'acknowledged_by_tl_status':
        return 'TL to acknowledge';
      case 'acknowledged_by_di_status':
        return 'DI to acknowledge';
      default:
        return 'Pending';
    }
  }

  getTableStatusColor(review: ConstructionValidationItem): string {
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
    review: ConstructionValidationItem,
    column: 'teamEngineer' | 'reviewer' | 'teamlead' | 'director'
  ): boolean {
    const action = this.getNextPendingAction(review);

    if (!action || review.status === 'completed') {
      return false;
    }

    switch (action) {
      case 'responded_by_status':
        return column === 'teamEngineer';
      case 'completed_by_status':
        return column === 'reviewer';
      case 'signed_by_tl_status':
      case 'signed_by_t_l_status':
        return column === 'reviewer';
      case 'acknowledged_by_tl_status':
        return column === 'teamlead';
      case 'acknowledged_by_di_status':
        return column === 'director';
      default:
        return false;
    }
  }

  getTeamEngineer(review: ConstructionValidationItem): string {
    return review.respondedBy && review.respondedBy !== '-'
      ? review.respondedBy
      : review.preparedBy || '-';
  }

  getReviewer(review: ConstructionValidationItem): string {
    const action = this.getNextPendingAction(review);

    if ((action === 'signed_by_tl_status' || action === 'signed_by_t_l_status') && review.signedByTL && review.signedByTL !== '-') {
      return review.signedByTL;
    }

    return review.completedBy && review.completedBy !== '-'
      ? review.completedBy
      : this.getEmployeeName(review.signedByTLCode || review.completedByCode || review.preparedByCode) || '-';
  }

  getTeamlead(review: ConstructionValidationItem): string {
    const action = this.getNextPendingAction(review);

    if (action === 'acknowledged_by_tl_status' && review.acknowledgedBy && review.acknowledgedBy !== '-') {
      return review.acknowledgedBy;
    }

    if (review.acknowledgedBy && review.acknowledgedBy !== '-') {
      return review.acknowledgedBy;
    }

    return this.getEmployeeName(review.acknowledgedByCode || review.teamLeadForAction) || '-';
  }

  getDirector(review: ConstructionValidationItem): string {
    return this.getEmployeeName(review.directorForAction) || '-';
  }

  getNextPendingAction(review: ConstructionValidationItem): string | null {
    return this.getActionType(review);
  }

  getActionAssignee(review: any, actionType: string): string {
    switch (actionType) {
      case 'completed_by_status': return review.completedByCode || review.preparedByCode;
      case 'responded_by_status': return review.respondedByCode || review.preparedByCode;
      case 'signed_by_tl_status': return review.signedByTLCode || review.completedByCode;
      case 'signed_by_t_l_status': return review.signedByTLCode || review.completedByCode;
      case 'acknowledged_by_tl_status': return review.acknowledgedByCode;
      case 'acknowledged_by_di_status': return review.directorForAction;
      default: return '';
    }
  }

  getActionButtonLabel(review: ConstructionValidationItem): string {
    const action = this.getNextPendingAction(review);
    switch (action) {
      case 'completed_by_status': return 'Approve By Reviewer';
      case 'responded_by_status': return 'Respond Action (PE)';
      case 'signed_by_tl_status': return 'Approve By Reviewer';
      case 'signed_by_t_l_status': return 'Approve By Reviewer';
      case 'acknowledged_by_tl_status': return 'Acknowledge Action (TL)';
      case 'acknowledged_by_di_status': return 'Acknowledge Action (DI)';
      default: return 'Review';
    }
  }

  private getEmployeeName(code: string): string {
    const normalizedCode = (code || '').trim();
    if (!normalizedCode || normalizedCode === '-') return '';
    return this.employeeLookupMap.get(normalizedCode) || normalizedCode;
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'draft':
        return 'Draft';
      case 'in-review':
      case 'in_review':
        return 'In Review';
      case 'responded':
        return 'Responded';
      case 'signed':
        return 'Signed';
      case 'acknowledged':
        return 'Acknowledged';
      case 'completed':
        return 'Completed';
      case 'rejected':
        return 'Rejected';
      default:
        return status || 'Unknown';
    }
  }

  formatDate(date: Date): string {
    return formatDateDisplay(date);
  }

  navigateToNew(): void {
    this.router.navigate(['/construction-validation/new']);
  }

  navigateToView(id: string): void {
    this.router.navigate(['/construction-validation/view', id]);
  }

  navigateToEdit(id: string): void {
    this.router.navigate(['/construction-validation/edit', id]);
  }

  navigateToAction(review: ConstructionValidationItem): void {
    const type = this.getActionType(review);
    this.router.navigate(['/construction-validation/action', review.id, type]);
  }

  deleteReview(id: string): void {
    const confirmation = this.fuseConfirmationService.open({
      title: 'Delete construction validation',
      message: 'Are you sure you want to delete this review? This action cannot be undone!',
      icon: { show: true, name: 'heroicons_outline:exclamation-triangle', color: 'warn' },
      actions: {
        confirm: { show: true, label: 'Delete', color: 'warn' },
        cancel: { show: true, label: 'Cancel' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;

      this.projectReviewApi.delete(this.apiKey, id).subscribe({
        next: () => {
          this.refreshCurrentView(false);
          this.snackBar.open('Construction validation deleted successfully', 'Close', { duration: 3000 });
        },
        error: (error) => {
          console.error('Error deleting construction validations:', error);
          this.snackBar.open('Failed to delete construction validation', 'Close', { duration: 3000 });
        },
      });
    });
  }

  private mapReview(item: any): ConstructionValidationItem {
    const status = (item.status || 'draft').toLowerCase().replace('_', '-');
    
    const preparedByCode = pickString(item, 'preparedBy', 'prepared_by') || '-';
    const completedByCode = pickString(item, 'completedBy', 'completed_by') || preparedByCode;
    const respondedByCode = pickString(item, 'respondedBy', 'responded_by') || preparedByCode;
    const signedByTLCode = pickString(item, 'signedByTL', 'signed_by_tl', 'signed_by_t_l') || '-';
    const acknowledgedByCode = pickString(item, 'acknowledgedByTL', 'acknowledged_by_tl', 'acknowledged_by_t_l') || '-';

    return {
      isLegacy: isLegacyRecord(item),
      id: String(item.id),
      projectName: pickString(item, 'projectName', 'project_name') || '-',
      projectNumber: pickString(item, 'projectNumber', 'project_number', 'project_no') || '-',
      stage: pickString(item, 'stage') || '-',
      preparedBy: this.getEmployeeName(preparedByCode),
      preparedByCode: preparedByCode,
      discipline: pickString(item, 'discipline') || '-',
      documentTypes: pickStringArray(item, 'documentTypes', 'document_types'),
      status: status as ConstructionValidationItem['status'],

      completedByStatus: pickString(item, 'completedByStatus', 'completed_by_status', 'completed_by_t_l_status') || 
                        (['responded', 'signed', 'acknowledged', 'completed'].includes(status) ? 'approved' : 'pending'),
      
      respondedByStatus: pickString(item, 'respondedByStatus', 'responded_by_status') || 
                        (['signed', 'acknowledged', 'completed'].includes(status) ? 'approved' : 'pending'),
      
      signedByTLStatus: pickString(item, 'signedByTLStatus', 'signed_by_tl_status', 'signed_by_t_l_status') || 
                        (['signed', 'acknowledged', 'completed'].includes(status) ? 'approved' : 'pending'),
      
      acknowledgedByTLStatus: pickString(item, 'acknowledgedByTLStatus', 'acknowledged_by_tl_status', 'acknowledged_by_t_l_status') || 
                        (['acknowledged', 'completed'].includes(status) ? 'approved' : 'pending'),
      
      acknowledgedByDIStatus: pickString(item, 'acknowledgedByDIStatus', 'acknowledged_by_di_status', 'acknowledged_by_d_i_status') || 
                        (status === 'completed' ? 'approved' : 'pending'),

      completedBy: this.getEmployeeName(completedByCode),
      completedByCode: completedByCode,
      respondedBy: this.getEmployeeName(respondedByCode),
      respondedByCode: respondedByCode,
      signedByTL: this.getEmployeeName(signedByTLCode),
      signedByTLCode: signedByTLCode,
      acknowledgedBy: this.getEmployeeName(acknowledgedByCode),
      acknowledgedByCode: acknowledgedByCode,
      reviewerForAction: pickString(item, 'reviewerForAction', 'reviewer_for_action') || '-',
      teamLeadForAction: pickString(item, 'teamLeadForAction', 'team_lead_for_action') || '',
      directorForAction: pickString(item, 'directorForAction', 'director_for_action', 'acknowledged_by_d_i') || '-',
      createdAt: pickDate(item, 'createdAt', 'created_at', 'createdDate') ?? new Date(),
      updatedAt: pickDate(item, 'updatedAt', 'updated_at', 'lastModified', 'createdAt', 'created_at') ?? new Date(),
    };
  }
    onListSortChange(event: ListSortEvent): void {
        this.listSort = event;
        this.pageIndex = 0;
        this.refreshCurrentView();
    }
}
