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
import { ActivatedRoute, RouterLink } from '@angular/router';
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
    isApproved,
    isRejected,
} from 'app/core/utils/action-request-filter.util';
import { formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { fetchAllPagedRows } from 'app/core/utils/paged-export.util';
import { firstValueFrom, of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { normalizeAllowanceAfter10pmDiscipline } from '../allowance-after-10pm-discipline.util';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

type AllowanceActionType = 'tl_by_status' | 'di_by_status';
type AllowanceAfter10pmListTab = 'all' | 'my' | 'pending' | 'action';
type AllowanceWorkflowStatus = 'draft' | 'pending' | 'reject' | 'approve';

interface ActionRequestItem {
    id: string;
    request: AllowanceAfter10pmListItem;
    actionType: AllowanceActionType;
    currentStatus: string | null;
}

export interface AllowanceAfter10pmListItem {
    id: number;
    claimant_name: string;
    discipline: string | null;
    request_date: string | null;
    total_baht: number;
    status: string | null;
    tl_by?: string | null;
    tl_by_status?: string | null;
    tl_by_date?: string | null;
    di_by?: string | null;
    di_by_status?: string | null;
    di_by_date?: string | null;
    notified_user?: string | null;
    notified_user_status?: string | null;
    notified_user_date?: string | null;
    create_by?: string | null;
    update_by?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    No?: number;
    action_type?: AllowanceActionType | null;
    current_status?: string | null;
}

@Component({
    selector: 'app-allowance-after-10pm-list',
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
    templateUrl: './allowance-after-10pm-list.component.html',
    styleUrls: ['./allowance-after-10pm-list.component.scss'],
})
export class AllowanceAfter10pmListComponent implements OnInit, OnDestroy {
    listSort: ListSortEvent = { column: 0, dir: 'desc' };
    actionListSort: ListSortEvent = { column: 0, dir: 'desc' };
    private _unsubscribeAll = new Subject<void>();
    readonly navigationPermissionService = inject(NavigationPermissionService);
    readonly permissionNavId = 'allowance-after-10pm';

    displayedColumns: string[] = [
        'createdBy',
        'total',
        'approvedDate',
        'approvedBy',
        'status',
        'actions',
    ];

    actionDisplayedColumns: string[] = [
        'claimant',
        'discipline',
        'total',
        'actionStep',
        'status',
        'action',
    ];

    private allData: AllowanceAfter10pmListItem[] = [];
    filteredDataSource: AllowanceAfter10pmListItem[] = [];
    actionRequests: ActionRequestItem[] = [];

    isLoading = false;
    isExporting = false;
    alert: { type: FuseAlertType; message: string } | null = null;

    currentTab: AllowanceAfter10pmListTab = 'all';
    viewMode: 'card' | 'table' = 'table';
    showFilterPanel = false;

    searchTerm = '';
    statusFilter = '';
    disciplineFilter = '';
    approvedMonthFilter = '';
    approvedByFilter = '';
    approvedDateFrom = '';
    approvedDateTo = '';

    totalRecords = 0;
    private actionRequestTotal = 0;
    pageSize = 10;
    pageIndex = 0;
    employeeLookup = new Map<string, string>();

    filterConfig: PurchaseFormsFilterConfig = {
        searchLabel: 'Search Allowance After 10.00 PM',
        searchPlaceholder: 'Search by claimant, discipline, or creator...',
        statusFilterLabel: 'Filter by Status',
        statusOptions: [
            { value: 'draft', label: 'Draft' },
            { value: 'pending', label: 'Pending' },
            { value: 'reject', label: 'Rejected' },
            { value: 'approve', label: 'Completed' },
        ],
        statusLabelFn: (value: string) => this.getStatusLabel(value),
        thirdFilterLabel: 'Filter by Discipline',
        thirdFilterOptions: [],
        showThirdFilter: true,
        monthFilterLabel: 'Filter by Approved Month',
        showMonthFilter: true,
    };

    constructor(
        private route: ActivatedRoute,
        private apiService: ApiService,
        private employeeService: EmployeeService,
        private fuseConfirmationService: FuseConfirmationService
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

        this.route.queryParams
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((params) => {
                if (params['tab']) {
                    this.currentTab = this.normalizeTab(
                        params['tab'] as AllowanceAfter10pmListTab
                    );
                    this.pageIndex = 0;
                }
                this.loadAllowances();
            });
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next();
        this._unsubscribeAll.complete();
    }

    private normalizeTab(
        tab: AllowanceAfter10pmListTab
    ): AllowanceAfter10pmListTab {
        const validTabs: AllowanceAfter10pmListTab[] = [
            'all',
            'my',
            'pending',
            'action',
        ];
        const normalized = validTabs.includes(tab) ? tab : 'all';

        return normalized === 'all' &&
            !this.navigationPermissionService.hasViewAllPermissionByNavId(
                this.permissionNavId
            )
            ? 'my'
            : normalized;
    }

    loadAllowances(): void {
        this.currentTab = this.normalizeTab(this.currentTab);
        this.isLoading = true;
        this.alert = null;

        const requestBody = this.buildPageRequest(
            this.pageIndex * this.pageSize,
            this.pageSize
        );

        this.apiService
            .getAllowanceAfter10pmPage(requestBody)
            .pipe(
                takeUntil(this._unsubscribeAll),
                catchError((error) => {
                    console.error('Error loading allowance after 10pm:', error);
                    this.showAlert(
                        'error',
                        error?.error?.message ||
                            'Failed to load allowance requests. Please try again.'
                    );
                    return of(null);
                }),
                finalize(() => (this.isLoading = false))
            )
            .subscribe((response) => {
                if (!response?.status || !response?.data) {
                    this.allData = [];
                    this.filteredDataSource = [];
                    this.actionRequests = [];
                    this.totalRecords = 0;
                    this.actionRequestTotal = 0;
                    if (response) {
                        this.showAlert(
                            'error',
                            response.message ||
                                'Failed to load allowance requests'
                        );
                    }
                    return;
                }

                const items = response.data.data || [];
                this.allData = items.map((item: any) =>
                    this.mapAllowanceItem(item)
                );
                this.filteredDataSource = this.allData;
                this.actionRequests = this.currentTab === 'action'
                    ? this.allData
                        .filter((item) => item.action_type === 'tl_by_status' || item.action_type === 'di_by_status')
                        .map((item) => ({
                            id: String(item.id),
                            request: item,
                            actionType: item.action_type as AllowanceActionType,
                            currentStatus: item.current_status ?? null,
                        }))
                    : [];
                this.totalRecords = Number(response.data.total ?? items.length);
                this.actionRequestTotal = Number(response.data.action_request_count ?? 0);
                this.updateDisciplineFilterOptions(response.data.discipline_options || []);
                this.ensureEmployeeNames();
            });
    }

    private buildPageRequest(start: number, length: number): any {
        return {
            draw: 1,
            type: 'allowance_after_10pm',
            columns: [
                { data: 'create_by' },
                { data: 'total_baht' },
                { data: 'di_by_date' },
                { data: 'di_by' },
                { data: 'status' },
                { data: 'action' },
            ],
            order: [this.currentTab === 'action' ? this.actionListSort : this.listSort],
            start,
            length,
            search: { value: this.searchTerm.trim(), regex: false },
            status: this.statusFilter || null,
            discipline: this.disciplineFilter || null,
            approved_month: this.approvedMonthFilter || null,
            approved_by: this.approvedByFilter || null,
            approved_date_from: this.approvedDateFrom || null,
            approved_date_to: this.approvedDateTo || null,
            tab: this.currentTab,
        };
    }

    async onExportAllowances(): Promise<void> {
        if (this.isExporting) return;
        this.isExporting = true;
        try {
            const items = await fetchAllPagedRows<AllowanceAfter10pmListItem>(async (start, length) => {
                const response = await firstValueFrom(this.apiService.getAllowanceAfter10pmPage(
                    this.buildPageRequest(start, length)
                ).pipe(takeUntil(this._unsubscribeAll)));
                return response?.data || {};
            });
            const XLSX = await import('xlsx');
            const rows = items.map((item, index) => ({
                No: index + 1,
                Claimant: this.getEmployeeLabel(item.claimant_name),
                Discipline: item.discipline || '',
                'Request Date': formatDateTimeDisplay(item.request_date),
                'Total (THB)': Number(item.total_baht || 0),
                'Approved By': this.getEmployeeLabel(item.di_by),
                'Approved Date': formatDateTimeDisplay(item.di_by_date),
                Status: this.getStatusLabel(this.getWorkflowStatus(item)),
            }));
            const worksheet = XLSX.utils.json_to_sheet(rows);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Allowances');
            XLSX.writeFile(workbook, `allowance-after-10pm-${new Date().toISOString().slice(0, 10)}.xlsx`);
        } catch (error: any) {
            this.showAlert('error', error?.error?.message || error?.message || 'Failed to export allowance requests');
        } finally {
            this.isExporting = false;
        }
    }

    private mapAllowanceItem(item: any): AllowanceAfter10pmListItem {
        return {
            id: Number(item.id),
            claimant_name: item.claimant_name || '',
            discipline:
                normalizeAllowanceAfter10pmDiscipline(item.discipline) || null,
            request_date: item.request_date || null,
            total_baht: Number(item.total_baht || 0),
            status: item.status || null,
            tl_by: item.tl_by || null,
            tl_by_status: item.tl_by_status ?? null,
            tl_by_date: item.tl_by_date || null,
            di_by: item.di_by || null,
            di_by_status: item.di_by_status ?? null,
            di_by_date: item.di_by_date || null,
            notified_user: item.notified_user || null,
            notified_user_status: item.notified_user_status ?? null,
            notified_user_date: item.notified_user_date || null,
            create_by: item.create_by || null,
            update_by: item.update_by || null,
            created_at: item.created_at || null,
            updated_at: item.updated_at || null,
            No: item.No || 0,
            action_type: item.action_type || null,
            current_status: item.current_status ?? null,
        };
    }

    private updateDisciplineFilterOptions(serverOptions: string[] = []): void {
        const options = Array.from(
            new Set(
                serverOptions
                    .map((discipline) => normalizeAllowanceAfter10pmDiscipline(discipline))
                    .filter((discipline): discipline is string => !!discipline)
            )
        )
            .sort((a, b) => a.localeCompare(b))
            .map((discipline) => ({ value: discipline, label: discipline }));

        this.filterConfig = {
            ...this.filterConfig,
            thirdFilterOptions: options,
            showThirdFilter: options.length > 0,
        };

        if (
            this.disciplineFilter &&
            !options.some((option) => option.value === this.disciplineFilter)
        ) {
            this.disciplineFilter = '';
        }
    }

    private ensureEmployeeNames(): void {
        const codes = new Set<string>();
        this.allData.forEach((item) => {
            [
                item.claimant_name,
                item.create_by,
                item.update_by,
                item.tl_by,
                item.di_by,
                item.notified_user,
            ].forEach((code) => {
                if (code) codes.add(code);
            });
        });

        if (codes.size === 0) return;

        this.employeeService
            .ensureEmployeesInLookup(this.employeeLookup, Array.from(codes))
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((lookup) => {
                this.employeeLookup = lookup;
            });
    }

    onPageChange(event: PageEvent): void {
        this.pageIndex = event.pageIndex;
        this.pageSize = event.pageSize;
        this.loadAllowances();
    }

    onTabChange(tab: AllowanceAfter10pmListTab): void {
        this.currentTab = this.normalizeTab(tab);
        this.pageIndex = 0;
        this.closeFilterPanel();
        this.loadAllowances();
    }

    onFilterChange(resetPage = true): void {
        if (resetPage) this.pageIndex = 0;
        this.loadAllowances();
    }

    applyFilters(filters: PurchaseFormsFilterValues): void {
        this.searchTerm = filters.searchTerm || '';
        this.statusFilter = filters.statusFilter || '';
        this.disciplineFilter = filters.thirdFilter || '';
        this.approvedMonthFilter = filters.monthFilter || '';
        this.approvedByFilter = filters.approvedBy || '';
        this.approvedDateFrom = filters.approvedDateFrom || '';
        this.approvedDateTo = filters.approvedDateTo || '';
        this.pageIndex = 0;
        this.closeFilterPanel();
        this.loadAllowances();
    }

    clearFilters(): void {
        this.searchTerm = '';
        this.statusFilter = '';
        this.disciplineFilter = '';
        this.approvedMonthFilter = '';
        this.approvedByFilter = '';
        this.approvedDateFrom = '';
        this.approvedDateTo = '';
        this.pageIndex = 0;
        this.closeFilterPanel();
        this.loadAllowances();
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

    get visibleRows(): AllowanceAfter10pmListItem[] {
        return this.filteredDataSource;
    }

    get filteredCount(): number {
        return this.totalRecords;
    }

    get totalCount(): number {
        return this.totalRecords;
    }

    get actionRequestCount(): number {
        return this.actionRequestTotal;
    }

    get activeFilterCount(): number {
        return [
            this.searchTerm,
            this.statusFilter,
            this.disciplineFilter,
            this.approvedMonthFilter,
            this.approvedByFilter,
            this.approvedDateFrom,
            this.approvedDateTo,
        ].filter((value) => !!value).length;
    }

    getListTitle(): string {
        switch (this.currentTab) {
            case 'all':
                return 'All Allowance After 10.00 PM Requests';
            case 'my':
                return 'My Allowance After 10.00 PM Requests';
            case 'pending':
                return 'Pending Allowance After 10.00 PM Requests';
            case 'action':
                return 'Action Requests';
            default:
                return 'Allowance After 10.00 PM Requests';
        }
    }

    getEmptyTitle(): string {
        return this.currentTab === 'action'
            ? 'No action requests found'
            : 'No allowance requests found';
    }

    getEmptyDescription(): string {
        switch (this.currentTab) {
            case 'action':
                return 'No action requests found. All requests have been processed.';
            case 'pending':
                return 'No allowance requests are pending your action at the moment.';
            case 'my':
                return "You haven't created any allowance requests yet.";
            case 'all':
            default:
                return 'No allowance requests have been created yet.';
        }
    }

    canShowCreateEmptyButton(): boolean {
        return (
            (this.currentTab === 'all' || this.currentTab === 'my') &&
            this.activeFilterCount === 0
        );
    }

    getActionTypeText(actionType: AllowanceActionType): string {
        if (actionType === 'tl_by_status') return 'Verified By';
        return 'Approved By';
    }

    getWorkflowStatus(
        item: AllowanceAfter10pmListItem
    ): AllowanceWorkflowStatus {
        if (String(item.status || '').toLowerCase() === 'draft') {
            return 'draft';
        }

        const statuses = [item.tl_by_status, item.di_by_status];
        if (statuses.some((status) => isRejected(status))) return 'reject';
        if (statuses.every((status) => isApproved(status))) return 'approve';
        return 'pending';
    }

    getWorkflowStatusBadgeClass(status: AllowanceWorkflowStatus): string {
        switch (status) {
            case 'draft':
                return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
            case 'approve':
                return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'reject':
                return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
            default:
                return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
        }
    }

    getStatusLabel(status: string): string {
        switch (status || '') {
            case 'draft':
                return 'Draft';
            case 'pending':
                return 'Pending';
            case 'reject':
                return 'Rejected';
            case 'approve':
                return 'Completed';
            default:
                return status;
        }
    }

    getByStatusText(status: string | null | undefined): string {
        if (!status) return 'Pending';
        const normalized = String(status).toLowerCase();
        if (normalized === 'pending') return 'Pending';
        if (normalized === 'reject' || normalized === 'rejected') {
            return 'Rejected';
        }
        if (normalized === 'approve' || normalized === 'approved') {
            return 'Approved';
        }
        return String(status);
    }

    getByStatusColor(status: string | null | undefined): string {
        if (!status) return 'bg-yellow-100 text-yellow-800';
        const normalized = String(status).toLowerCase();
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

    canEdit(item: AllowanceAfter10pmListItem): boolean {
        const status = this.getWorkflowStatus(item);
        return status === 'pending' || status === 'draft';
    }

    canDelete(_item: AllowanceAfter10pmListItem): boolean {
        return true;
    }

    canShowMoreActions(item: AllowanceAfter10pmListItem): boolean {
        const canEdit =
            this.canEdit(item) &&
            this.navigationPermissionService.hasEditPermissionByNavId(
                this.permissionNavId
            );
        const canDelete =
            this.canDelete(item) &&
            this.navigationPermissionService.hasDeletePermissionByNavId(
                this.permissionNavId
            );

        return canEdit || canDelete;
    }

    getEmployeeLabel(ref: string | number | null | undefined): string {
        return this.employeeService.formatEmployeeReference(
            ref,
            this.employeeLookup,
            '-'
        );
    }

    formatDate(dateString: string | null | undefined): string {
        return formatDateTimeDisplay(dateString);
    }

    formatAmount(value: number | string | null | undefined): string {
        return Number(value || 0).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    onDelete(id: string | number): void {
        const confirmation = this.fuseConfirmationService.open({
            title: 'Delete Allowance Request',
            message:
                'Are you sure you want to delete this allowance request? This action cannot be undone.',
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

                this.isLoading = true;
                this.apiService
                    .deleteAllowanceAfter10pm(id)
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe({
                        next: (response) => {
                            if (response?.status) {
                                this.loadAllowances();
                                this.showAlert(
                                    'success',
                                    response.message ||
                                        'Allowance request deleted successfully.'
                                );
                            } else {
                                this.isLoading = false;
                                this.showAlert(
                                    'error',
                                    response?.message ||
                                        'Failed to delete allowance request.'
                                );
                            }
                        },
                        error: (error) => {
                            console.error(
                                'Error deleting allowance after 10pm:',
                                error
                            );
                            this.isLoading = false;
                            this.showAlert(
                                'error',
                                error?.error?.message ||
                                    'Failed to delete allowance request.'
                            );
                        },
                    });
            });
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
        this.loadAllowances();
    }

    onActionListSortChange(event: ListSortEvent): void {
        this.actionListSort = event;
        this.pageIndex = 0;
        this.loadAllowances();
    }
}
