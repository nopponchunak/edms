import { CommonModule, DOCUMENT } from '@angular/common';
import {
    Component,
    HostListener,
    Inject,
    inject,
    OnDestroy,
    OnInit,
} from '@angular/core';

import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';

import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import {
    PurchaseFormsFilterComponent,
    PurchaseFormsFilterConfig,
    PurchaseFormsFilterValues,
} from 'app/core/components/purchase-forms-filter';
import { EmployeeService } from 'app/core/services/employee.service';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';
import {
    SubConsultantEvaluation,
    SubConsultantEvaluationService,
    SubConsultantEvaluationsPageRequest,
} from 'app/core/services/sub-consultant-evaluation.service';
import {
    filterSubConsultantEvaluationActionRequests,
    getCurrentUserCode,
    isMyRequestByUserCode,
    isSubConsultantEvaluationPending,
} from 'app/core/utils/action-request-filter.util';
import { formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

interface ActionRequestItem {
    id: number;
    request: SubConsultantEvaluationListItem;
    actionType: 'approved_by_status' | 'acknowledged_by_status';
    currentStatus: string | null;
}

type EvaluationListTab = 'all' | 'my' | 'pending' | 'action';

export interface SubConsultantEvaluationListItem {
    id: number;
    subConsultantName: string;
    projectName?: string;
    projectNo?: string;
    // Audit
    createBy?: string;
    updateBy?: string | null;
    createdAt: string;
    updatedAt: string;
    No?: number;
    // Workflow information
    evaluatedBy?: string | null;
    evaluatedByDate?: string | null;
    evaluatedByStatus?: 'pending' | 'reject' | 'approve' | null;
    approvedBy?: string | null;
    approvedByDate?: string | null;
    approvedByStatus?: 'pending' | 'reject' | 'approve' | null;
    acknowledgedBy?: string | null;
    acknowledgedByDate?: string | null;
    acknowledgedByStatus?: 'pending' | 'reject' | 'approve' | null;
    status?:
        | 'draft'
        | 'submitted'
        | 'evaluated'
        | 'approved'
        | 'rejected'
        | 'pending';
    projectType?: string;
}

@Component({
    selector: 'app-sce-list',
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
    templateUrl: './sce-list.component.html',
    styleUrls: ['./sce-list.component.scss'],
})
export class SceListComponent implements OnInit, OnDestroy {
    listSort: ListSortEvent = { column: 0, dir: 'asc' };
    readonly navigationPermissionService = inject(NavigationPermissionService);
    readonly permissionNavId = 'sub-consultant-evaluation';

    /** columns ต้องตรงกับ matColumnDef ใน HTML */
    displayedColumns: string[] = [
        'subConsultant',
        'project',
        'evaluatedBy',
        'createdAt',
        'updatedAt',
        'status',
        'actions',
    ];

    actionDisplayedColumns: string[] = [
        'subConsultant',
        'project',
        'evaluatedBy',
        'actionStep',
        'status',
        'action',
    ];

    /** เก็บข้อมูลทั้งหมด + ข้อมูลของ Action Request */
    private allData: SubConsultantEvaluationListItem[] = [];
    private allActionRequests: ActionRequestItem[] = [];
    actionRequests: ActionRequestItem[] = [];

    isLoading = false;
    alert: { type: FuseAlertType; message: string } | null = null;

    // paginator
    totalRecords = 0;
    pageSize = 10;
    pageIndex = 0;
    draw = 1;

    // Tab: 'all' | 'my' | 'pending' | 'action'
    currentTab: EvaluationListTab = 'all';
    viewMode: 'card' | 'table' = 'table';
    showFilterPanel = false;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // Filters
    searchTerm = '';
    statusFilter = '';
    projectTypeFilter = '';
    filteredDataSource: SubConsultantEvaluationListItem[] = [];
    employeeLookup = new Map<string, string>();

    // Filter config
    filterConfig: PurchaseFormsFilterConfig = {
        searchLabel: 'Search Sub-Consultant Evaluation',
        searchPlaceholder: 'Search by sub-consultant, project, or evaluator...',
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

    constructor(
        private router: Router,
        private route: ActivatedRoute,
        private fuseConfirmationService: FuseConfirmationService,
        private evaluationService: SubConsultantEvaluationService,
        private employeeService: EmployeeService,
        @Inject(DOCUMENT) private document: Document
    ) {}

    private canAccessAllRequests(): boolean {
        return this.navigationPermissionService.hasViewAllPermissionByNavId(
            this.permissionNavId
        );
    }

    private normalizeTab(tab: EvaluationListTab): EvaluationListTab {
        return tab === 'all' && !this.canAccessAllRequests() ? 'my' : tab;
    }

    private isListTab(value: unknown): value is EvaluationListTab {
        return (
            value === 'all' ||
            value === 'my' ||
            value === 'pending' ||
            value === 'action'
        );
    }

    ngOnInit(): void {
        this.employeeService
            .getEmployeeLookupMap()
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((lookup) => {
                this.employeeLookup = lookup;
            });
        this.currentTab = this.normalizeTab(this.currentTab);
        this.route.queryParams
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((params) => {
                if (this.isListTab(params['tab'])) {
                    this.currentTab = this.normalizeTab(params['tab']);
                }
                this.pageIndex = 0;
                this.closeFilterPanel();
                this.loadEvaluations();
            });
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

    /** โหลดข้อมูลจาก API */
    loadEvaluations(): void {
        this.currentTab = this.normalizeTab(this.currentTab);
        this.isLoading = true;
        this.alert = null;

        const request: SubConsultantEvaluationsPageRequest = {
            draw: this.draw,
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
            length: 1000,
            search: {
                value: this.searchTerm || '',
                regex: false,
            },
        };

        this.evaluationService
            .findAllPaginated(request)
            .pipe(
                catchError((err) => {
                    this.alert = {
                        type: 'error',
                        message:
                            err?.error?.message ||
                            'Failed to load sub-consultant evaluations. Please try again.',
                    };
                    return of({
                        data: [],
                        total: 0,
                        currentPage: 1,
                        perPage: 10,
                        lastPage: 1,
                    });
                }),
                finalize(() => (this.isLoading = false))
            )
            .subscribe((response) => {
                // Transform API response to component data structure
                this.allData = response.data.map((item) =>
                    this.transformApiItemToListItem(item)
                );

                // Resolve employee names
                const employeeCodes = new Set<string>();
                this.allData.forEach((item) => {
                    if (item.createBy) employeeCodes.add(item.createBy);
                    if (item.updateBy) employeeCodes.add(item.updateBy);
                    if (item.evaluatedBy) employeeCodes.add(item.evaluatedBy);
                    if (item.approvedBy) employeeCodes.add(item.approvedBy);
                    if (item.acknowledgedBy)
                        employeeCodes.add(item.acknowledgedBy);
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

                // Build action requests for action tab
                this.buildActionRequests();

                // Apply tab-specific data
                this.onFilterChange(false);
            });
    }

    /** Transform API SubConsultantEvaluation to SubConsultantEvaluationListItem */
    private transformApiItemToListItem(
        item: SubConsultantEvaluation
    ): SubConsultantEvaluationListItem {
        const raw = item as SubConsultantEvaluation & {
            status?: SubConsultantEvaluationListItem['status'];
            project_type?: string;
            projectType?: string;
        };

        return {
            id: item.id,
            subConsultantName: item.sub_consultant_name || '',
            projectName: item.project_name || '',
            projectNo: item.project_no || '',
            createBy: item.create_by,
            updateBy: item.update_by,
            createdAt: item.created_at,
            updatedAt: item.updated_at,
            No: item.No,
            evaluatedBy: item.evaluated_by,
            evaluatedByDate: item.evaluated_date,
            evaluatedByStatus: item.evaluated_by_status ?? null,
            approvedBy: item.approved_by,
            approvedByDate: item.approved_date,
            approvedByStatus: item.approved_by_status ?? null,
            acknowledgedBy: item.acknowledged_by,
            acknowledgedByDate: item.acknowledged_date,
            acknowledgedByStatus: item.acknowledged_by_status ?? null,
            status: raw.status,
            projectType: raw.projectType || raw.project_type || '',
        };
    }

    /** Build action requests for Action Request tab */
    private buildActionRequests(): void {
        // Get current user code from localStorage
        const userCode = getCurrentUserCode();

        // Filter action requests using utility function
        // This filters by user code AND workflow sequence
        this.allActionRequests = filterSubConsultantEvaluationActionRequests(
            this.allData,
            userCode
        );
        this.applyActionFilters();
    }

    onTabChange(tab: EvaluationListTab): void {
        this.currentTab = this.normalizeTab(tab);
        // Reset to first page when changing tabs
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
                matchesTab = isSubConsultantEvaluationPending(item);
            } else if (this.currentTab === 'all') {
                matchesTab = true; // แสดงทั้งหมด
            }

            const matchesSearch =
                !term ||
                (item.subConsultantName || '').toLowerCase().includes(term) ||
                (item.projectName || '').toLowerCase().includes(term) ||
                (item.projectNo || '').toLowerCase().includes(term) ||
                this.getEmployeeLabel(item.evaluatedBy)
                    .toLowerCase()
                    .includes(term) ||
                this.getEmployeeLabel(item.createBy)
                    .toLowerCase()
                    .includes(term);

            const matchesStatus =
                !this.statusFilter ||
                this.getWorkflowStatus(item) === this.statusFilter;
            const matchesProjectType =
                !this.projectTypeFilter ||
                (item.projectType || '') === this.projectTypeFilter;

            return (
                matchesTab &&
                matchesSearch &&
                matchesStatus &&
                matchesProjectType
            );
        });

        if (resetPage) {
            this.pageIndex = 0;
        }
    }

    // ---- Actions ----
    onCreateNew(): void {
        this.router.navigate(['/sub-consultant-evaluation/new']);
    }

    onView(id: number): void {
        this.router.navigate(['/sub-consultant-evaluation/view', id]);
    }

    onEdit(id: number): void {
        this.router.navigate(['/sub-consultant-evaluation/edit', id]);
    }

    onPrint(id: number): void {
        this.isLoading = true;
        this.evaluationService.findOne(id).subscribe({
            next: (evaluation) => {
                this.isLoading = false;
                this.printEvaluation(evaluation);
            },
            error: (error) => {
                console.error('Error loading evaluation for print:', error);
                this.isLoading = false;
                this.showAlert(
                    'error',
                    error?.error?.message ||
                        'Failed to load evaluation. Please try again.'
                );
            },
        });
    }

    onDelete(id: number): void {
        const confirmation = this.fuseConfirmationService.open({
            title: 'Delete evaluation',
            message:
                'Are you sure you want to remove this evaluation? This action cannot be undone!',
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
                this.evaluationService.remove(id).subscribe({
                    next: () => {
                        // Reload data after successful deletion
                        this.loadEvaluations();
                        this.showAlert(
                            'success',
                            'Evaluation deleted successfully!'
                        );
                    },
                    error: (error) => {
                        console.error('Error deleting evaluation:', error);
                        this.showAlert(
                            'error',
                            error?.error?.message ||
                                'Failed to delete evaluation. Please try again.'
                        );
                    },
                });
            }
        });
    }

    onPageChange(event: PageEvent): void {
        this.pageSize = event.pageSize;
        this.pageIndex = event.pageIndex;
    }

    showAlert(type: FuseAlertType, message: string): void {
        this.alert = { type, message };
        setTimeout(() => (this.alert = null), 5000);
    }

    getStatusBadgeClass(status: string | undefined): string {
        switch (status) {
            case 'draft':
                return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
            case 'submitted':
                return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
            case 'evaluated':
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

    getStatusLabel(status: string | undefined): string {
        switch (status) {
            case 'draft':
                return 'Draft';
            case 'submitted':
                return 'Submitted';
            case 'evaluated':
                return 'Evaluated';
            case 'pending':
                return 'Pending';
            case 'approved':
                return 'Approved';
            case 'rejected':
                return 'Rejected';
            default:
                return status ?? '-';
        }
    }

    getActionTypeText(actionType: string): string {
        switch (actionType) {
            case 'approved_by_status':
                return 'Approved By';
            case 'acknowledged_by_status':
                return 'Acknowledged By';
            default:
                return 'Action';
        }
    }

    getWorkflowStatus(
        item: SubConsultantEvaluationListItem
    ): 'pending' | 'reject' | 'approve' {
        const statuses = [item.approvedByStatus, item.acknowledgedByStatus];
        if (
            statuses.some(
                (s) =>
                    s?.toLowerCase() === 'reject' ||
                    s?.toLowerCase() === 'rejected'
            )
        ) {
            return 'reject';
        }
        if (
            statuses.every(
                (s) =>
                    s?.toLowerCase() === 'approve' ||
                    s?.toLowerCase() === 'approved'
            )
        ) {
            return 'approve';
        }
        return 'pending';
    }

    getWorkflowStatusBadgeClass(item: SubConsultantEvaluationListItem): string {
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

    formatDate(dateString: string | null | undefined): string {
        return formatDateTimeDisplay(dateString);
    }

    getEvaluationName(element: SubConsultantEvaluationListItem): string {
        return element.subConsultantName || '-';
    }

    canEditOrDelete(item: SubConsultantEvaluationListItem): boolean {
        const status = this.getWorkflowStatus(item);
        return status === 'pending';
    }

    canShowMoreActions(item: SubConsultantEvaluationListItem): boolean {
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

    // Filter methods
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
                (request.subConsultantName || '')
                    .toLowerCase()
                    .includes(term) ||
                (request.projectName || '').toLowerCase().includes(term) ||
                (request.projectNo || '').toLowerCase().includes(term) ||
                this.getEmployeeLabel(request.evaluatedBy)
                    .toLowerCase()
                    .includes(term);

            const matchesStatus =
                !this.statusFilter ||
                this.getWorkflowStatus(request) === this.statusFilter;

            const matchesProjectType =
                !this.projectTypeFilter ||
                (request.projectType || '') === this.projectTypeFilter;

            return matchesSearch && matchesStatus && matchesProjectType;
        });
    }

    onSearchTermChange(value: string): void {
        this.searchTerm = value;
        // Reset to first page when searching
        this.pageIndex = 0;
        this.onFilterChange();
    }

    onStatusFilterChange(value: string): void {
        this.statusFilter = value;
        this.onFilterChange();
    }

    onProjectTypeFilterChange(value: string): void {
        this.projectTypeFilter = value;
        this.onFilterChange();
    }

    clearFilters(): void {
        this.searchTerm = '';
        this.statusFilter = '';
        this.projectTypeFilter = '';
        this.pageIndex = 0;
        this.closeFilterPanel();
        this.onFilterChange();
    }

    getProjectTypeOptions(): string[] {
        const allData =
            this.currentTab === 'action'
                ? this.allActionRequests.map((item) => item.request)
                : this.allData;
        const types = allData
            .map((item) => item.projectType)
            .filter((type): type is string => !!type);
        return [...new Set(types)].sort();
    }

    get visibleRows(): SubConsultantEvaluationListItem[] {
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

    get totalCount(): number {
        return this.currentTab === 'action'
            ? this.allActionRequests.length
            : this.allData.length;
    }

    get actionRequestCount(): number {
        return this.allActionRequests.length;
    }

    get actionBaseCount(): number {
        return this.actionRequestCount;
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
                return 'All Sub-Consultant Evaluations';
            case 'my':
                return 'My Sub-Consultant Evaluations';
            case 'pending':
                return 'Pending Sub-Consultant Evaluations';
            case 'action':
                return 'Action Requests';
            default:
                return 'Sub-Consultant Evaluations';
        }
    }

    getEmptyTitle(): string {
        return this.currentTab === 'action'
            ? 'No action requests found'
            : 'No evaluations found';
    }

    getEmptyDescription(): string {
        switch (this.currentTab) {
            case 'action':
                return 'No action requests found. All evaluations have been processed.';
            case 'pending':
                return 'No evaluations are pending your action at the moment.';
            case 'my':
                return "You haven't created any evaluations yet.";
            case 'all':
            default:
                return 'No sub-consultant evaluations have been created yet.';
        }
    }

    canShowCreateEmptyButton(): boolean {
        return (
            (this.currentTab === 'all' || this.currentTab === 'my') &&
            this.activeFilterCount === 0
        );
    }

    private printEvaluation(evaluation: SubConsultantEvaluation): void {
        const printWindow = this.document.defaultView?.open('', '_blank');
        if (!printWindow) {
            return;
        }

        const container = this.document.createElement('div');
        container.innerHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Sub-Consultant Evaluation Form</title>
          <style>
            ${this.getPrintStyles()}
          </style>
        </head>
        <body>
          ${this.getPrintHTML(evaluation)}
        </body>
      </html>
    `;

        printWindow.document.write(container.innerHTML);
        printWindow.document.close();

        printWindow.onload = () => {
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 250);
        };
    }

    private getPrintHTML(evaluation: SubConsultantEvaluation): string {
        const formatDate = (dateString: string | null | undefined): string => {
            if (!dateString) return '';
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString;
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            return `${day}-${month}-${year}`;
        };

        // Default item names
        const defaultItemNames = [
            'Quality and Accuracy of Document',
            'Timeliness of Documentation',
            "Understanding of MTL's Needs",
            'Cooperation and Responsiveness',
            'Management Abilities',
            'Compliance to EMS / OHSMS Requirements',
            'Overall Level of Satisfaction',
            'Others',
        ];

        const items = (evaluation.items || []).sort(
            (a, b) => (a.item_no || 0) - (b.item_no || 0)
        );

        // Calculate average rating from items that have ratings
        const itemsWithRatings = items.filter((item) => {
            const rating =
                typeof item.rating === 'number'
                    ? item.rating
                    : parseFloat(String(item.rating));
            return !isNaN(rating) && rating > 0;
        });
        const averageRating =
            itemsWithRatings.length > 0
                ? (
                      itemsWithRatings.reduce((sum, item) => {
                          const rating =
                              typeof item.rating === 'number'
                                  ? item.rating
                                  : parseFloat(String(item.rating)) || 0;
                          return sum + rating;
                      }, 0) / itemsWithRatings.length
                  ).toFixed(1)
                : '0.0';

        // Ensure at least 8 items are displayed with correct names
        const itemRows = [];
        for (let i = 1; i <= 8; i++) {
            const item = items.find((it) => it.item_no === i);
            const itemName = item?.item_name || defaultItemNames[i - 1] || '';

            // Format rating - show empty if no rating
            let ratingDisplay = '';
            if (
                item?.rating !== null &&
                item?.rating !== undefined &&
                item?.rating !== ''
            ) {
                const ratingValue =
                    typeof item.rating === 'number'
                        ? item.rating
                        : parseFloat(String(item.rating));
                if (!isNaN(ratingValue) && ratingValue >= 0) {
                    ratingDisplay = ratingValue.toString();
                }
            }

            // Format comment - show empty if no comment
            const commentDisplay = item?.comment || '';

            // Add B letter and vertical line for items 5, 6, 7
            let bCell = '';
            if (i === 5) {
                bCell = '<td rowspan="2" class="table-b-letter">B</td>';
            } else if (i === 7) {
                bCell = '<td class="table-b-line"></td>';
            } else if (i !== 6) {
                bCell = '<td></td>';
            }

            itemRows.push(`
        <tr>
          ${bCell}
          <td>${i}</td>
          <td>${itemName}</td>
          <td class="center">${ratingDisplay}</td>
          <td>${commentDisplay}</td>
        </tr>
      `);
        }
        const itemRowsHTML = itemRows.join('');

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
              <div class="dotted-short">${evaluation.circ || ''}</div>
            </td>
            <td class="header-right">
              <div class="form-code">/QMR/T6SC</div>
              <div class="logo"><img src="/erpAsset 2alogo.png" alt="MEINHARDT" style="height: 20px; max-width: 150px;" /></div>
              <div class="form-number">10 - FORM MTSC-02</div>
            </td>
          </tr>
        </table>

        <!-- Title -->
        <div class="title">SUB-CONSULTANT EVALUATION FORM</div>

        <!-- Main Content Box -->
        <div class="content-box">
          <!-- Information Fields -->
          <div class="row">
            <span class="label">Sub-Consultant Name:</span>
            <span class="dotted-line">${evaluation.sub_consultant_name || ''}</span>
          </div>

          <div class="row" style="display: flex; align-items: baseline;">
            <span class="label">Project Name:</span>
            <span class="dotted-line">${evaluation.project_name || ''}</span>
            <span class="label" style="margin-left: 30px;">Project No.:</span>
            <span class="dotted-line">${evaluation.project_no || ''}</span>
          </div>

          <div class="row">
            <span class="label">Department / Sub-Contract Value / Duration:</span>
            <span class="dotted-line">${evaluation.department_value_duration || ''}</span>
          </div>

          <div class="row">
            <span class="label">Scope of Services Provided:</span>
            <span class="dotted-line">${evaluation.scope_of_services || ''}</span>
          </div>

          <!-- Section B: Compliance -->
          <div class="section-b">
            <div class="section-b-header">
              <span class="section-b-letter">B</span>
              <div class="section-b-content">
                <div class="compliance-question">
                  Are there any reasonable grounds to believe that the Sub-Consultant has violated or failed to comply with Meinhardt's Anti-Corruption programme and/or applicable laws?
                </div>
                <div class="compliance-options">
                  <span class="compliance-option">
                    <span class="checkbox">${evaluation.anti_corruption_is_violation === 1 ? '☑' : '☐'}</span> Yes – remove from approved list
                  </span>
                  <span class="compliance-option">
                    <span class="checkbox">${evaluation.anti_corruption_is_violation === 0 ? '☑' : '☐'}</span> No – proceed below
                  </span>
                </div>

                <div class="sub-section-title">For Architectural and Interior Design Sub-Consultants only :</div>
                <div class="compliance-question">
                  Have they submitted written confirmation that their CAD Software is legal and has current annual maintenance licenses.
                </div>
                <div class="compliance-options">
                  <span class="compliance-option">
                    <span class="checkbox">${evaluation.cad_software_confirmed === 1 ? '☑' : '☐'}</span> Yes – proceed below
                  </span>
                  <span class="compliance-option">
                    <span class="checkbox">${evaluation.cad_software_confirmed === 0 ? '☑' : '☐'}</span> No – remove from approved list
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Assessment Table -->
          <div class="section-title underline">Assessment</div>
          <table class="score-table">
            <thead>
              <tr>
                <th style="width: 4%;"></th>
                <th colspan="2" style="width: 46%;">Item</th>
                <th style="width: 15%;">Rating</th>
                <th style="width: 35%;">Comment</th>
              </tr>
            </thead>
            <tbody>
              ${itemRowsHTML}
              <tr class="average-row">
                <td></td>
                <td></td>
                <td><strong>Average</strong></td>
                <td class="center"><strong>${averageRating}</strong></td>
                <td></td>
              </tr>
            </tbody>
          </table>

          <!-- Rating Scale -->
          <div class="rating-scale">
            <span class="label">Rating:</span>
            <span>Poor (0 - 4)</span>
            <span>Satisfactory (5 - 7)</span>
            <span>Good (8 - 10)</span>
          </div>

          <!-- Recommendation -->
          <div class="recommendation">
            <div class="recommendation-item">
              <span class="checkbox">${evaluation.is_maintained === 1 ? '☑' : '☐'}</span>
              <span>Sub-Consultant to be maintained in approved lists (Average Rating ≥ 5)</span>
            </div>
            <div class="recommendation-item">
              <span class="checkbox">${evaluation.is_removed === 1 ? '☑' : '☐'}</span>
              <span>Sub-Consultant to be removed from approved lists (Average Rating < 5)</span>
            </div>
          </div>

          <!-- Signatures -->
          <div class="signature-row">
            <span class="label">Evaluated by:</span>
            <span class="dotted-sig">${evaluation.evaluated_by || ''}</span>
            <span class="role">(DI/ TL)</span>
            <span class="label">Date:</span>
            <span class="dotted-date">${formatDate(evaluation.evaluated_date)}</span>
          </div>

          <div class="signature-row">
            <span class="label">Approved by:</span>
            <span class="dotted-sig">${evaluation.approved_by || ''}</span>
            <span class="role">(MD/ DI/ TL)</span>
            <span class="label">Date:</span>
            <span class="dotted-date">${formatDate(evaluation.approved_date)}</span>
          </div>

          <div class="signature-row">
            <span class="label">Acknowledged by:</span>
            <span class="dotted-sig">${evaluation.acknowledged_by || ''}</span>
            <span class="role">(IMR)</span>
            <span class="label">Date:</span>
            <span class="dotted-date">${formatDate(evaluation.acknowledged_date)}</span>
          </div>
        </div>

        <!-- Footer -->
        <div class="footer">
          <div class="footer-ref">Z:MR/MYDOCUMENTS/IMS DOCUMENT/IMS DOCUMENTATION/FORMS/5BE0BD75816DD999767C80BAD4A36614DA044C008A12432F9A8D7423AC5A13E4.DOC/REV.B (01/01/2018)/CC/NK/MR</div>
          <div class="page-num">Page 1 of 1</div>
        </div>
      </div>
    `;
    }

    private getPrintStyles(): string {
        return `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.4; color: #000; background: #fff; }

      .page { width: 210mm; height: 297mm; padding: 5mm; margin: 0 auto; display: flex; flex-direction: column; }

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
      .content-box { border: 1px solid #000; padding: 10px 12px; page-break-inside: avoid; break-inside: avoid; flex: 1; }

      /* Rows - Body 10-11 pt (Regular) */
      .row { margin: 5px 0; font-size: 10pt; line-height: 1.4; }
      .label { font-weight: bold; margin-right: 5px; }
      .dotted-line { border-bottom: 1px dotted #000; border-style: dotted; border-width: 0 0 1px 0; display: inline-block; min-width: 200px; margin-left: 5px; flex: 1; }
      .ml { margin-left: 30px; }

      /* Section B: Compliance */
      .section-b { margin: 10px 0; position: relative; }
      .section-b-header {
        display: flex;
        align-items: flex-start;
        position: relative;
      }
      .section-b-letter {
        font-size: 24pt;
        font-weight: 900;
        margin-right: 0;
        line-height: 1;
        position: relative;
        padding-right: 10px;
        border-right: 3px solid #000;
        display: flex;
        align-items: flex-start;
        padding-top: 0;
        flex-shrink: 0;
        height: auto;
      }
      .section-b-content {
        flex: 1;
        padding-left: 8px;
        margin-left: 0;
        display: flex;
        flex-direction: column;
      }
      .compliance-question { font-size: 10pt; margin: 5px 0; line-height: 1.4; }
      .compliance-options { margin: 5px 0 10px 0; }
      .compliance-option { display: inline-block; margin-right: 20px; font-size: 10pt; white-space: nowrap; }
      .checkbox { font-size: 12pt; margin-right: 5px; }
      .sub-section-title { font-weight: bold; font-size: 10pt; margin: 10px 0 5px 0; }

      /* Section Title - 11-12 pt (Bold) */
      .section-title { font-weight: bold; font-size: 12pt; margin: 8px 0 5px 0; }
      .section-title.underline { text-decoration: underline; }

      /* Score Table - 10-11 pt (Regular) */
      .score-table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 10pt; }
      .score-table th, .score-table td { border: 1px solid #000; padding: 5px 6px; text-align: left; }
      .score-table th { background: #f5f5f5; font-weight: bold; text-align: center; }
      .score-table .col-item { width: 50%; text-align: left; }
      .score-table .col-rating { width: 15%; text-align: center; }
      .score-table .col-comment { width: 35%; text-align: left; }
      .score-table td.center { text-align: center; }
      .score-table td:first-child {
        width: 4%;
        text-align: center;
        padding: 5px 3px;
        vertical-align: middle;
        border-right: none;
      }
      .score-table td:nth-child(2) { width: 4%; text-align: center; padding-right: 8px; }
      .score-table td:nth-child(3) { width: 42%; }
      .score-table td:nth-child(4) { width: 15%; text-align: center; }
      .score-table td:nth-child(5) { width: 35%; }
      .table-b-letter {
        font-size: 18pt;
        font-weight: 900;
        text-align: center;
        vertical-align: middle;
        padding: 5px 3px;
        border-right: 2px solid #000 !important;
        position: relative;
      }
      .table-b-line {
        border-right: 2px solid #000 !important;
        padding: 5px 3px;
      }
      .average-row { font-weight: bold; }
      .average-row td:first-child { text-align: center; }

      /* Rating Scale */
      .rating-scale { margin: 8px 0; font-size: 10pt; }
      .rating-scale .label { margin-right: 5px; }
      .rating-scale span { margin-right: 15px; }

      /* Recommendation */
      .recommendation { margin: 8px 0; }
      .recommendation-item { margin: 4px 0; font-size: 10pt; line-height: 1.4; }

      /* Signatures */
      .signature-row { margin: 10px 0; font-size: 10pt; display: flex; align-items: baseline; gap: 5px; }
      .dotted-sig { border-bottom: 1px dotted #000; border-style: dotted; border-width: 0 0 1px 0; display: inline-block; min-width: 150px; }
      .dotted-date { border-bottom: 1px dotted #000; border-style: dotted; border-width: 0 0 1px 0; display: inline-block; min-width: 100px; }
      .role { font-size: 10pt; margin: 0 10px; }

      /* Footer */
      .footer { margin-top: auto; padding-top: 6px; border-top: 1px solid #ccc; font-size: 7pt; color: #666; display: flex; justify-content: space-between; }
      .footer-ref { flex: 1; }
      .page-num { text-align: right; }

      @media print {
        @page { size: A4 portrait; margin: 0; }
        body { margin: 0; padding: 0; }
        .page { width: 100%; height: 297mm; padding: 5mm; box-sizing: border-box; page-break-inside: avoid; break-inside: avoid; }
        .content-box { page-break-inside: avoid; break-inside: avoid; }
      }
    `;
    }
    onListSortChange(event: ListSortEvent): void {
        this.listSort = event;
        this.pageIndex = 0;
        this.loadEvaluations();
    }
}
