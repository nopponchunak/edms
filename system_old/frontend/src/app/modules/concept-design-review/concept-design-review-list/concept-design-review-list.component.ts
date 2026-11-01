import { CommonModule } from '@angular/common';
import { Component, HostListener, inject, OnInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import {
    PurchaseFormsFilterComponent,
    PurchaseFormsFilterConfig,
    PurchaseFormsFilterValues,
} from 'app/core/components/purchase-forms-filter';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';
import {
    deriveChecklistStatus,
    mergeProjectReviewEmployeeLookup,
    pickDate,
    pickString,
    pickStringArray,
    ProjectReviewApiService,
} from 'app/core/services/project-review-api.service';
import {
    getCurrentUserCode,
    isMyRequestByUserCode,
} from 'app/core/utils/action-request-filter.util';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { isLegacyRecord } from 'app/core/utils/legacy-source.util';
import { finalize } from 'rxjs';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

export interface ConceptDesignReviewItem {
    id: string;
    projectName: string;
    projectNumber: string;
    stage: string;
    preparedBy: string;
    preparedByCode: string;
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
    signedByTL2: string;
    signedByTL2Code: string;
    acknowledgedBy: string;
    acknowledgedByCode: string;
    reviewerForAction: string;
    teamLeadForAction: string;
    directorForAction: string;
    reviewedByStatus: string;
    respondedByStatus: string;
    signedByTLStatus: string;
    signedByTL2Status: string;
    acknowledgedByStatus: string;
    createdAt: Date;
    updatedAt: Date;
    isLegacy: boolean;
}

@Component({
    selector: 'app-concept-design-review-list',
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
    templateUrl: './concept-design-review-list.component.html',
    styleUrls: ['./concept-design-review-list.component.scss'],
})
export class ConceptDesignReviewListComponent implements OnInit {
    listSort: ListSortEvent = { column: 0, dir: 'desc' };
    private readonly apiKey = 'conceptDesignReview' as const;
    readonly navigationPermissionService = inject(NavigationPermissionService);
    readonly permissionNavId = 'concept-design-review';
    readonly pageTitle = 'Concept Design Review';
    readonly pageSubtitle =
        'MTDD-01 - Concept Design Review Checklist/Action Sheet';
    readonly itemLabel = 'concept design reviews';

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
        { data: 'signed_by_tl2' },
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
    reviews: ConceptDesignReviewItem[] = [];
    filteredReviews: ConceptDesignReviewItem[] = [];
    allRecordsCount = 0;
    employeeLookupMap = new Map<string, string>();

    filterConfig: PurchaseFormsFilterConfig = {
        searchLabel: 'Search Concept Design Review',
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
        if (
            !this.navigationPermissionService.hasViewAllPermissionByNavId(
                this.permissionNavId
            )
        ) {
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
            .pipe(
                finalize(() => {
                    if (!silent) this.loading = false;
                })
            )
            .subscribe({
                next: (response) => {
                    const items = Array.isArray(response?.data)
                        ? response.data
                        : [];
                    mergeProjectReviewEmployeeLookup(items, this.employeeLookupMap);
                    this.reviews = items.map((item) => this.mapReview(item));
                    this.allRecordsCount = Number(
                        response?.recordsFiltered ?? this.reviews.length
                    );
                    this.updateFilterConfigFrom(this.reviews);
                    if (!silent) {
                        this.applyClientFilters(false);
                    }
                },
                error: (error) => {
                    console.error(
                        'Error loading concept design reviews:',
                        error
                    );
                    this.reviews = [];
                    this.allRecordsCount = 0;
                    if (!silent) {
                        this.applyClientFilters(false);
                        this.loading = false;
                        this.snackBar.open(
                            'Failed to load concept design reviews.',
                            'Close',
                            { duration: 3000 }
                        );
                    }
                },
            });
    }

    onTabChange(tab: 'all' | 'my' | 'pending' | 'action'): void {
        if (
            tab === 'all' &&
            !this.navigationPermissionService.hasViewAllPermissionByNavId(
                this.permissionNavId
            )
        ) {
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

    applyFilters(filters: PurchaseFormsFilterValues): void {
        this.searchTerm = filters.searchTerm || '';
        this.statusFilter = filters.statusFilter || '';
        this.thirdFilter = filters.thirdFilter || '';
        this.closeFilterPanel();
        this.refreshCurrentView();
    }

    clearFilters(): void {
        this.searchTerm = '';
        this.statusFilter = '';
        this.thirdFilter = '';
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
                    const items = Array.isArray(response?.data)
                        ? response.data
                        : [];
                    mergeProjectReviewEmployeeLookup(items, this.employeeLookupMap);
                    this.filteredReviews = items.map((item) =>
                        this.mapReview(item)
                    );
                    this.totalRecords = Number(
                        response?.recordsFiltered ?? this.filteredReviews.length
                    );
                },
                error: (error) => {
                    console.error(
                        'Error loading concept design review page:',
                        error
                    );
                    this.filteredReviews = [];
                    this.totalRecords = 0;
                    this.snackBar.open(
                        'Failed to load concept design reviews.',
                        'Close',
                        { duration: 3000 }
                    );
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
                matchesTab =
                    this.isPendingItem(review) &&
                    this.isRelatedToCurrentUser(review, userCode);
            } else if (this.currentTab === 'action') {
                matchesTab = this.isActionItem(review);
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
            const matchesStatus =
                !this.statusFilter || review.status === this.statusFilter;
            const matchesThird =
                !this.thirdFilter ||
                this.getThirdFilterValue(review) === this.thirdFilter;

            return matchesTab && matchesSearch && matchesStatus && matchesThird;
        });

        this.totalRecords = this.filteredReviews.length;
        if (resetPage) this.pageIndex = 0;
    }

    get pagedReviews(): ConceptDesignReviewItem[] {
        if (this.currentTab === 'all') {
            return this.filteredReviews;
        }

        const start = this.pageIndex * this.pageSize;
        return this.filteredReviews.slice(start, start + this.pageSize);
    }

    get visibleReviews(): ConceptDesignReviewItem[] {
        return this.currentTab === 'action'
            ? this.filteredReviews
            : this.pagedReviews;
    }

    onPageChange(event: PageEvent): void {
        this.pageIndex = event.pageIndex;
        this.pageSize = event.pageSize;

        if (this.currentTab === 'all') {
            this.loadPagedReviews();
        }
    }

    get actionRequestCount(): number {
        return this.reviews.filter((review) => this.isActionItem(review))
            .length;
    }

    get filterTotalCount(): number {
        return this.allRecordsCount;
    }

    get filterFilteredCount(): number {
        return this.currentTab === 'all'
            ? this.totalRecords
            : this.filteredReviews.length;
    }

    get activeFilterCount(): number {
        return [this.searchTerm, this.statusFilter, this.thirdFilter].filter(
            (value) => !!value
        ).length;
    }

    get filteredCount(): number {
        return this.currentTab === 'all'
            ? this.totalRecords
            : this.filteredReviews.length;
    }

    get listTitle(): string {
        if (this.currentTab === 'action') return 'Action Requests';
        if (this.currentTab === 'my') return 'My Concept Design Reviews';
        if (this.currentTab === 'pending')
            return 'My Pending Concept Design Reviews';
        return 'All Concept Design Reviews';
    }

    get listCountText(): string {
        if (this.currentTab === 'action') {
            return `${this.filteredReviews.length} action requests`;
        }

        return `${this.filteredCount} ${this.itemLabel}`;
    }

    get emptyTitle(): string {
        return this.currentTab === 'action'
            ? 'No action requests found'
            : 'No reviews found';
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
        return (
            (this.currentTab === 'all' || this.currentTab === 'my') &&
            !this.activeFilterCount
        );
    }

    private isPendingItem(review: ConceptDesignReviewItem): boolean {
        return [
            'draft',
            'in-review',
            'responded',
            'signed',
            'acknowledged',
        ].includes(review.status);
    }

    private isActionItem(review: ConceptDesignReviewItem): boolean {
        if (review.status === 'completed' || review.status === 'rejected') {
            return false;
        }

        const nextAction = this.getNextPendingAction(review);
        if (!nextAction) {
            return false;
        }

        // Filter to only show items where the current user is responsible for the next pending step
        const userCode = getCurrentUserCode();
        if (!userCode) return false;
        const target = userCode.trim().toLowerCase();

        let responsibleUser = '';
        switch (nextAction) {
            case 'reviewed_by_status':
                responsibleUser = review.reviewedByCode;
                break;
            case 'responded_by_status':
                responsibleUser = review.respondedByCode;
                break;
            case 'signed_by_t_l_status':
                responsibleUser = review.signedByTLCode;
                break;
            case 'signed_by_t_l2_status':
                responsibleUser = review.signedByTL2Code;
                break;
            case 'acknowledged_by_status':
                responsibleUser = review.acknowledgedByCode;
                break;
        }

        return (
            String(responsibleUser ?? '')
                .trim()
                .toLowerCase() === target
        );
    }

    getActionButtonLabel(review: ConceptDesignReviewItem): string {
        const action = this.getNextPendingAction(review);
        switch (action) {
            case 'reviewed_by_status':
                return 'Review';
            case 'responded_by_status':
                return 'Respond';
            case 'signed_by_t_l_status':
                return 'Reviewer Approve';
            case 'signed_by_t_l2_status':
                return 'TL Review';
            case 'acknowledged_by_status':
                return 'Acknowledge';
            default:
                return 'Review';
        }
    }

    private getNextPendingAction(review: ConceptDesignReviewItem): string {
        const isApproved = (s: string) =>
            ['approved', 'approve', 'signed', 'acknowledged'].includes(
                String(s || '')
                    .trim()
                    .toLowerCase()
            );

        if (!isApproved(review.reviewedByStatus)) {
            return 'reviewed_by_status';
        }

        if (!isApproved(review.respondedByStatus)) {
            return 'responded_by_status';
        }

        if (!isApproved(review.signedByTLStatus)) {
            return 'signed_by_t_l_status';
        }

        if (!isApproved(review.signedByTL2Status)) {
            return 'signed_by_t_l2_status';
        }

        if (!isApproved(review.acknowledgedByStatus)) {
            return 'acknowledged_by_status';
        }

        return '';
    }

    private isMyRequest(
        review: ConceptDesignReviewItem,
        userCode: string | null
    ): boolean {
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

    private isRelatedToCurrentUser(
        review: ConceptDesignReviewItem,
        userCode: string | null
    ): boolean {
        if (!userCode) return false;
        const target = userCode.trim().toLowerCase();
        return [
            review.preparedByCode,
            review.reviewedByCode,
            review.respondedByCode,
            review.signedByCode,
            review.signedByTLCode,
            review.signedByTL2Code,
            review.acknowledgedByCode,
            review.reviewerForAction,
            review.teamLeadForAction,
            review.directorForAction,
        ].some(
            (value) =>
                String(value ?? '')
                    .trim()
                    .toLowerCase() === target
        );
    }

    private getThirdFilterValue(review: ConceptDesignReviewItem): string {
        return String((review as any)['discipline'] ?? '');
    }

    updateFilterConfigFrom(items: ConceptDesignReviewItem[]): void {
        const options = Array.from(
            new Set(
                items
                    .map((item) => this.getThirdFilterValue(item))
                    .filter(Boolean)
            )
        ).sort();
        this.filterConfig.thirdFilterOptions = options.map((value) => ({
            value,
            label: value,
        }));
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

    getStatusLabel(status: string): string {
        switch (status) {
            case 'draft':
                return 'Draft';
            case 'in-review':
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

    getDisplayStatusLabel(review: ConceptDesignReviewItem): string {
        if (review.status === 'completed') return 'Completed';
        if (review.status === 'rejected') return 'Rejected';
        if (review.status === 'draft') return 'Draft';

        const action = this.getNextPendingAction(review);
        switch (action) {
            case 'reviewed_by_status':
                return `Pending Review (${this.getEmployeeName(review.reviewedBy)})`;
            case 'responded_by_status':
                return `Pending Response (${this.getEmployeeName(review.respondedBy)})`;
            case 'signed_by_t_l_status':
                return `Pending Reviewer Approval (${this.getEmployeeName(review.signedByTL)})`;
            case 'signed_by_t_l2_status':
                return `Pending TL Review (${this.getEmployeeName(review.signedByTL2)})`;
            case 'acknowledged_by_status':
                return `Pending Acknowledgment (${this.getEmployeeName(review.acknowledgedBy)})`;
            default:
                return 'In Review';
        }
    }

    getTableStatusLabel(review: ConceptDesignReviewItem): string {
        if (
            review.status === 'completed' ||
            !this.getNextPendingAction(review)
        ) {
            return 'Complete';
        }

        if (review.status === 'rejected') {
            return 'Rejected';
        }

        switch (this.getNextPendingAction(review)) {
            case 'reviewed_by_status':
                return 'Reviewer to review';
            case 'responded_by_status':
                return 'TE to response';
            case 'signed_by_t_l_status':
                return 'Reviewer to approve';
            case 'signed_by_t_l2_status':
                return 'TL to review';
            case 'acknowledged_by_status':
                return 'DI to acknowledge';
            default:
                return 'Pending';
        }
    }

    getTableStatusColor(review: ConceptDesignReviewItem): string {
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
        review: ConceptDesignReviewItem,
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
            case 'signed_by_t_l_status':
                return column === 'reviewer';
            case 'signed_by_t_l2_status':
                return column === 'teamlead';
            case 'acknowledged_by_status':
                return column === 'director';
            default:
                return false;
        }
    }

    getTeamEngineer(review: ConceptDesignReviewItem): string {
        return review.respondedBy && review.respondedBy !== '-'
            ? review.respondedBy
            : review.preparedBy || '-';
    }

    getReviewer(review: ConceptDesignReviewItem): string {
        return review.reviewedBy && review.reviewedBy !== '-'
            ? review.reviewedBy
            : review.signedByTL && review.signedByTL !== '-'
              ? review.signedByTL
              : review.signedBy || '-';
    }

    getTeamlead(review: ConceptDesignReviewItem): string {
        return review.signedByTL2 && review.signedByTL2 !== '-'
            ? review.signedByTL2
            : review.signedByTL || '-';
    }

    getDirector(review: ConceptDesignReviewItem): string {
        return review.acknowledgedBy || '-';
    }

    formatDate(date: Date): string {
        return formatDateDisplay(date);
    }

    navigateToNew(): void {
        this.router.navigate(['/concept-design-review/new']);
    }

    navigateToView(id: string): void {
        this.router.navigate(['/concept-design-review/view', id]);
    }

    navigateToEdit(id: string): void {
        this.router.navigate(['/concept-design-review/edit', id]);
    }

    private getEmployeeName(code: string): string {
        const normalizedCode = (code || '').trim();
        if (!normalizedCode || normalizedCode === '-') return '';
        return this.employeeLookupMap.get(normalizedCode) || normalizedCode;
    }

    navigateToAction(id: string): void {
        const review =
            this.reviews.find((r) => r.id === id) ||
            this.filteredReviews.find((r) => r.id === id);
        if (!review) return;

        const targetAction =
            this.getNextPendingAction(review) || 'reviewed_by_status';
        this.router.navigate([
            '/concept-design-review/action',
            id,
            targetAction,
        ]);
    }

    deleteReview(id: string): void {
        const confirmation = this.fuseConfirmationService.open({
            title: 'Delete concept design review',
            message:
                'Are you sure you want to delete this review? This action cannot be undone!',
            icon: {
                show: true,
                name: 'heroicons_outline:exclamation-triangle',
                color: 'warn',
            },
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
                    this.snackBar.open(
                        'Concept design review deleted successfully',
                        'Close',
                        { duration: 3000 }
                    );
                },
                error: (error) => {
                    console.error(
                        'Error deleting concept design reviews:',
                        error
                    );
                    this.snackBar.open(
                        'Failed to delete concept design review',
                        'Close',
                        { duration: 3000 }
                    );
                },
            });
        });
    }

    private mapReview(item: any): ConceptDesignReviewItem {
        const rawStatus = deriveChecklistStatus(item);
        const status =
            'hyphen' === 'hyphen' && rawStatus === 'in_review'
                ? 'in-review'
                : rawStatus;
        const preparedByCode =
            pickString(
                item,
                'preparedBy',
                'prepared_by',
                'create_by',
                'filled_in_by'
            ) || '-';
        const reviewedByCode =
            pickString(item, 'reviewedBy', 'reviewed_by') || '-';
        const respondedByCode =
            pickString(item, 'respondedBy', 'responded_by') || '-';
        const signedByCode =
            pickString(
                item,
                'signedBy',
                'signed_by',
                'signedByVVE',
                'signed_by_vve'
            ) || '-';
        const signedByTLCode =
            pickString(item, 'signedByTL', 'signed_by_tl', 'signed_by_t_l') ||
            '-';
        const signedByTL2Code =
            pickString(
                item,
                'signedByTL2',
                'signed_by_tl2',
                'signed_by_t_l2'
            ) || '-';
        const acknowledgedByCode =
            pickString(item, 'acknowledgedBy', 'acknowledged_by') || '-';

        return {
            isLegacy: isLegacyRecord(item),
            id: pickString(item, 'id'),
            projectName:
                pickString(item, 'projectName', 'project_name', 'name') || '-',
            projectNumber:
                pickString(
                    item,
                    'projectNumber',
                    'project_number',
                    'project_no'
                ) || '-',
            stage: pickString(item, 'stage') || '-',
            preparedBy: this.getEmployeeName(preparedByCode),
            preparedByCode,
            discipline:
                pickString(
                    item,
                    'discipline',
                    'disciplineOther',
                    'discipline_other'
                ) || '-',
            projectStage:
                pickString(
                    item,
                    'projectStage',
                    'project_stage',
                    'projectStageOther',
                    'project_stage_other'
                ) || '-',
            reviewMethod:
                pickString(item, 'reviewMethod', 'review_method') || '-',
            documentTypes: pickStringArray(
                item,
                'documentTypes',
                'document_types',
                'documentsReviewed',
                'documents_reviewed'
            ),
            status: status as ConceptDesignReviewItem['status'],
            reviewedBy: this.getEmployeeName(reviewedByCode),
            reviewedByCode,
            respondedBy: this.getEmployeeName(respondedByCode),
            respondedByCode,
            signedBy: this.getEmployeeName(signedByCode),
            signedByCode,
            signedByTL: this.getEmployeeName(signedByTLCode),
            signedByTLCode,
            signedByTL2: this.getEmployeeName(signedByTL2Code),
            signedByTL2Code,
            acknowledgedBy: this.getEmployeeName(acknowledgedByCode),
            acknowledgedByCode,
            reviewerForAction:
                pickString(item, 'reviewerForAction', 'reviewer_for_action') ||
                '',
            teamLeadForAction:
                pickString(item, 'teamLeadForAction', 'team_lead_for_action') ||
                '',
            directorForAction:
                pickString(item, 'directorForAction', 'director_for_action') ||
                '',
            reviewedByStatus:
                pickString(item, 'reviewedByStatus', 'reviewed_by_status') ||
                '',
            respondedByStatus:
                pickString(item, 'respondedByStatus', 'responded_by_status') ||
                '',
            signedByTLStatus:
                pickString(
                    item,
                    'signedByTLStatus',
                    'signed_by_tl_status',
                    'signed_by_t_l_status'
                ) || '',
            signedByTL2Status:
                pickString(
                    item,
                    'signedByTL2Status',
                    'signed_by_tl2_status',
                    'signed_by_t_l2_status'
                ) || '',
            acknowledgedByStatus:
                pickString(
                    item,
                    'acknowledgedByStatus',
                    'acknowledged_by_status'
                ) || '',
            createdAt:
                pickDate(item, 'createdAt', 'created_at', 'createdDate') ??
                new Date(),
            updatedAt:
                pickDate(
                    item,
                    'updatedAt',
                    'updated_at',
                    'lastModified',
                    'createdAt',
                    'created_at'
                ) ?? new Date(),
        };
    }
    onListSortChange(event: ListSortEvent): void {
        this.listSort = event;
        this.pageIndex = 0;
        this.refreshCurrentView();
    }
}
