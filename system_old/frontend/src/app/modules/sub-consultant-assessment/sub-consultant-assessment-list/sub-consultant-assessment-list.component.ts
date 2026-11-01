import { CommonModule, DOCUMENT } from '@angular/common';
import {
    Component,
    HostListener,
    Inject,
    inject,
    OnDestroy,
    OnInit,
} from '@angular/core';
import { Subject, takeUntil } from 'rxjs';

import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';

import { Router, RouterLink } from '@angular/router';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import {
    PurchaseFormsFilterComponent,
    PurchaseFormsFilterConfig,
    PurchaseFormsFilterValues,
} from 'app/core/components/purchase-forms-filter';
import { ApiService } from 'app/core/services/api.service';
import { EmployeeService } from 'app/core/services/employee.service';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';
import {
    filterSubConsultantAssessmentActionRequests,
    getCurrentUserCode,
    isMyRequestByUserCode,
    isSubConsultantAssessmentPending,
} from 'app/core/utils/action-request-filter.util';
import { formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import {
    ListSortEvent,
    ListTableSortModule,
} from 'app/shared/list-table-sort/list-table-sort.module';

export interface SubConsultantAssessmentListItem {
    id: number;
    form_code: string;
    to: string;
    circ: string;
    company: string;
    item1_total_score: number;
    recommendation: 'accept' | 'not_accept';
    status:
        | 'draft'
        | 'submitted'
        | 'assessed'
        | 'approved'
        | 'rejected'
        | 'pending';

    assessed_by?: string | null;
    assessed_by_date?: string | null;
    assessed_by_status?: string | null;

    approved_by?: string | null;
    approved_by_date?: string | null;
    approved_by_status?: string | null;

    acknowledged_by?: string | null;
    acknowledged_by_date?: string | null;
    acknowledged_by_status?: string | null;

    create_by?: string | null;
    update_by?: string | null;
    created_at: string;
    updated_at: string;
    No?: number;
}

interface ActionRequestItem {
    id: string;
    request: SubConsultantAssessmentListItem;
    actionType: 'approved_by_status' | 'acknowledged_by_status';
    currentStatus: string | null;
}

@Component({
    selector: 'app-sub-consultant-assessment-list',
    standalone: true,
    imports: [
        ListTableSortModule,
        CommonModule,
        MatTableModule,
        MatIconModule,
        MatMenuModule,
        MatProgressSpinnerModule,
        MatPaginatorModule,
        FuseAlertComponent,
        RouterLink,
        PurchaseFormsFilterComponent,
    ],
    templateUrl: './sub-consultant-assessment-list.component.html',
    styleUrls: ['./sub-consultant-assessment-list.component.scss'],
})
export class SubConsultantAssessmentListComponent implements OnInit, OnDestroy {
    private _unsubscribeAll: Subject<any> = new Subject<any>();
    readonly navigationPermissionService = inject(NavigationPermissionService);
    readonly permissionNavId = 'sub-consultant-assessment';

    /** columns ของ mat-table (ต้องตรงกับ matColumnDef) */
    displayedColumns: string[] = [
        'company',
        'score',
        'assessed_by',
        'created_at',
        'updated_at',
        'status',
        'actions',
    ];

    actionDisplayedColumns: string[] = [
        'company',
        'score',
        'assessed_by',
        'actionStep',
        'status',
        'action',
    ];

    // Tab: 'all' | 'my' | 'pending' | 'action'
    currentTab: 'all' | 'my' | 'pending' | 'action' = 'all';
    viewMode: 'card' | 'table' = 'table';
    showFilterPanel = false;

    // Filter properties
    searchTerm = '';
    statusFilter = '';
    projectTypeFilter = '';
    filteredDataSource: SubConsultantAssessmentListItem[] = [];

    filterConfig: PurchaseFormsFilterConfig = {
        searchLabel: 'Search Sub-Consultant Assessment',
        searchPlaceholder: 'Search by Company, Creator, or Assessor...',
        statusFilterLabel: 'Filter by Status',
        statusOptions: [
            { value: 'pending', label: 'Pending' },
            { value: 'reject', label: 'Rejected' },
            { value: 'approve', label: 'Approved' },
        ],
        thirdFilterLabel: '',
        thirdFilterOptions: [],
        showThirdFilter: false,
    };

    // Action requests
    private allActionRequests: ActionRequestItem[] = [];
    actionRequests: ActionRequestItem[] = [];

    /** data ทั้งหมด */
    private allData: SubConsultantAssessmentListItem[] = [];

    isLoading = false;
    alert: { type: FuseAlertType; message: string } | null = null;

    // paginator
    totalRecords = 0;
    pageSize = 10;
    pageIndex = 0;
    listSort: ListSortEvent = { column: 3, dir: 'desc' };
    employeeLookup = new Map<string, string>();

    constructor(
        private router: Router,
        private fuseConfirmationService: FuseConfirmationService,
        private apiService: ApiService,
        private employeeService: EmployeeService,
        @Inject(DOCUMENT) private document: Document
    ) {}

    ngOnInit(): void {
        this.employeeService
            .getEmployeeLookupMap()
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((lookup) => {
                this.employeeLookup = lookup;
            });
        if (
            !this.navigationPermissionService.hasViewAllPermissionByNavId(
                this.permissionNavId
            )
        ) {
            this.currentTab = 'my';
        }
        this.loadAssessments();
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    getEmployeeLabel(ref: string | number | null | undefined): string {
        return this.employeeService.formatEmployeeReference(
            ref,
            this.employeeLookup,
            'N/A'
        );
    }

    private getApprovedEmployeeLabel(
        ref: string | number | null | undefined,
        status: string | null | undefined
    ): string {
        return this.isApprovedStatus(status) ? this.getEmployeeLabel(ref) : '';
    }

    private getApprovedPrintDate(
        dateString: string | null | undefined,
        status: string | null | undefined,
        formatter: (dateString: string | null | undefined) => string
    ): string {
        return this.isApprovedStatus(status) ? formatter(dateString) : '';
    }

    private isApprovedStatus(status: string | null | undefined): boolean {
        const normalized = String(status || '')
            .trim()
            .toLowerCase();
        return normalized === 'approve' || normalized === 'approved';
    }

    /** โหลดข้อมูลจาก API */
    loadAssessments(): void {
        this.isLoading = true;
        this.alert = null;

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
            start: 0,
            length: -1,
            search: {
                value: this.searchTerm || '',
                regex: false,
            },
        };

        this.apiService
            .getSubConsultantAssessmentPage(requestBody)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (response) => {
                    if (response.status && response.data) {
                        const items = response.data.data || [];

                        // Map API response to component interface
                        this.allData = items.map((item: any) => ({
                            id: item.id,
                            form_code: item.form_code || '',
                            to: item.to || '',
                            circ: item.circ || '',
                            company: item.company || '',
                            item1_total_score: item.item1_total_score || 0,
                            recommendation: item.recommendation || 'not_accept',
                            status: item.status || 'draft',
                            assessed_by: item.assessed_by || null,
                            assessed_by_date: item.assessed_by_date || null,
                            assessed_by_status:
                                item.assessed_by_status ??
                                item.assessedByStatus ??
                                null,
                            approved_by: item.approved_by || null,
                            approved_by_date: item.approved_by_date || null,
                            approved_by_status:
                                item.approved_by_status ??
                                item.approvedByStatus ??
                                null,
                            acknowledged_by: item.acknowledged_by || null,
                            acknowledged_by_date:
                                item.acknowledged_by_date || null,
                            acknowledged_by_status:
                                item.acknowledged_by_status ??
                                item.acknowledgedByStatus ??
                                null,
                            create_by: item.create_by || null,
                            update_by: item.update_by || null,
                            created_at: item.created_at || '',
                            updated_at: item.updated_at || '',
                            No: item.No || 0,
                        }));

                        // Resolve employee names
                        const employeeCodes = new Set<string>();
                        this.allData.forEach((item) => {
                            if (item.create_by)
                                employeeCodes.add(item.create_by);
                            if (item.update_by)
                                employeeCodes.add(item.update_by);
                            if (item.assessed_by)
                                employeeCodes.add(item.assessed_by);
                            if (item.approved_by)
                                employeeCodes.add(item.approved_by);
                            if (item.acknowledged_by)
                                employeeCodes.add(item.acknowledged_by);
                        });

                        if (employeeCodes.size > 0) {
                            this.employeeService
                                .ensureEmployeesInLookup(
                                    this.employeeLookup,
                                    Array.from(employeeCodes)
                                )
                                .pipe(takeUntil(this._unsubscribeAll))
                                .subscribe();
                        }

                        // Update total records from API response
                        this.totalRecords = response.data.total || items.length;

                        // Build action requests
                        this.buildActionRequests();

                        // Initialize filtered data
                        this.onFilterChange(false);
                    } else {
                        this.showAlert(
                            'error',
                            response.message || 'Failed to load assessments'
                        );
                        this.allData = [];
                        this.filteredDataSource = [];
                        this.totalRecords = 0;
                    }
                    this.isLoading = false;
                },
                error: (error) => {
                    console.error('Error loading assessments:', error);
                    this.showAlert(
                        'error',
                        error?.error?.message ||
                            'Failed to load assessments. Please try again.'
                    );
                    this.allData = [];
                    this.filteredDataSource = [];
                    this.totalRecords = 0;
                    this.isLoading = false;
                },
            });
    }

    /** เปลี่ยน tab */
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
        this.closeFilterPanel();
        this.onFilterChange(false);
    }

    /** Apply client-side filters (for tab filtering) */
    applyClientSideFilters(resetPage = true): void {
        const term = (this.searchTerm || '').toLowerCase().trim();
        const userCode = getCurrentUserCode();

        this.filteredDataSource = this.allData.filter((item) => {
            // Filter by tab
            let matchesTab = true;
            if (this.currentTab === 'my') {
                // แสดงทุก request ที่มี code ของ user ปัจจุบันอยู่ในข้อมูล (ไม่สนว่าฟิลด์ไหน)
                matchesTab = isMyRequestByUserCode(item, userCode);
            } else if (this.currentTab === 'pending') {
                // แสดงเฉพาะที่ยังไม่ approve ครบทุกขั้นใน workflow
                matchesTab = isSubConsultantAssessmentPending(item);
            } else if (this.currentTab === 'all') {
                matchesTab = true; // แสดงทั้งหมด
            }

            const matchesSearch =
                !term ||
                (item.company || '').toLowerCase().includes(term) ||
                (item.create_by || '').toLowerCase().includes(term) ||
                this.getEmployeeLabel(item.create_by)
                    .toLowerCase()
                    .includes(term) ||
                this.getEmployeeLabel(item.assessed_by)
                    .toLowerCase()
                    .includes(term);

            const matchesStatus =
                !this.statusFilter ||
                this.getWorkflowStatus(item) === this.statusFilter;

            return matchesTab && matchesSearch && matchesStatus;
        });

        if (resetPage) {
            this.pageIndex = 0;
        }
    }

    private buildActionRequests(): void {
        // Get current user code from localStorage
        const userCode = getCurrentUserCode();

        // Filter action requests using utility function
        // This filters by user code AND workflow sequence
        this.allActionRequests = filterSubConsultantAssessmentActionRequests(
            this.allData,
            userCode
        );
        this.applyActionFilters();
    }

    onFilterChange(resetPage = true): void {
        if (this.currentTab === 'action') {
            this.applyActionFilters();
            this.filteredDataSource = this.actionRequests.map(
                (item) => item.request
            );
            this.totalRecords = this.actionRequests.length;
        } else {
            // Forms tab - use applyClientSideFilters
            this.applyClientSideFilters(resetPage);
            this.totalRecords = this.filteredDataSource.length;
        }
    }

    private applyActionFilters(): void {
        const term = (this.searchTerm || '').toLowerCase().trim();
        this.actionRequests = this.allActionRequests.filter((item) => {
            const request = item.request;
            const matchesSearch =
                !term ||
                (request.company || '').toLowerCase().includes(term) ||
                this.getEmployeeLabel(request.assessed_by)
                    .toLowerCase()
                    .includes(term);

            const matchesStatus =
                !this.statusFilter ||
                this.getWorkflowStatus(request) === this.statusFilter;

            return matchesSearch && matchesStatus;
        });
    }

    getStatusOptions(): string[] {
        return ['draft', 'submitted', 'assessed', 'approved', 'rejected'];
    }

    getProjectTypeOptions(): string[] {
        // Project type not available in API response
        return [];
    }

    clearFilters(): void {
        this.searchTerm = '';
        this.statusFilter = '';
        this.projectTypeFilter = '';
        this.pageIndex = 0;
        this.closeFilterPanel();
        this.onFilterChange();
    }

    onSearchTermChange(value: string): void {
        this.searchTerm = value;
        this.pageIndex = 0;
        this.onFilterChange();
    }

    onStatusFilterChange(value: string): void {
        this.statusFilter = value;
        this.pageIndex = 0;
        this.onFilterChange();
    }

    onProjectTypeFilterChange(value: string): void {
        this.projectTypeFilter = value;
        this.onFilterChange();
    }

    get actionRequestCount(): number {
        return this.allActionRequests.length;
    }

    get visibleRows(): SubConsultantAssessmentListItem[] {
        const start = this.pageIndex * this.pageSize;
        return this.filteredDataSource.slice(start, start + this.pageSize);
    }

    get filteredCount(): number {
        return this.currentTab === 'action'
            ? this.actionRequests.length
            : this.filteredDataSource.length;
    }

    get activeFilterCount(): number {
        return [
            this.searchTerm,
            this.statusFilter,
            this.projectTypeFilter,
        ].filter((value) => !!value).length;
    }

    get actionBaseCount(): number {
        return this.allActionRequests.length;
    }

    applyFilters(filters: PurchaseFormsFilterValues): void {
        this.searchTerm = filters.searchTerm || '';
        this.statusFilter = filters.statusFilter || '';
        this.projectTypeFilter = filters.thirdFilter || '';
        this.pageIndex = 0;
        this.closeFilterPanel();
        this.onFilterChange();
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

    getListTitle(): string {
        switch (this.currentTab) {
            case 'all':
                return 'All Sub-Consultant Assessments';
            case 'my':
                return 'My Sub-Consultant Assessments';
            case 'pending':
                return 'Pending Sub-Consultant Assessments';
            case 'action':
                return 'Action Requests';
            default:
                return 'Sub-Consultant Assessments';
        }
    }

    getEmptyTitle(): string {
        return this.currentTab === 'action'
            ? 'No action requests found'
            : 'No assessments found';
    }

    getEmptyDescription(): string {
        switch (this.currentTab) {
            case 'action':
                return 'No action requests found. All assessments have been processed.';
            case 'pending':
                return 'No assessments are pending your action at the moment.';
            case 'my':
                return "You haven't created any assessments yet.";
            case 'all':
            default:
                return 'No sub-consultant assessments have been created yet.';
        }
    }

    canShowCreateEmptyButton(): boolean {
        return (
            (this.currentTab === 'all' || this.currentTab === 'my') &&
            this.activeFilterCount === 0
        );
    }

    canShowMoreActions(item: SubConsultantAssessmentListItem): boolean {
        return (
            this.canEditOrDelete(item) &&
            (this.navigationPermissionService.hasEditPermissionByNavId(
                this.permissionNavId
            ) ||
                this.navigationPermissionService.hasDeletePermissionByNavId(
                    this.permissionNavId
                ))
        );
    }

    getScoreText(item: SubConsultantAssessmentListItem): string {
        return `${item.item1_total_score ?? 0}/30`;
    }

    getActionTypeText(
        actionType: 'approved_by_status' | 'acknowledged_by_status'
    ): string {
        switch (actionType) {
            case 'approved_by_status':
                return 'Approved By';
            case 'acknowledged_by_status':
                return 'Acknowledged By';
            default:
                return 'Action';
        }
    }

    getByStatusText(status: string | null | undefined): string {
        if (!status) return 'Pending';
        const statusLower = status.toLowerCase();
        switch (statusLower) {
            case 'pending':
                return 'Pending';
            case 'reject':
                return 'Rejected';
            case 'approve':
                return 'Approved';
            default:
                return status;
        }
    }

    getByStatusColor(status: string | null | undefined): string {
        if (!status) return 'bg-yellow-100 text-yellow-800';
        const statusLower = status.toLowerCase();
        switch (statusLower) {
            case 'pending':
                return 'bg-yellow-100 text-yellow-800';
            case 'approve':
                return 'bg-green-100 text-green-800';
            case 'reject':
                return 'bg-red-100 text-red-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    }

    private calculateStatus(
        item: SubConsultantAssessmentListItem
    ):
        | 'pending'
        | 'approved'
        | 'rejected'
        | 'draft'
        | 'submitted'
        | 'assessed' {
        // Use the status field directly from API response
        // If status is not set, determine based on approval dates
        if (item.status) {
            return item.status as
                | 'pending'
                | 'approved'
                | 'rejected'
                | 'draft'
                | 'submitted'
                | 'assessed';
        }

        // If no status, check if all approvals are complete
        const hasAssessed = !!(item.assessed_by && item.assessed_by_date);
        const hasApproved = !!(item.approved_by && item.approved_by_date);
        const hasAcknowledged = !!(
            item.acknowledged_by && item.acknowledged_by_date
        );

        if (hasAssessed && hasApproved && hasAcknowledged) {
            return 'approved';
        }

        if (hasAssessed || hasApproved) {
            return 'assessed';
        }

        return 'pending';
    }

    onCreateNew(): void {
        this.router.navigate(['/sub-consultant-assessment/new']);
    }

    onView(id: string | number): void {
        this.router.navigate(['/sub-consultant-assessment/view', id]);
    }

    onEdit(id: string | number): void {
        this.router.navigate(['/sub-consultant-assessment/edit', id]);
    }

    onDelete(id: string | number): void {
        const confirmation = this.fuseConfirmationService.open({
            title: 'Delete assessment',
            message:
                'Are you sure you want to remove this assessment? This action cannot be undone!',
            icon: {
                show: true,
                name: 'heroicons_outline:exclamation-triangle',
                color: 'warn',
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Delete',
                    color: 'warn',
                },
                cancel: {
                    show: true,
                    label: 'Cancel',
                },
            },
            dismissible: false,
        });

        confirmation.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                this.isLoading = true;
                this.apiService.deleteSubConsultantAssessment(id).subscribe({
                    next: (response) => {
                        this.isLoading = false;
                        if (response.status) {
                            this.showAlert(
                                'success',
                                response.message ||
                                    'Assessment deleted successfully!'
                            );
                            // Reload the list to reflect the deletion
                            this.loadAssessments();
                        } else {
                            this.showAlert(
                                'error',
                                response.message ||
                                    'Failed to delete assessment.'
                            );
                        }
                    },
                    error: (error) => {
                        console.error('Error deleting assessment:', error);
                        this.isLoading = false;
                        this.showAlert(
                            'error',
                            error?.error?.message ||
                                'Failed to delete assessment. Please try again.'
                        );
                    },
                });
            }
        });
    }

    // เวลาเปลี่ยนหน้า / เปลี่ยนจำนวนต่อหน้า
    onPageChange(event: PageEvent): void {
        this.pageSize = event.pageSize;
        this.pageIndex = event.pageIndex;
    }

    onListSortChange(sort: ListSortEvent): void {
        this.listSort = sort;
        this.pageIndex = 0;
        this.loadAssessments();
    }

    showAlert(type: FuseAlertType, message: string): void {
        this.alert = { type, message };
        setTimeout(() => (this.alert = null), 5000);
    }

    // -------- Helpers --------

    getStatusBadgeClass(status: string): string {
        switch (status) {
            case 'draft':
                return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
            case 'submitted':
                return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
            case 'assessed':
                return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
            case 'pending':
                return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
            case 'approved':
                return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'rejected':
                return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
            default:
                return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
        }
    }

    getStatusLabel(status: string): string {
        switch (status) {
            case 'draft':
                return 'Draft';
            case 'submitted':
                return 'Submitted';
            case 'assessed':
                return 'Assessed';
            case 'pending':
                return 'Pending';
            case 'approved':
                return 'Approved';
            case 'rejected':
                return 'Rejected';
            default:
                return status;
        }
    }

    getRecommendationLabel(recommendation: string): string {
        switch (recommendation) {
            case 'accept':
                return 'Accept';
            case 'not_accept':
                return 'Not Accept';
            default:
                return recommendation;
        }
    }

    getRecommendationBadgeClass(recommendation: string): string {
        switch (recommendation) {
            case 'accept':
                return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'not_accept':
                return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
            default:
                return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
        }
    }

    getWorkflowStatus(
        item: SubConsultantAssessmentListItem
    ): 'pending' | 'reject' | 'approve' {
        const statuses = [item.approved_by_status, item.acknowledged_by_status];
        if (
            statuses.some(
                (s) =>
                    s?.toLowerCase() === 'reject' ||
                    s?.toLowerCase() === 'rejected'
            )
        )
            return 'reject';
        if (
            statuses.every(
                (s) =>
                    s?.toLowerCase() === 'approve' ||
                    s?.toLowerCase() === 'approved'
            )
        )
            return 'approve';
        return 'pending';
    }

    canEditOrDelete(item: SubConsultantAssessmentListItem): boolean {
        const status = this.getWorkflowStatus(item);
        return status === 'pending';
    }

    getWorkflowStatusBadgeClass(item: SubConsultantAssessmentListItem): string {
        const status = this.getWorkflowStatus(item);
        switch (status) {
            case 'approve':
                return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'reject':
                return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
            default:
                return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
        }
    }

    formatDate(dateString: string | null | undefined): string {
        return formatDateTimeDisplay(dateString);
    }

    onPrint(id: string | number): void {
        this.isLoading = true;
        this.apiService.getSubConsultantAssessment(id.toString()).subscribe({
            next: (response) => {
                this.isLoading = false;
                if (response.status && response.data) {
                    this.printAssessment(response.data);
                } else {
                    this.showAlert(
                        'error',
                        response.message ||
                            'Failed to load assessment for printing'
                    );
                }
            },
            error: (error) => {
                console.error('Error loading assessment for print:', error);
                this.isLoading = false;
                this.showAlert(
                    'error',
                    error?.error?.message ||
                        'Failed to load assessment. Please try again.'
                );
            },
        });
    }

    private printAssessment(assessment: any): void {
        // Open print dialog in new window
        const printWindow = this.document.defaultView?.open('', '_blank');
        if (!printWindow) {
            return;
        }

        // Create a temporary container
        const container = this.document.createElement('div');
        container.innerHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Sub-Consultant Assessment Form</title>
          <style>
            ${this.getPrintStyles()}
          </style>
        </head>
        <body>
          ${this.getPrintHTML(assessment)}
        </body>
      </html>
    `;

        printWindow.document.write(container.innerHTML);
        printWindow.document.close();

        // Wait for content to load then print
        printWindow.onload = () => {
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 250);
        };
    }

    private getPrintHTML(assessment: any): string {
        const references = assessment.references || [];
        const hasCompliance =
            assessment.ems_iso_14001 === 1 ||
            assessment.ems_iso_45001 === 1 ||
            assessment.ems_ohsas_18001 === 1;
        const subConsultantListDecision =
            this.getSubConsultantListDecision(assessment);
        const approvedToSubConsultantList =
            subConsultantListDecision === true;
        const notApprovedToSubConsultantList =
            subConsultantListDecision === false;

        const formatDate = (dateString: string | null | undefined): string => {
            if (!dateString) return '';
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString;
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            return `${day}-${month}-${year}`;
        };

        // Generate references HTML - ensure at least 2 references
        let referencesHTML = '';
        for (let i = 0; i < Math.max(2, references.length); i++) {
            const ref = references[i];
            const label = String.fromCharCode(97 + i);
            const name = ref?.reference_name || '';
            const opinion =
                ref?.opinion === 'good'
                    ? 'positive'
                    : ref?.opinion === 'poor'
                      ? 'negative'
                      : ref?.opinion === 'neutral'
                        ? 'neutral'
                        : 'negative, neutral, positive';
            referencesHTML += `
        <div class="ref-item">
          <span class="ref-label">${label})</span>
          <span>Name:</span>
          <span class="dotted-line">${name}</span>
        </div>
        <div class="ref-opinion">Opinion: ${opinion}</div>
      `;
        }

        return `
      <div class="page">
        <!-- Header -->
        <table class="header-table">
          <tr>
            <td class="header-left">
              <div>To :</div>
              <div class="company-name">Meinhardt (Thailand) Ltd.</div>
            </td>
            <td class="header-center">
              <div>Circ:</div>
              <div class="dotted-short">${assessment.circ || ''}</div>
            </td>
            <td class="header-right">
              <div class="form-code">${assessment.form_code || '/AM/T6SC'}</div>
              <div class="logo"><img src="/erpAsset 2alogo.png" alt="MEINHARDT" style="height: 20px; max-width: 150px;" /></div>
              <div class="form-number">10 - FORM MTSC-01</div>
            </td>
          </tr>
        </table>

        <!-- Title -->
        <div class="title">SUB-CONSULTANT ASSESSMENT FORM</div>

        <!-- Main Content Box -->
        <div class="content-box">
          <!-- Scope -->
          <div class="row">
            <span class="label">Scope of service required:</span>
            <span class="dotted-line">${assessment.scope_of_service || ''}</span>
          </div>

          <!-- Information used -->
          <div class="row">
            <span class="label">Information used for Assessment:</span>
            <span class="checkbox">☐</span> Company Profile / Biodata
            <span class="checkbox ml">☐</span> Previous Assessment Record
          </div>
          <div class="row indent">
            <span class="checkbox">☐</span> Project Reference / Certificates
            <span class="checkbox ml">☐</span> Previous Evaluation Record
          </div>
          <div class="row indent">
            <span class="checkbox">☐</span> Site Visit
            <span class="checkbox ml">☐</span> ISO Certificates
          </div>

          <!-- Assessment -->
          <div class="section-title">Assessment:</div>
          <div class="row">
            <span class="label">1.</span>
            <span>Company:</span>
            <span class="dotted-line">${assessment.company || ''}</span>
          </div>

          <!-- Table -->
          <table class="score-table">
            <thead>
              <tr>
                <th rowspan="2" class="col-area">Assessment Areas</th>
                <th rowspan="2" class="col-score">Score<br>(1 to 10)</th>
                <th colspan="4">Criteria of Scores</th>
              </tr>
              <tr>
                <th>1-2</th>
                <th>3-5</th>
                <th>6-8</th>
                <th>9-10</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>•  Experience since establishment</td>
                <td class="center">${assessment.score_experience_since_establishment || ''}</td>
                <td class="center">1-2</td>
                <td class="center">3-5</td>
                <td class="center">6-10</td>
                <td class="center">10 + years</td>
              </tr>
              <tr>
                <td>•  Fully qualified staff</td>
                <td class="center">${assessment.score_fully_qualified_staff || ''}</td>
                <td class="center">1-4</td>
                <td class="center">5-10</td>
                <td class="center">11-50</td>
                <td class="center">50 + Persons</td>
              </tr>
              <tr>
                <td>•  Satisfactorily completed projects similar to that MTL would use them for</td>
                <td class="center">${assessment.score_completed_similar_projects || ''}</td>
                <td class="center">0-1</td>
                <td class="center">2-4</td>
                <td class="center">5-10</td>
                <td class="center">10+Projects</td>
              </tr>
            </tbody>
          </table>

          <div class="total-row">
            <span class="total-label">Total Score  =</span>
            <span class="total-value">${assessment.item1_total_score || ''}</span>
            <span class="total-note">(must exceed 15)</span>
          </div>

          <!-- Compliance -->
          <div class="row">
            <span class="label">2.</span>
            <span>Compliance to EMS and OHSMS:</span>
          </div>
          <div class="compliance-row">
            <div class="compliance-line">
              <span>•  Obtained certificates of ISO 14001 and/or OHSAS 18001/ISO 45001</span>
              <span class="checkbox ml">${hasCompliance ? '☑' : '☐'}</span> Yes
              <span class="checkbox ml">${!hasCompliance ? '☑' : '☐'}</span> No
            </div>
          </div>

          <!-- References -->
          <div class="row">
            <span class="label">3.</span>
            <span>References</span>
          </div>
          <div class="row italic">Contact at least one external reference and record name and opinion</div>
          ${referencesHTML}

          <!-- Recommendation -->
          <div class="section-title underline">Recommendation:</div>
          <div class="row">
            <span class="checkbox">${assessment.recommendation === 'accept' ? '☑' : '☐'}</span>
            <span>Accept (Score in item 1 must be 15 or better and must have at least one good positive reference.)</span>
          </div>
          <div class="row">
            <span class="checkbox">${assessment.recommendation === 'not_accept' ? '☑' : '☐'}</span>
            <span>Not accept</span>
          </div>
          <div class="row">
            <span class="label">Reason:</span>
            <span class="dotted-line">${assessment.recommendation_reason || ''}</span>
          </div>
          <div class="dotted-full"></div>
          <div class="dotted-full"></div>
          <div class="dotted-full"></div>
          <div class="dotted-full"></div>

          <!-- Assessed By -->
          <div class="signature-row">
            <span>Assessed By:</span>
            <span class="dotted-sig">${assessment.assessed_by || ''}</span>
            <span class="role">(DI/ TL)</span>
            <span>Date:</span>
            <span class="dotted-date">${formatDate(assessment.assessed_by_date)}</span>
          </div>

          <!-- Approval Question -->
          <div class="row">
            <span>Is the above Sub-Consultant approved to go on the Sub-Consultant List?</span>
          </div>
          <div class="row">
            <span class="checkbox">${approvedToSubConsultantList ? '☑' : '☐'}</span> Yes
            <span class="checkbox ml">${notApprovedToSubConsultantList ? '☑' : '☐'}</span> No
          </div>

          <!-- Remark -->
          <div class="row">
            <span class="label">Remark:</span>
            <span class="dotted-line">${assessment.remark || ''}</span>
          </div>
          <div class="dotted-full"></div>
          <div class="dotted-full"></div>
          <div class="dotted-full"></div>
          <div class="dotted-full"></div>

          <!-- Approved By -->
          <div class="signature-row">
            <span>Approved By:</span>
            <span class="dotted-sig">${this.getApprovedEmployeeLabel(assessment.approved_by, assessment.approved_by_status)}</span>
            <span class="role">(MD/DI)</span>
            <span>Date:</span>
            <span class="dotted-date">${this.getApprovedPrintDate(assessment.approved_by_date, assessment.approved_by_status, formatDate)}</span>
          </div>

          <!-- Acknowledged By -->
          <div class="signature-row">
            <span>Acknowledged By:</span>
            <span class="dotted-sig">${this.getApprovedEmployeeLabel(assessment.acknowledged_by, assessment.acknowledged_by_status)}</span>
            <span class="role">(IMR)</span>
            <span>Date:</span>
            <span class="dotted-date">${this.getApprovedPrintDate(assessment.acknowledged_by_date, assessment.acknowledged_by_status, formatDate)}</span>
          </div>
        </div>

        <!-- Footer -->
        <div class="footer">
          <span>Z:/MR/MYDOCUMENTS/IMS DOCUMENT/IMS DOCUMENTATION/FORMS/378ED149E70FBF78D47A09A570CF48F2E365C4C58A321C787CDCE5D4D4CAF1EA.DOC/ REV.D (03/12/2020)/CC/MR</span>
          <span class="page-num">Page 1 of 1</span>
        </div>
      </div>
      `;
    }

    private getSubConsultantListDecision(assessment: any): boolean | null {
        const decision = assessment?.decision_sub_consultant_list;
        if (decision !== null && decision !== undefined && decision !== '') {
            const normalized = String(decision).toLowerCase();
            if (
                decision === true ||
                decision === 1 ||
                normalized === '1' ||
                normalized === 'true' ||
                normalized === 'yes'
            ) {
                return true;
            }
            if (
                decision === false ||
                decision === 0 ||
                normalized === '0' ||
                normalized === 'false' ||
                normalized === 'no'
            ) {
                return false;
            }
        }

        const approvedStatus = String(assessment?.approved_by_status || '').toLowerCase();
        if (approvedStatus === 'approved' || approvedStatus === 'approve') {
            return true;
        }
        if (approvedStatus === 'rejected' || approvedStatus === 'reject') {
            return false;
        }

        return null;
    }

    private getPrintStyles(): string {
        return `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.4; color: #000; background: #fff; }

      .page { width: 210mm; padding: 10mm 15mm; margin: 0 auto; }

      /* Header */
      .header-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
      .header-table td { vertical-align: top; padding: 3px 0; }
      .header-left { width: 40%; }
      .header-center { width: 30%; }
      .header-right { width: 30%; text-align: right; }
      .company-name { font-weight: bold; }
      .dotted-short { border-bottom: 1px dotted #000; border-style: dotted; border-width: 0 0 1px 0; display: inline-block; min-width: 150px; }
      .form-code { font-size: 10pt; }
      .logo { font-size: 16pt; font-weight: bold; letter-spacing: 2px; text-align: right; }
      .logo img { height: 20px; max-width: 150px; object-fit: contain; display: block; margin-left: auto; }
      .form-number { font-size: 9pt; }

      /* Title - 14-16 pt (Bold) */
      .title { text-align: center; font-size: 15pt; font-weight: bold; text-decoration: underline; margin: 10px 0; color: #144c90; text-decoration-color: #144c90; }

      /* Content Box */
      .content-box { border: 1px solid #000; padding: 10px 12px; page-break-inside: avoid; break-inside: avoid; }

      /* Rows - Body 10-11 pt (Regular) */
      .row { margin: 5px 0; font-size: 10pt; }
      .indent { margin-left: 180px; }
      .label { font-weight: bold; margin-right: 5px; }
      .dotted-line { border-bottom: 1px dotted #000; border-style: dotted; border-width: 0 0 1px 0; display: inline-block; min-width: 300px; margin-left: 5px; }
      .dotted-full { border-bottom: 1px dotted #000; border-style: dotted; border-width: 0 0 1px 0; width: 100%; height: 1px; margin: 8px 0; }
      .checkbox { font-size: 12pt; margin-right: 3px; }
      .ml { margin-left: 30px; }
      .italic { font-style: italic; font-size: 10pt; }

      /* Section Title - 11-12 pt (Bold) */
      .section-title { font-weight: bold; font-size: 12pt; margin: 8px 0 5px 0; }
      .section-title.underline { text-decoration: underline; }

      /* Score Table - 10-11 pt (Regular) */
      .score-table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 10pt; }
      .score-table th, .score-table td { border: 1px solid #000; padding: 5px 6px; }
      .score-table th { background: #f5f5f5; font-weight: bold; text-align: center; }
      .score-table .col-area { width: 45%; text-align: left; }
      .score-table .col-score { width: 12%; text-align: center; }
      .score-table td.center { text-align: center; }

      /* Total */
      .total-row { margin: 10px 0; text-align: center; font-size: 10pt; }
      .total-label { font-weight: bold; }
      .total-value { border-bottom: 1px solid #000; display: inline-block; min-width: 50px; text-align: center; font-weight: bold; }
      .total-note { margin-left: 10px; font-size: 10pt; }

      /* References */
      .ref-item { margin: 5px 0 0 20px; font-size: 10pt; }
      .ref-label { font-weight: bold; margin-right: 5px; }
      .ref-opinion { margin: 3px 0 6px 40px; font-size: 10pt; }

      /* Compliance */
      .compliance-row { margin: 5px 0 5px 20px; font-size: 10pt; }
      .compliance-line { display: flex; align-items: baseline; flex-wrap: nowrap; }

      /* Signatures */
      .signature-row { margin: 10px 0; font-size: 10pt; display: flex; align-items: baseline; gap: 5px; }
      .dotted-sig { border-bottom: 1px dotted #000; border-style: dotted; border-width: 0 0 1px 0; display: inline-block; min-width: 150px; }
      .dotted-date { border-bottom: 1px dotted #000; border-style: dotted; border-width: 0 0 1px 0; display: inline-block; min-width: 100px; }
      .role { font-size: 10pt; margin: 0 10px; }

      /* Footer */
      .footer { margin-top: 15px; padding-top: 6px; border-top: 1px solid #ccc; font-size: 7pt; color: #666; display: flex; justify-content: space-between; }
      .page-num { text-align: right; }

      @media print {
        @page { size: A4 portrait; margin: 10mm; }
        body { margin: 0; padding: 0; }
        .page { padding: 0; width: 100%; page-break-inside: avoid; break-inside: avoid; }
        .content-box { page-break-inside: avoid; break-inside: avoid; }
      }
    `;
    }
}
