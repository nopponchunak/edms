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
import { ApiService } from 'app/core/services/api.service';
import { EmployeeService } from 'app/core/services/employee.service';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';
import {
    filterSingleSourceJustificationActionRequests,
    getCurrentUserCode,
    isMyRequestByUserCode,
    isPending,
    isSingleSourceJustificationPending,
} from 'app/core/utils/action-request-filter.util';
import { formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

interface ActionRequestItem {
    id: number;
    request: SingleSourceJustificationListItem;
    actionType:
        | 'verify_by_status'
        | 'approved_by_status'
        | 'acknowledged_by_status';
    currentStatus: string | null;
}

export interface SingleSourceJustificationListItem {
    id: number;
    No: number;
    sub_consultant_supplier_name: string;
    items_supplied: string;
    justification_type: 'single_source' | 'price_justification';
    create_by: string | null;
    update_by: string | null;
    created_at: string;
    updated_at: string;
    assessed_by?: string | null;
    assessed_by_date?: string | null;
    assessed_by_status?: string | null;
    corresponding_po_no?: string | null;
    verify_by?: string | null;
    verify_by_date?: string | null;
    verify_by_status?: string | null;
    verify_by_comment?: string | null;
    approved_by?: string | null;
    approved_by_date?: string | null;
    approved_by_status?: string | null;
    approved_by_comments?: string | null;
    acknowledged_by?: string | null;
    acknowledged_by_date?: string | null;
    acknowledged_by_status?: string | null;
    acknowledged_by_comments?: string | null;
}

type SingleSourceJustificationListTab = 'all' | 'my' | 'pending' | 'action';

@Component({
    selector: 'app-single-source-justification-list',
    standalone: true,
    imports: [
        ListTableSortModule,
        CommonModule,
        MatIconModule,
        MatMenuModule,
        MatPaginatorModule,
        MatProgressSpinnerModule,
        MatTableModule,
        RouterLink,
        FuseAlertComponent,
        PurchaseFormsFilterComponent,
    ],
    templateUrl: './single-source-justification-list.component.html',
    styleUrls: ['./single-source-justification-list.component.scss'],
})
export class SingleSourceJustificationListComponent
    implements OnInit, OnDestroy
{
    listSort: ListSortEvent = { column: 0, dir: 'desc' };
    private _unsubscribeAll: Subject<void> = new Subject<void>();
    readonly navigationPermissionService = inject(NavigationPermissionService);
    readonly permissionNavId = 'single-source-justification';

    displayedColumns: string[] = [
        'supplierName',
        'itemsSupplied',
        'type',
        'assessedBy',
        'createdAt',
        'updatedAt',
        'status',
        'actions',
    ];

    actionDisplayedColumns: string[] = [
        'supplierName',
        'itemsSupplied',
        'type',
        'assessedBy',
        'actionStep',
        'status',
        'action',
    ];

    private allData: SingleSourceJustificationListItem[] = [];
    private allActionRequests: ActionRequestItem[] = [];
    filteredDataSource: SingleSourceJustificationListItem[] = [];
    actionRequests: ActionRequestItem[] = [];

    isLoading = false;
    alert: { type: FuseAlertType; message: string } | null = null;

    searchTerm = '';
    statusFilter = '';
    justificationTypeFilter = '';

    currentTab: SingleSourceJustificationListTab = 'all';
    viewMode: 'card' | 'table' = 'table';
    showFilterPanel = false;

    pageIndex = 0;
    pageSize = 10;
    totalRecords = 0;
    employeeLookup = new Map<string, string>();

    filterConfig: PurchaseFormsFilterConfig = {
        searchLabel: 'Search Single Source / Price Justification',
        searchPlaceholder: 'Search by supplier, items, or requester...',
        statusFilterLabel: 'Filter by Status',
        statusOptions: [
            { value: 'pending', label: 'Pending' },
            { value: 'reject', label: 'Rejected' },
            { value: 'approve', label: 'Approved' },
        ],
        statusLabelFn: (value: string) => this.getStatusLabel(value),
        thirdFilterLabel: 'Filter by Justification Type',
        thirdFilterOptions: [
            { value: 'single_source', label: 'Single Source' },
            { value: 'price_justification', label: 'Price Justification' },
        ],
        showThirdFilter: true,
    };

    constructor(
        private router: Router,
        private apiService: ApiService,
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

        this.loadData();
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next();
        this._unsubscribeAll.complete();
    }

    loadData(): void {
        this.isLoading = true;
        this.alert = null;

        const requestBody = {
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

        this.apiService
            .getSingleSourceJustificationPage(requestBody)
            .pipe(
                takeUntil(this._unsubscribeAll),
                catchError((error) => {
                    console.error('Error loading justifications:', error);
                    this.showAlert(
                        'error',
                        error?.error?.message ||
                            'Failed to load justifications. Please try again.'
                    );
                    return of(null);
                }),
                finalize(() => (this.isLoading = false))
            )
            .subscribe((response) => {
                if (!response) {
                    this.setData([]);
                    return;
                }

                if (response.status && response.data) {
                    const items = response.data.data || [];

                    this.totalRecords =
                        response.data.total ||
                        response.data.recordsTotal ||
                        items.length;
                    this.setData(items);
                    return;
                }

                this.showAlert(
                    'error',
                    response.message || 'Failed to load justifications.'
                );
                this.setData([]);
            });
    }

    private setData(items: SingleSourceJustificationListItem[]): void {
        this.allData = items;
        this.resolveEmployees(this.allData);
        this.buildActionRequests();
        this.onFilterChange(false);
    }

    private resolveEmployees(items: SingleSourceJustificationListItem[]): void {
        const employeeCodes = new Set<string>();

        items.forEach((item) => {
            if (item.create_by) employeeCodes.add(item.create_by);
            if (item.update_by) employeeCodes.add(item.update_by);
            if (item.assessed_by) employeeCodes.add(item.assessed_by);
            if (item.verify_by) employeeCodes.add(item.verify_by);
            if (item.approved_by) employeeCodes.add(item.approved_by);
            if (item.acknowledged_by) employeeCodes.add(item.acknowledged_by);
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

    onTabChange(tab: SingleSourceJustificationListTab): void {
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
        const isMine = (item: SingleSourceJustificationListItem): boolean =>
            isMyRequestByUserCode(item, userCode);

        const hasMyPendingStep = (
            item: SingleSourceJustificationListItem
        ): boolean => {
            if (!userCode) return false;
            return (
                (item.verify_by === userCode &&
                    isPending(item.verify_by_status)) ||
                (item.approved_by === userCode &&
                    isPending(item.approved_by_status)) ||
                (item.acknowledged_by === userCode &&
                    isPending(item.acknowledged_by_status))
            );
        };

        this.filteredDataSource = this.allData.filter((item) => {
            let matchesTab = true;

            if (this.currentTab === 'my') {
                matchesTab = isMine(item);
            } else if (this.currentTab === 'pending') {
                matchesTab =
                    (isMine(item) &&
                        isSingleSourceJustificationPending(item)) ||
                    hasMyPendingStep(item);
            }

            const matchesSearch = this.matchesSearchTerm(item, term);
            const matchesStatus =
                !this.statusFilter ||
                this.getWorkflowStatus(item) === this.statusFilter;
            const matchesType =
                !this.justificationTypeFilter ||
                item.justification_type === this.justificationTypeFilter;

            return matchesTab && matchesSearch && matchesStatus && matchesType;
        });

        if (resetPage) {
            this.pageIndex = 0;
        }
    }

    private buildActionRequests(): void {
        const userCode = getCurrentUserCode();
        this.allActionRequests = filterSingleSourceJustificationActionRequests(
            this.allData,
            userCode
        );
        this.applyActionFilters();
    }

    private applyActionFilters(): void {
        const term = (this.searchTerm || '').toLowerCase().trim();

        this.actionRequests = this.allActionRequests.filter((item) => {
            const request = item.request;
            const matchesSearch = this.matchesSearchTerm(request, term);
            const matchesStatus =
                !this.statusFilter ||
                this.getWorkflowStatus(request) === this.statusFilter;
            const matchesType =
                !this.justificationTypeFilter ||
                request.justification_type === this.justificationTypeFilter;

            return matchesSearch && matchesStatus && matchesType;
        });
    }

    private matchesSearchTerm(
        item: SingleSourceJustificationListItem,
        term: string
    ): boolean {
        if (!term) return true;

        return (
            (item.sub_consultant_supplier_name || '')
                .toLowerCase()
                .includes(term) ||
            (item.items_supplied || '').toLowerCase().includes(term) ||
            (item.create_by || '').toLowerCase().includes(term) ||
            (item.update_by || '').toLowerCase().includes(term) ||
            this.getEmployeeLabel(item.create_by)
                .toLowerCase()
                .includes(term) ||
            this.getEmployeeLabel(item.update_by)
                .toLowerCase()
                .includes(term) ||
            this.getEmployeeLabel(item.assessed_by)
                .toLowerCase()
                .includes(term) ||
            this.getEmployeeLabel(item.verify_by)
                .toLowerCase()
                .includes(term) ||
            this.getEmployeeLabel(item.approved_by)
                .toLowerCase()
                .includes(term) ||
            this.getEmployeeLabel(item.acknowledged_by)
                .toLowerCase()
                .includes(term)
        );
    }

    clearFilters(): void {
        this.searchTerm = '';
        this.statusFilter = '';
        this.justificationTypeFilter = '';
        this.pageIndex = 0;
        this.closeFilterPanel();
        this.onFilterChange();
    }

    applyFilters(filters: PurchaseFormsFilterValues): void {
        this.searchTerm = filters.searchTerm || '';
        this.statusFilter = filters.statusFilter || '';
        this.justificationTypeFilter = filters.thirdFilter || '';
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

    get visibleRows(): SingleSourceJustificationListItem[] {
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

    get activeFilterCount(): number {
        return [
            this.searchTerm,
            this.statusFilter,
            this.justificationTypeFilter,
        ].filter((value) => !!value).length;
    }

    getListTitle(): string {
        switch (this.currentTab) {
            case 'all':
                return 'All Justifications';
            case 'my':
                return 'My Justifications';
            case 'pending':
                return 'Pending Justifications';
            case 'action':
                return 'Action Requests';
            default:
                return 'Justifications';
        }
    }

    getEmptyTitle(): string {
        return this.currentTab === 'action'
            ? 'No action requests found'
            : 'No justifications found';
    }

    getEmptyDescription(): string {
        switch (this.currentTab) {
            case 'action':
                return 'No action requests found. All justifications have been processed.';
            case 'pending':
                return 'No justifications are pending your action at the moment.';
            case 'my':
                return "You haven't created any justifications yet.";
            case 'all':
            default:
                return 'No single source or price justifications have been created yet.';
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
            case 'verify_by_status':
                return 'Verified By';
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
        const normalized = status.toLowerCase();
        if (normalized === 'pending') return 'Pending';
        if (normalized === 'reject' || normalized === 'rejected') {
            return 'Rejected';
        }
        if (normalized === 'approve' || normalized === 'approved') {
            return 'Approved';
        }
        return status;
    }

    getByStatusColor(status: string | null | undefined): string {
        if (!status) return 'bg-yellow-100 text-yellow-800';
        const normalized = status.toLowerCase();
        if (normalized === 'pending') {
            return 'bg-yellow-100 text-yellow-800';
        }
        if (normalized === 'approve' || normalized === 'approved') {
            return 'bg-green-100 text-green-800';
        }
        if (normalized === 'reject' || normalized === 'rejected') {
            return 'bg-red-100 text-red-800';
        }
        return 'bg-gray-100 text-gray-800';
    }

    onCreateNew(): void {
        this.router.navigate(['/single-source-justification/create']);
    }

    onView(id: number): void {
        this.router.navigate([
            '/single-source-justification/view',
            id.toString(),
        ]);
    }

    onEdit(id: number): void {
        this.router.navigate([
            '/single-source-justification/edit',
            id.toString(),
        ]);
    }

    onReview(id: number, actionType?: string): void {
        if (actionType) {
            this.router.navigate([
                '/single-source-justification/action',
                id.toString(),
                actionType,
            ]);
            return;
        }

        this.router.navigate([
            '/single-source-justification/review',
            id.toString(),
        ]);
    }

    onDelete(id: number): void {
        const confirmation = this.fuseConfirmationService.open({
            title: 'Delete',
            message: 'Are you sure you want to delete this justification?',
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

        confirmation
            .afterClosed()
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((result) => {
                if (result !== 'confirmed') return;

                this.apiService
                    .deleteSingleSourceJustification(id)
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe({
                        next: (response) => {
                            if (response.status) {
                                this.showAlert(
                                    'success',
                                    response.message ||
                                        'Justification deleted successfully!'
                                );
                                this.loadData();
                                return;
                            }

                            this.showAlert(
                                'error',
                                response.message ||
                                    'Failed to delete justification.'
                            );
                        },
                        error: (error) => {
                            console.error(
                                'Error deleting justification:',
                                error
                            );
                            this.showAlert(
                                'error',
                                error?.error?.message ||
                                    'Failed to delete justification. Please try again.'
                            );
                        },
                    });
            });
    }

    getJustificationTypeLabel(type: string | null | undefined): string {
        switch (type) {
            case 'single_source':
            case 'single-source':
                return 'Single Source';
            case 'price_justification':
            case 'price-justification':
                return 'Price Justification';
            default:
                return type || '-';
        }
    }

    getSupplierName(item: SingleSourceJustificationListItem): string {
        return item.sub_consultant_supplier_name || '-';
    }

    getItemsSupplied(item: SingleSourceJustificationListItem): string {
        return item.items_supplied || '-';
    }

    getWorkflowStatus(
        item: SingleSourceJustificationListItem
    ): 'pending' | 'reject' | 'approve' {
        const statuses = [
            item.verify_by_status,
            item.approved_by_status,
            item.acknowledged_by_status,
        ];
        const hasReject = statuses.some((status) => {
            const normalized = status?.toLowerCase();
            return normalized === 'reject' || normalized === 'rejected';
        });

        if (hasReject) return 'reject';

        const allApproved = statuses.every((status) => {
            const normalized = status?.toLowerCase();
            return normalized === 'approve' || normalized === 'approved';
        });

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

    canEdit(item: SingleSourceJustificationListItem): boolean {
        return this.getWorkflowStatus(item) === 'pending';
    }

    canDelete(item: SingleSourceJustificationListItem): boolean {
        return this.getWorkflowStatus(item) === 'pending';
    }

    canShowMoreActions(item: SingleSourceJustificationListItem): boolean {
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

    private showAlert(type: FuseAlertType, message: string): void {
        this.alert = { type, message };
        setTimeout(() => {
            this.alert = null;
        }, 5000);
    }
    onListSortChange(event: ListSortEvent): void {
        this.listSort = event;
        this.pageIndex = 0;
        this.loadData();
    }
}
