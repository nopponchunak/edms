import { Component, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import {
  deriveChecklistStatus,
  mergeProjectReviewEmployeeLookup,
  pickDate,
  pickString,
  pickStringArray,
  ProjectReviewApiService,
} from 'app/core/services/project-review-api.service';
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
import { isLegacyRecord } from 'app/core/utils/legacy-source.util';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

export interface TenderMepReviewItem {
  id: string;
  projectName: string;
  projectNumber: string;
  stage: string;
  preparedBy: string;
  discipline: string;
  projectStage: string;
  reviewMethod: string;
  documentTypes: string[];
  status:
    | 'draft'
    | 'in-review'
    | 'responded'
    | 'signed'
    | 'acknowledged'
    | 'completed'
    | 'rejected';
  reviewedBy: string;
  reviewedByCode: string;
  respondedBy: string;
  respondedByCode: string;
  signedBy: string;
  signedByCode: string;
  signedByTL: string;
  signedByTLCode: string;
  acknowledgedBy: string;
  acknowledgedByCode: string;
  reviewerForAction: string;
  teamLeadForAction: string;
  directorForAction: string;
  reviewedByStatus: string;
  respondedByStatus: string;
  signedByVVEStatus: string;
  signedByTLStatus: string;
  acknowledgedByStatus: string;
  createdAt: Date;
  updatedAt: Date;
  isLegacy: boolean;
  preparedByCode: string;
}

@Component({
  selector: 'app-tender-mep-review-list',
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
  templateUrl: './tender-mep-review-list.component.html',
  styleUrls: ['./tender-mep-review-list.component.scss'],
})
export class TenderMepReviewListComponent implements OnInit {
    listSort: ListSortEvent = { column: 0, dir: 'desc' };
  private readonly apiKey = 'tenderMepReview' as const;
  readonly navigationPermissionService = inject(NavigationPermissionService);
  readonly permissionNavId = 'tender-mep-review';
  readonly pageTitle = 'Tender Review MEP';
  readonly pageSubtitle = 'MTDD-04 - Tender Review MEP Checklist/Action Sheet';
  readonly itemLabel = 'Tender Review MEPs';

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
    { data: 'reviewed_by' },
    { data: 'signed_by_vve' },
    { data: 'signed_by_tl' },
    { data: 'acknowledged_by' },
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
  reviews: TenderMepReviewItem[] = [];
  filteredReviews: TenderMepReviewItem[] = [];
  allRecordsCount = 0;
  employeeLookupMap = new Map<string, string>();

  filterConfig: PurchaseFormsFilterConfig = {
    searchLabel: 'Search Tender Review MEP',
    searchPlaceholder: 'Search by project, prepared by, reviewer...',
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
          console.error('Error loading Tender Review MEPs:', error);
          this.reviews = [];
          this.allRecordsCount = 0;
          if (!silent) {
            this.applyClientFilters(false);
            this.loading = false;
            this.snackBar.open('Failed to load Tender Review MEPs.', 'Close', { duration: 3000 });
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
          console.error('Error loading Tender Review MEP page:', error);
          this.filteredReviews = [];
          this.totalRecords = 0;
          this.snackBar.open('Failed to load Tender Review MEPs.', 'Close', {
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
        review.reviewedBy.toLowerCase().includes(term) ||
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
    if (resetPage) this.pageIndex = 0;
  }

  get pagedReviews(): TenderMepReviewItem[] {
    if (this.currentTab === 'all') {
      return this.filteredReviews;
    }

    const start = this.pageIndex * this.pageSize;
    return this.filteredReviews.slice(start, start + this.pageSize);
  }

  get visibleReviews(): TenderMepReviewItem[] {
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

  get actionRequestCount(): number {
    const userCode = getCurrentUserCode();
    return this.reviews.filter((review) => this.isActionItem(review) && this.isRelatedToCurrentUser(review, userCode)).length;
  }

  get filterTotalCount(): number {
    return this.allRecordsCount;
  }

  get filterFilteredCount(): number {
    return this.currentTab === 'all' ? this.totalRecords : this.filteredReviews.length;
  }

  get activeFilterCount(): number {
    return [this.searchTerm, this.statusFilter, this.thirdFilter].filter((value) => !!value).length;
  }

  get filteredCount(): number {
    return this.currentTab === 'all' ? this.totalRecords : this.filteredReviews.length;
  }

  get listTitle(): string {
    if (this.currentTab === 'action') return 'Action Requests';
    if (this.currentTab === 'my') return 'My Tender Review MEPs';
    if (this.currentTab === 'pending') return 'My Pending Tender Review MEPs';
    return 'All Tender Review MEPs';
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

  private isPendingItem(review: TenderMepReviewItem): boolean {
    return ['draft', 'in-review', 'responded', 'signed', 'acknowledged'].includes(review.status);
  }

  private isActionItem(review: TenderMepReviewItem): boolean {
    const nextAction = this.getNextPendingAction(review);
    if (!nextAction) return false;

    const userCode = getCurrentUserCode();
    if (!userCode) return false;
    const target = userCode.trim().toLowerCase();

    switch (nextAction) {
      case 'reviewed_by_status':
        return String(review.reviewerForAction || review.reviewedByCode || '').trim().toLowerCase() === target;
      case 'responded_by_status':
        return String(review.respondedByCode || review.preparedByCode || '').trim().toLowerCase() === target;
      case 'signed_by_vve_status':
        return String(review.signedByCode || review.reviewerForAction || review.reviewedByCode || '').trim().toLowerCase() === target;
      case 'signed_by_tl_status':
      case 'signed_by_t_l_status':
        return String(review.teamLeadForAction || review.signedByTLCode || '').trim().toLowerCase() === target;
      case 'acknowledged_by_status':
        return String(review.directorForAction || review.acknowledgedByCode || '').trim().toLowerCase() === target;
      default:
        return false;
    }
  }

  private isMyRequest(review: TenderMepReviewItem, userCode: string | null): boolean {
    return isMyRequestByUserCode({ ...review, prepared_by: review.preparedByCode, create_by: review.preparedByCode, filled_in_by: review.preparedByCode }, userCode);
  }

  private isRelatedToCurrentUser(review: TenderMepReviewItem, userCode: string | null): boolean {
    if (!userCode) return false;
    const target = userCode.trim().toLowerCase();
    return [
      review.preparedByCode,
      review.reviewedByCode,
      review.respondedByCode,
      review.signedByCode,
      review.signedByTLCode,
      review.acknowledgedByCode,
      review.reviewerForAction,
      review.teamLeadForAction,
      review.directorForAction,
    ].some((value) => String(value ?? '').trim().toLowerCase() === target);
  }

  private getThirdFilterValue(review: TenderMepReviewItem): string {
    return String((review as any)['discipline'] ?? '');
  }

  updateFilterConfigFrom(items: TenderMepReviewItem[]): void {
    const options = Array.from(new Set(items.map((item) => this.getThirdFilterValue(item)).filter(Boolean))).sort();
    this.filterConfig.thirdFilterOptions = options.map((value) => ({ value, label: value }));
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'in-review':
      case 'in_review': return 'bg-blue-100 text-blue-800';
      case 'responded': return 'bg-yellow-100 text-yellow-800';
      case 'signed': return 'bg-purple-100 text-purple-800';
      case 'acknowledged': return 'bg-indigo-100 text-indigo-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  getDisplayStatusLabel(review: TenderMepReviewItem): string {
    if (review.status === 'completed' || review.status === 'rejected' || review.status === 'draft') {
      return this.getStatusLabel(review.status);
    }

    const nextAction = this.getNextPendingAction(review);
    if (!nextAction) return this.getStatusLabel(review.status);

    let stepLabel = '';
    let person = '';

    switch (nextAction) {
      case 'reviewed_by_status':
        stepLabel = 'Pending Review';
        person = this.getEmployeeName(review.reviewerForAction || review.reviewedBy);
        break;
      case 'responded_by_status':
        stepLabel = 'Pending Response';
        person = this.getEmployeeName(review.respondedBy);
        break;
      case 'signed_by_vve_status':
        stepLabel = 'Pending Sign (VVE)';
        person = this.getEmployeeName(review.signedBy || review.reviewerForAction || review.reviewedBy);
        break;
      case 'signed_by_tl_status':
      case 'signed_by_t_l_status':
        stepLabel = 'Pending Sign (TL)';
        person = this.getEmployeeName(review.teamLeadForAction || review.signedByTL);
        break;
      case 'acknowledged_by_status':
        stepLabel = 'Pending Acknowledge (DI)';
        person = this.getEmployeeName(review.directorForAction || review.acknowledgedBy);
        break;
      default:
        return this.getStatusLabel(review.status);
    }

    return `${stepLabel} (${person || 'Unassigned'})`;
  }

  getTableStatusLabel(review: TenderMepReviewItem): string {
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
      case 'signed_by_vve_status':
        return 'Reviewer to approve';
      case 'signed_by_tl_status':
      case 'signed_by_t_l_status':
        return 'TL to sign';
      case 'acknowledged_by_status':
        return 'DI to acknowledge';
      default:
        return 'Pending';
    }
  }

  getTableStatusColor(review: TenderMepReviewItem): string {
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
    review: TenderMepReviewItem,
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
      case 'signed_by_vve_status':
        return column === 'reviewer';
      case 'signed_by_tl_status':
      case 'signed_by_t_l_status':
        return column === 'teamlead';
      case 'acknowledged_by_status':
        return column === 'director';
      default:
        return false;
    }
  }

  getTeamEngineer(review: TenderMepReviewItem): string {
    return review.respondedBy && review.respondedBy !== '-'
      ? review.respondedBy
      : review.preparedBy || '-';
  }

  getReviewer(review: TenderMepReviewItem): string {
    if (review.reviewedBy && review.reviewedBy !== '-') {
      return review.reviewedBy;
    }

    if (review.signedBy && review.signedBy !== '-') {
      return review.signedBy;
    }

    return this.getEmployeeName(review.reviewerForAction) || '-';
  }

  getTeamlead(review: TenderMepReviewItem): string {
    if (review.signedByTL && review.signedByTL !== '-') {
      return review.signedByTL;
    }

    return this.getEmployeeName(review.teamLeadForAction) || '-';
  }

  getDirector(review: TenderMepReviewItem): string {
    if (review.acknowledgedBy && review.acknowledgedBy !== '-') {
      return review.acknowledgedBy;
    }

    return this.getEmployeeName(review.directorForAction) || '-';
  }

  getNextPendingAction(review: TenderMepReviewItem): string | null {
    if (review.status === 'completed' || review.status === 'rejected' || review.status === 'draft') return null;

    const isApproved = (s: string) => ['approved', 'approve', 'signed', 'acknowledged'].includes(String(s || '').trim().toLowerCase());

    if (!isApproved(review.reviewedByStatus)) return 'reviewed_by_status';
    if (!isApproved(review.respondedByStatus)) return 'responded_by_status';
    if (!isApproved(review.signedByVVEStatus)) return 'signed_by_vve_status';
    if (!isApproved(review.signedByTLStatus)) return 'signed_by_t_l_status';
    if (!isApproved(review.acknowledgedByStatus)) return 'acknowledged_by_status';

    return null;
  }

  getActionType(review: TenderMepReviewItem): string {
    return this.getNextPendingAction(review) || '';
  }

  getActionButtonLabel(review: TenderMepReviewItem): string {
    const action = this.getNextPendingAction(review);
    switch (action) {
      case 'reviewed_by_status': return 'Review Checklist (TL)';
      case 'responded_by_status': return 'Respond to Review';
      case 'signed_by_vve_status': return 'Sign Action (VVE)';
      case 'signed_by_tl_status':
      case 'signed_by_t_l_status': return 'Sign Action (TL)';
      case 'acknowledged_by_status': return 'Acknowledge Action (DI)';
      default: return 'Review';
    }
  }

  private getEmployeeName(code: string): string {
    const normalizedCode = (code || '').trim();
    if (!normalizedCode || normalizedCode === '-') return '';
    return this.employeeLookupMap.get(normalizedCode) || normalizedCode;
  }

  private capitalize(s: string): string {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'draft': return 'Draft';
      case 'in-review': return 'In Review';
      case 'responded': return 'Responded';
      case 'signed': return 'Signed';
      case 'acknowledged': return 'Acknowledged';
      case 'completed': return 'Completed';
      case 'rejected': return 'Rejected';
      default: return status || 'Unknown';
    }
  }

  formatDate(date: Date): string {
    return formatDateDisplay(date);
  }

  navigateToNew(): void {
    this.router.navigate(['/tender/mep/review/new']);
  }

  navigateToView(id: string): void {
    this.router.navigate(['/tender/mep/review/view', id]);
  }

  navigateToEdit(id: string): void {
    this.router.navigate(['/tender/mep/review/edit', id]);
  }

  navigateToAction(review: TenderMepReviewItem): void {
    const type = this.getActionType(review);
    this.router.navigate(['/tender/mep/review/action', review.id, type]);
  }

  deleteReview(id: string): void {
    const confirmation = this.fuseConfirmationService.open({
      title: 'Delete Tender Review MEP',
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
          this.snackBar.open('Tender review deleted successfully', 'Close', { duration: 3000 });
        },
        error: (error) => {
          console.error('Error deleting Tender Review MEPs:', error);
          this.snackBar.open('Failed to delete Tender Review MEP', 'Close', { duration: 3000 });
        },
      });
    });
  }

  private mapReview(item: any): TenderMepReviewItem {
    const rawStatus = deriveChecklistStatus(item);
    const status = 'hyphen' === 'hyphen' && rawStatus === 'in_review' ? 'in-review' : rawStatus;
    const preparedByCode = pickString(item, 'preparedBy', 'prepared_by', 'create_by', 'filled_in_by') || '-';
    const reviewedByCode = pickString(item, 'reviewedBy', 'reviewed_by', 'reviewed_by_t_l', 'signed_by_vve', 'signed_by_v_v_e', 'reviewer_for_action') || '-';
    const respondedByCode = pickString(item, 'respondedBy', 'responded_by') || preparedByCode || '-';
    const signedByCode = pickString(item, 'signedBy', 'signed_by', 'signedByVVE', 'signed_by_vve', 'signed_by_v_v_e') || '-';
    const signedByTLCode = pickString(item, 'signedByTL', 'signed_by_tl', 'signed_by_t_l', 'team_lead_for_action') || '-';
    const acknowledgedByCode = pickString(item, 'acknowledgedBy', 'acknowledged_by', 'acknowledged_by_d_i', 'director_for_action') || '-';

    return {
      isLegacy: isLegacyRecord(item),
      id: pickString(item, 'id'),
      projectName: pickString(item, 'projectName', 'project_name', 'name') || '-',
      projectNumber: pickString(item, 'projectNumber', 'project_number', 'project_no') || '-',
      stage: pickString(item, 'stage') || '-',
      preparedBy: this.getEmployeeName(preparedByCode),
      preparedByCode: preparedByCode,
      discipline: pickString(item, 'discipline', 'disciplineOther', 'discipline_other') || '-',
      projectStage: pickString(item, 'projectStage', 'project_stage', 'projectStageOther', 'project_stage_other') || '-',
      reviewMethod: pickString(item, 'reviewMethod', 'review_method') || '-',
      documentTypes: pickStringArray(item, 'documentTypes', 'document_types', 'documentsReviewed', 'documents_reviewed'),
      status: status as TenderMepReviewItem['status'],
      reviewedBy: this.getEmployeeName(reviewedByCode),
      reviewedByCode: reviewedByCode,
      respondedBy: this.getEmployeeName(respondedByCode),
      respondedByCode: respondedByCode,
      signedBy: this.getEmployeeName(signedByCode),
      signedByCode: signedByCode,
      signedByTL: this.getEmployeeName(signedByTLCode),
      signedByTLCode: signedByTLCode,
      acknowledgedBy: this.getEmployeeName(acknowledgedByCode),
      acknowledgedByCode: acknowledgedByCode,
      reviewerForAction: pickString(item, 'reviewerForAction', 'reviewer_for_action') || '',
      teamLeadForAction: pickString(item, 'teamLeadForAction', 'team_lead_for_action') || '',
      directorForAction: pickString(item, 'directorForAction', 'director_for_action') || '',
      reviewedByStatus: pickString(item, 'reviewed_by_tl_status', 'reviewed_by_t_l_status', 'reviewedByStatus', 'reviewed_by_status') || 'pending',
      respondedByStatus: pickString(item, 'respondedByStatus', 'responded_by_status') || 'pending',
      signedByVVEStatus: pickString(item, 'signedByVVEStatus', 'signed_by_vve_status', 'signed_by_v_v_e_status') || 'pending',
      signedByTLStatus: pickString(item, 'signedByTLStatus', 'signed_by_tl_status', 'signed_by_t_l_status') || 'pending',
      acknowledgedByStatus: pickString(item, 'acknowledgedByStatus', 'acknowledged_by_status', 'acknowledged_by_d_i_status') || 'pending',
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
