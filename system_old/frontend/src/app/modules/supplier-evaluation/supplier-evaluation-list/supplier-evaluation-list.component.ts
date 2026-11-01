import { CommonModule } from '@angular/common';
import {
    Component,
    HostListener,
    inject,
    OnDestroy,
    OnInit,
} from '@angular/core';
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
import { EmployeeService } from 'app/core/services/employee.service';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';
import {
    SupplierEvaluationListItem,
    SupplierEvaluationService,
    SupplierEvaluationsPageRequest,
} from 'app/core/services/supplier-evaluation.service';
import {
    filterSupplierEvaluationActionRequests,
    getCurrentUserCode,
    isMyRequestByUserCode,
    isPending,
    isSupplierEvaluationPending,
} from 'app/core/utils/action-request-filter.util';
import { formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

interface ActionRequestItem {
    id: string;
    request: SupplierEvaluationListItem;
    actionType: 'acknowledged_by_status' | 'approved_by_status';
    currentStatus: string | null;
}

type SupplierEvaluationListTab = 'all' | 'my' | 'pending' | 'action';

@Component({
    selector: 'app-supplier-evaluation-list',
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
    templateUrl: './supplier-evaluation-list.component.html',
    styleUrls: ['./supplier-evaluation-list.component.scss'],
})
export class SupplierEvaluationListComponent implements OnInit, OnDestroy {
    listSort: ListSortEvent = { column: 0, dir: 'desc' };
    private _unsubscribeAll: Subject<any> = new Subject<any>();
    readonly navigationPermissionService = inject(NavigationPermissionService);
    readonly permissionNavId = 'supplier-evaluation';

    displayedColumns: string[] = [
        'supplierName',
        'project',
        'averageRating',
        'evaluatedBy',
        'createdAt',
        'updatedAt',
        'status',
        'actions',
    ];

    actionDisplayedColumns: string[] = [
        'supplierName',
        'project',
        'averageRating',
        'evaluatedBy',
        'actionStep',
        'status',
        'action',
    ];

    private allData: SupplierEvaluationListItem[] = [];
    private allActionRequests: ActionRequestItem[] = [];
    filteredDataSource: SupplierEvaluationListItem[] = [];
    actionRequests: ActionRequestItem[] = [];

    isLoading = false;
    alert: { type: FuseAlertType; message: string } | null = null;

    searchTerm = '';
    statusFilter = '';
    projectTypeFilter = '';

    currentTab: SupplierEvaluationListTab = 'all';
    viewMode: 'card' | 'table' = 'table';
    showFilterPanel = false;

    pageIndex = 0;
    pageSize = 10;
    totalRecords = 0;
    employeeLookup = new Map<string, string>();

    filterConfig: PurchaseFormsFilterConfig = {
        searchLabel: 'Search Supplier Evaluation',
        searchPlaceholder: 'Search by supplier, project, or evaluator...',
        statusFilterLabel: 'Filter by Status',
        statusOptions: [
            { value: 'pending', label: 'Pending' },
            { value: 'reject', label: 'Rejected' },
            { value: 'approve', label: 'Approved' },
        ],
        statusLabelFn: (value: string) => this.getStatusLabel(value),
        thirdFilterLabel: 'Filter by Project Type',
        thirdFilterOptions: [],
        showThirdFilter: true,
    };

    constructor(
        private router: Router,
        private supplierEvaluationService: SupplierEvaluationService,
        private fuseConfirmationService: FuseConfirmationService,
        private employeeService: EmployeeService
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
        this.loadEvaluations();
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    loadEvaluations(): void {
        this.isLoading = true;
        this.alert = null;

        const requestBody: SupplierEvaluationsPageRequest = {
            draw: 1,
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
            length: 1000,
            search: { value: '', regex: false },
        };

        this.supplierEvaluationService
            .findAllPaginated(requestBody)
            .pipe(
                takeUntil(this._unsubscribeAll),
                catchError((err) => {
                    this.showAlert(
                        'error',
                        err?.error?.message ||
                            'Failed to load evaluations. Please try again.'
                    );
                    return of([] as SupplierEvaluationListItem[]);
                }),
                finalize(() => (this.isLoading = false))
            )
            .subscribe((evaluations: SupplierEvaluationListItem[]) => {
                this.allData = evaluations || [];

                this.resolveEmployeeNames(this.allData);
                this.updateFilterConfig();
                this.buildActionRequests();
                this.onFilterChange(false);
            });
    }

    private resolveEmployeeNames(items: SupplierEvaluationListItem[]): void {
        const employeeCodes = new Set<string>();
        items.forEach((item) => {
            if (item.createBy) employeeCodes.add(item.createBy);
            if (item.updateBy) employeeCodes.add(item.updateBy);
            if (item.evaluatedBy) employeeCodes.add(item.evaluatedBy);
            if (item.approvedBy) employeeCodes.add(item.approvedBy);
            if (item.acknowledgedBy) employeeCodes.add(item.acknowledgedBy);
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
    }

    onPageChange(event: PageEvent): void {
        this.pageIndex = event.pageIndex;
        this.pageSize = event.pageSize;
    }

    onTabChange(tab: SupplierEvaluationListTab): void {
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

    updateFilterConfig(): void {
        this.filterConfig.thirdFilterOptions = this.projectTypes.map(
            (type) => ({
                value: type,
                label: type,
            })
        );
    }

    onFilterChange(resetPage = true): void {
        if (this.currentTab === 'action') {
            this.applyActionFilters();
            this.filteredDataSource = this.actionRequests.map(
                (item) => item.request
            );
            this.totalRecords = this.actionRequests.length;
            return;
        }

        this.applyClientSideFilters(resetPage);
        this.totalRecords = this.filteredDataSource.length;
    }

    private applyClientSideFilters(resetPage = true): void {
        const term = (this.searchTerm || '').toLowerCase().trim();
        const userCode = getCurrentUserCode();
        const isMine = (item: SupplierEvaluationListItem): boolean =>
            isMyRequestByUserCode(item, userCode);

        const hasMyPendingStep = (
            item: SupplierEvaluationListItem
        ): boolean => {
            if (!userCode) return false;
            return (
                (item.approvedBy === userCode &&
                    isPending(item.approvedByStatus)) ||
                (item.acknowledgedBy === userCode &&
                    isPending(item.acknowledgedByStatus))
            );
        };

        this.filteredDataSource = this.allData.filter((item) => {
            let matchesTab = true;
            if (this.currentTab === 'my') {
                matchesTab = isMine(item);
            } else if (this.currentTab === 'pending') {
                matchesTab =
                    (isMine(item) && isSupplierEvaluationPending(item)) ||
                    hasMyPendingStep(item);
            }

            const matchesSearch =
                !term ||
                (item.supplierName || '').toLowerCase().includes(term) ||
                (item.projectName || '').toLowerCase().includes(term) ||
                (item.projectNo || '').toLowerCase().includes(term) ||
                this.getEmployeeLabel(this.getEvaluatedBy(item))
                    .toLowerCase()
                    .includes(term) ||
                this.getEmployeeLabel(item.createBy)
                    .toLowerCase()
                    .includes(term);

            const status = this.getWorkflowStatus(item);
            const matchesStatus =
                !this.statusFilter || status === this.statusFilter;
            const itemProjectType = this.extractProjectType(
                item.projectName || ''
            );
            const matchesProjectType =
                !this.projectTypeFilter ||
                itemProjectType === this.projectTypeFilter;

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

    private buildActionRequests(): void {
        const userCode = getCurrentUserCode();
        this.allActionRequests = filterSupplierEvaluationActionRequests(
            this.allData,
            userCode
        );
        this.applyActionFilters();
    }

    private applyActionFilters(): void {
        const term = (this.searchTerm || '').toLowerCase().trim();
        this.actionRequests = this.allActionRequests.filter((item) => {
            const request = item.request;
            const matchesSearch =
                !term ||
                (request.supplierName || '').toLowerCase().includes(term) ||
                (request.projectName || '').toLowerCase().includes(term) ||
                (request.projectNo || '').toLowerCase().includes(term) ||
                this.getEmployeeLabel(this.getEvaluatedBy(request))
                    .toLowerCase()
                    .includes(term);

            const status = this.getWorkflowStatus(request);
            const matchesStatus =
                !this.statusFilter || status === this.statusFilter;
            const itemProjectType = this.extractProjectType(
                request.projectName || ''
            );
            const matchesProjectType =
                !this.projectTypeFilter ||
                itemProjectType === this.projectTypeFilter;

            return matchesSearch && matchesStatus && matchesProjectType;
        });
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

    get visibleRows(): SupplierEvaluationListItem[] {
        const start = this.pageIndex * this.pageSize;
        return this.filteredDataSource.slice(start, start + this.pageSize);
    }

    get filteredCount(): number {
        return this.currentTab === 'action'
            ? this.actionRequests.length
            : this.filteredDataSource.length;
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

    get activeFilterCount(): number {
        return [
            this.searchTerm,
            this.statusFilter,
            this.projectTypeFilter,
        ].filter((value) => !!value).length;
    }

    getListTitle(): string {
        switch (this.currentTab) {
            case 'all':
                return 'All Supplier Evaluations';
            case 'my':
                return 'My Supplier Evaluations';
            case 'pending':
                return 'Pending Supplier Evaluations';
            case 'action':
                return 'Action Requests';
            default:
                return 'Supplier Evaluations';
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
                return 'No supplier evaluations have been created yet.';
        }
    }

    canShowCreateEmptyButton(): boolean {
        return (
            (this.currentTab === 'all' || this.currentTab === 'my') &&
            this.activeFilterCount === 0
        );
    }

    getActionTypeText(actionType: string): string {
        switch (actionType) {
            case 'acknowledged_by_status':
                return 'Acknowledged By';
            case 'approved_by_status':
                return 'Approved By';
            default:
                return 'Action';
        }
    }

    getByStatusText(status: string | null | undefined): string {
        if (!status) return 'Pending';
        const s = status.toLowerCase();
        if (s === 'pending') return 'Pending';
        if (s === 'reject' || s === 'rejected') return 'Rejected';
        if (s === 'approve' || s === 'approved') return 'Approved';
        return status;
    }

    getByStatusColor(status: string | null | undefined): string {
        if (!status) return 'bg-yellow-100 text-yellow-800';
        const s = status.toLowerCase();
        if (s === 'pending') return 'bg-yellow-100 text-yellow-800';
        if (s === 'approve' || s === 'approved') {
            return 'bg-green-100 text-green-800';
        }
        if (s === 'reject' || s === 'rejected') {
            return 'bg-red-100 text-red-800';
        }
        return 'bg-gray-100 text-gray-800';
    }

    onCreateNew(): void {
        this.router.navigate(['/supplier-evaluation/new']);
    }

    onView(id: string): void {
        this.router.navigate(['/supplier-evaluation/view', id]);
    }

    onEdit(id: string): void {
        this.router.navigate(['/supplier-evaluation/edit', id]);
    }

    onReview(id: string): void {
        this.router.navigate(['/supplier-evaluation/review', id]);
    }

    onDelete(id: string): void {
        const confirmation = this.fuseConfirmationService.open({
            title: 'Delete',
            message: 'Are you sure you want to delete this evaluation?',
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
            if (result === 'confirmed') {
                this.supplierEvaluationService.remove(id).subscribe({
                    next: () => {
                        this.showAlert(
                            'success',
                            'Evaluation deleted successfully!'
                        );
                        this.loadEvaluations();
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

    showAlert(type: FuseAlertType, message: string): void {
        this.alert = { type, message };
        setTimeout(() => (this.alert = null), 5000);
    }

    private extractProjectType(projectName: string): string {
        const normalized = (projectName || '').toLowerCase();
        if (normalized.includes('hospital')) return 'Hospital';
        if (normalized.includes('commercial')) return 'Commercial';
        if (normalized.includes('residential')) return 'Residential';
        return 'Other';
    }

    get projectTypes(): string[] {
        const types = this.allData.map((item) =>
            this.extractProjectType(item.projectName)
        );
        return [...new Set(types)].sort();
    }

    getWorkflowStatus(
        item: SupplierEvaluationListItem
    ): 'pending' | 'reject' | 'approve' {
        const statuses = [item.approvedByStatus, item.acknowledgedByStatus];
        const hasReject = statuses.some(
            (status) =>
                status?.toLowerCase() === 'reject' ||
                status?.toLowerCase() === 'rejected'
        );
        if (hasReject) return 'reject';

        const allApproved = statuses.every(
            (status) =>
                status?.toLowerCase() === 'approve' ||
                status?.toLowerCase() === 'approved'
        );
        if (allApproved) return 'approve';

        return 'pending';
    }

    getWorkflowStatusBadgeClass(
        status: 'pending' | 'reject' | 'approve'
    ): string {
        switch (status) {
            case 'approve':
                return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'reject':
                return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
            default:
                return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
        }
    }

    getStatusLabel(status: string): string {
        switch (status) {
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

    getEvaluatedDate(item: SupplierEvaluationListItem): string {
        return item.evaluatedByDate || item.evaluatedByDate || item.createdAt;
    }

    getEvaluatedBy(item: SupplierEvaluationListItem): string | null {
        return item.evaluatedBy || null;
    }

    getEmployeeLabel(ref: string | number | null | undefined): string {
        return this.employeeService.formatEmployeeReference(
            ref,
            this.employeeLookup,
            'N/A'
        );
    }

    formatDate(dateString: string | Date | null | undefined): string {
        return formatDateTimeDisplay(dateString);
    }

    getRatingText(item: SupplierEvaluationListItem): string {
        return `${Number(item.averageRating ?? 0).toFixed(1)}/5.0`;
    }

    canEdit(item: SupplierEvaluationListItem): boolean {
        return this.getWorkflowStatus(item) === 'pending';
    }

    canDelete(item: SupplierEvaluationListItem): boolean {
        return this.getWorkflowStatus(item) === 'pending';
    }

    canShowMoreActions(item: SupplierEvaluationListItem): boolean {
        return (
            (this.canEdit(item) &&
                this.navigationPermissionService.hasEditPermissionByNavId(
                    this.permissionNavId
                )) ||
            (this.canDelete(item) &&
                this.navigationPermissionService.hasDeletePermissionByNavId(
                    this.permissionNavId
                ))
        );
    }
    onListSortChange(event: ListSortEvent): void {
        this.listSort = event;
        this.pageIndex = 0;
        this.loadEvaluations();
    }
}
