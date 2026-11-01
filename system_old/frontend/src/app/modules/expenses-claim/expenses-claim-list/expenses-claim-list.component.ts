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
import { formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { fetchAllPagedRows } from 'app/core/utils/paged-export.util';
import { firstValueFrom, of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';
import {
    ExpensesClaimWorkflowStatus,
    resolveExpensesClaimWorkflowStatus,
} from '../expenses-claim-status.util';

type ExpensesClaimActionType = 'verified_by_status' | 'approved_by_status';
type ExpensesClaimListTab = 'all' | 'my' | 'pending' | 'action';

interface ActionRequestItem {
    id: string;
    request: ExpensesClaimListItem;
    actionType: ExpensesClaimActionType;
    currentStatus: string | null;
}

export interface ExpensesClaimListItem {
    id: number;
    voucher_no: string;
    claimant_name: string;
    recive_by?: string | null;
    claim_date: string | null;
    total_baht: number;
    status: string | null;
    verified_by?: string | null;
    verified_by_status?: string | null;
    verified_by_date?: string | null;
    approved_by?: string | null;
    approved_by_status?: string | null;
    approved_by_date?: string | null;
    create_by?: string | null;
    update_by?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    No?: number;
    draft_payload?: any;
    action_type?: ExpensesClaimActionType | null;
    current_status?: string | null;
}

@Component({
    selector: 'app-expenses-claim-list',
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
    templateUrl: './expenses-claim-list.component.html',
    styleUrls: ['./expenses-claim-list.component.scss'],
})
export class ExpensesClaimListComponent implements OnInit, OnDestroy {
    listSort: ListSortEvent = { column: 0, dir: 'desc' };
    actionListSort: ListSortEvent = { column: 0, dir: 'desc' };
    private _unsubscribeAll = new Subject<void>();
    readonly navigationPermissionService = inject(NavigationPermissionService);
    readonly permissionNavId = 'expenses-claim';

    displayedColumns: string[] = [
        'createdBy',
        'total',
        'approvedDate',
        'approvedBy',
        'status',
        'actions',
    ];

    actionDisplayedColumns: string[] = [
        'receivedBy',
        'total',
        'actionStep',
        'status',
        'action',
    ];

    private allData: ExpensesClaimListItem[] = [];
    filteredDataSource: ExpensesClaimListItem[] = [];
    actionRequests: ActionRequestItem[] = [];

    isLoading = false;
    isExporting = false;
    alert: { type: FuseAlertType; message: string } | null = null;

    currentTab: ExpensesClaimListTab = 'all';
    viewMode: 'card' | 'table' = 'table';
    showFilterPanel = false;

    searchTerm = '';
    statusFilter = '';
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
        searchLabel: 'Search Expenses Claim',
        searchPlaceholder: 'Search by received by, voucher, or creator...',
        statusFilterLabel: 'Filter by Status',
        statusOptions: [
            { value: 'draft', label: 'Draft' },
            { value: 'pending', label: 'Pending' },
            { value: 'verified', label: 'Verified' },
            { value: 'reject', label: 'Rejected' },
            { value: 'approve', label: 'Approved' },
        ],
        statusLabelFn: (value: string) => this.getStatusLabel(value),
        thirdFilterLabel: '',
        thirdFilterOptions: [],
        showThirdFilter: false,
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
                        params['tab'] as ExpensesClaimListTab
                    );
                    this.pageIndex = 0;
                }
                this.loadClaims();
            });
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next();
        this._unsubscribeAll.complete();
    }

    private normalizeTab(tab: ExpensesClaimListTab): ExpensesClaimListTab {
        const validTabs: ExpensesClaimListTab[] = [
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

    loadClaims(): void {
        this.currentTab = this.normalizeTab(this.currentTab);
        this.isLoading = true;
        this.alert = null;

        const requestBody = this.buildPageRequest(
            this.pageIndex * this.pageSize,
            this.pageSize
        );

        this.apiService
            .getExpensesClaimPage(requestBody)
            .pipe(
                takeUntil(this._unsubscribeAll),
                catchError((error) => {
                    console.error('Error loading expenses claims:', error);
                    this.showAlert(
                        'error',
                        error?.error?.message ||
                            'Failed to load expenses claims. Please try again.'
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
                            response.message || 'Failed to load expenses claims'
                        );
                    }
                    return;
                }

                const items = response.data.data || [];
                this.allData = items.map((item: any) =>
                    this.mapClaimItem(item)
                );
                this.filteredDataSource = this.allData;
                this.actionRequests = this.currentTab === 'action'
                    ? this.allData
                        .filter((item) => item.action_type === 'verified_by_status' || item.action_type === 'approved_by_status')
                        .map((item) => ({
                            id: String(item.id),
                            request: item,
                            actionType: item.action_type as ExpensesClaimActionType,
                            currentStatus: item.current_status ?? null,
                        }))
                    : [];
                this.totalRecords = Number(response.data.total ?? items.length);
                this.actionRequestTotal = Number(response.data.action_request_count ?? 0);
                this.ensureEmployeeNames();
            });
    }

    private buildPageRequest(start: number, length: number): any {
        return {
            draw: 1,
            type: 'expenses_claim',
            columns: [
                { data: 'create_by' },
                { data: 'total_baht' },
                { data: 'approved_by_date' },
                { data: 'approved_by' },
                { data: 'status' },
                { data: 'action' },
            ],
            order: [this.currentTab === 'action' ? this.actionListSort : this.listSort],
            start,
            length,
            search: { value: this.searchTerm.trim(), regex: false },
            status: this.statusFilter || null,
            approved_month: this.approvedMonthFilter || null,
            approved_by: this.approvedByFilter || null,
            approved_date_from: this.approvedDateFrom || null,
            approved_date_to: this.approvedDateTo || null,
            tab: this.currentTab,
        };
    }

    async onExportClaims(): Promise<void> {
        if (this.isExporting) return;
        this.isExporting = true;
        try {
            const items = await fetchAllPagedRows<ExpensesClaimListItem>(async (start, length) => {
                const response = await firstValueFrom(this.apiService.getExpensesClaimPage(
                    this.buildPageRequest(start, length)
                ).pipe(takeUntil(this._unsubscribeAll)));
                return response?.data || {};
            });
            const XLSX = await import('xlsx');
            const rows = items.map((item, index) => ({
                No: index + 1,
                'Voucher No.': item.voucher_no || '',
                Claimant: this.getEmployeeLabel(item.claimant_name || item.recive_by || ''),
                'Claim Date': formatDateTimeDisplay(item.claim_date),
                'Total (THB)': Number(item.total_baht || 0),
                'Verified By': this.getEmployeeLabel(item.verified_by),
                'Approved By': this.getEmployeeLabel(item.approved_by),
                'Approved Date': formatDateTimeDisplay(item.approved_by_date),
                Status: this.getStatusLabel(this.getWorkflowStatus(item)),
            }));
            const worksheet = XLSX.utils.json_to_sheet(rows);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Expenses Claims');
            XLSX.writeFile(workbook, `expenses-claims-${new Date().toISOString().slice(0, 10)}.xlsx`);
        } catch (error: any) {
            this.showAlert('error', error?.error?.message || error?.message || 'Failed to export expenses claims');
        } finally {
            this.isExporting = false;
        }
    }

    private mapClaimItem(item: any): ExpensesClaimListItem {
        const displayItem = this.resolveDraftListItem(item);

        return {
            id: Number(item.id),
            voucher_no: item.voucher_no || displayItem.voucher_no || '',
            claimant_name:
                displayItem.claimant_name || item.claimant_name || '',
            recive_by: displayItem.recive_by || item.recive_by || null,
            claim_date: displayItem.claim_date || item.claim_date || null,
            total_baht: Number(displayItem.total_baht ?? item.total_baht ?? 0),
            status: item.status || null,
            verified_by: displayItem.verified_by || item.verified_by || null,
            verified_by_status:
                displayItem.verified_by_status ??
                item.verified_by_status ??
                null,
            verified_by_date:
                displayItem.verified_by_date || item.verified_by_date || null,
            approved_by: displayItem.approved_by || item.approved_by || null,
            approved_by_status:
                displayItem.approved_by_status ??
                item.approved_by_status ??
                null,
            approved_by_date:
                displayItem.approved_by_date || item.approved_by_date || null,
            create_by: item.create_by || displayItem.create_by || null,
            update_by: item.update_by || displayItem.update_by || null,
            created_at: item.created_at || null,
            updated_at: item.updated_at || null,
            No: item.No || 0,
            draft_payload: item.draft_payload,
            action_type: item.action_type || null,
            current_status: item.current_status ?? null,
        };
    }

    private resolveDraftListItem(item: any): any {
        if (String(item?.status || '').toLowerCase() !== 'draft') {
            return item;
        }

        const draftPayload = this.extractDraftPayload(item);
        return {
            ...item,
            ...draftPayload,
            id: item.id,
            voucher_no: item.voucher_no || draftPayload?.voucher_no || '',
            status: item.status,
            draft_payload: item.draft_payload,
            created_at: item.created_at,
            updated_at: item.updated_at,
        };
    }

    private extractDraftPayload(item: any): any {
        const payload = item?.draft_payload;
        if (payload && typeof payload === 'string') {
            try {
                return JSON.parse(payload);
            } catch {
                return item;
            }
        }
        if (payload && typeof payload === 'object') {
            return payload;
        }
        return item;
    }

    private ensureEmployeeNames(): void {
        const codes = new Set<string>();
        this.allData.forEach((item) => {
            [
                item.claimant_name,
                item.recive_by,
                item.create_by,
                item.update_by,
                item.verified_by,
                item.approved_by,
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
        this.loadClaims();
    }

    onTabChange(tab: ExpensesClaimListTab): void {
        this.currentTab = this.normalizeTab(tab);
        this.pageIndex = 0;
        this.closeFilterPanel();
        this.loadClaims();
    }

    onFilterChange(resetPage = true): void {
        if (resetPage) this.pageIndex = 0;
        this.loadClaims();
    }

    applyFilters(filters: PurchaseFormsFilterValues): void {
        this.searchTerm = filters.searchTerm || '';
        this.statusFilter = filters.statusFilter || '';
        this.approvedMonthFilter = filters.monthFilter || '';
        this.approvedByFilter = filters.approvedBy || '';
        this.approvedDateFrom = filters.approvedDateFrom || '';
        this.approvedDateTo = filters.approvedDateTo || '';
        this.pageIndex = 0;
        this.closeFilterPanel();
        this.loadClaims();
    }

    clearFilters(): void {
        this.searchTerm = '';
        this.statusFilter = '';
        this.approvedMonthFilter = '';
        this.approvedByFilter = '';
        this.approvedDateFrom = '';
        this.approvedDateTo = '';
        this.pageIndex = 0;
        this.closeFilterPanel();
        this.loadClaims();
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

    get visibleRows(): ExpensesClaimListItem[] {
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
            this.approvedMonthFilter,
            this.approvedByFilter,
            this.approvedDateFrom,
            this.approvedDateTo,
        ].filter((value) => !!value)
            .length;
    }

    getListTitle(): string {
        switch (this.currentTab) {
            case 'all':
                return 'All Expenses Claim Requests';
            case 'my':
                return 'My Expenses Claim Requests';
            case 'pending':
                return 'Pending Expenses Claim Requests';
            case 'action':
                return 'Action Requests';
            default:
                return 'Expenses Claim Requests';
        }
    }

    getEmptyTitle(): string {
        return this.currentTab === 'action'
            ? 'No action requests found'
            : 'No expenses claims found';
    }

    getEmptyDescription(): string {
        switch (this.currentTab) {
            case 'action':
                return 'No action requests found. All requests have been processed.';
            case 'pending':
                return 'No expenses claims are pending your action at the moment.';
            case 'my':
                return "You haven't created any expenses claims yet.";
            case 'all':
            default:
                return 'No expenses claims have been created yet.';
        }
    }

    canShowCreateEmptyButton(): boolean {
        return (
            (this.currentTab === 'all' || this.currentTab === 'my') &&
            this.activeFilterCount === 0
        );
    }

    getActionTypeText(actionType: ExpensesClaimActionType): string {
        if (actionType === 'verified_by_status') return 'Verified By';
        return 'Approved By';
    }

    getWorkflowStatus(
        item: ExpensesClaimListItem
    ): ExpensesClaimWorkflowStatus {
        return resolveExpensesClaimWorkflowStatus(item);
    }

    getWorkflowStatusBadgeClass(status: ExpensesClaimWorkflowStatus): string {
        switch (status) {
            case 'draft':
                return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
            case 'approve':
                return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'verified':
                return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
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
            case 'verified':
                return 'Verified';
            case 'reject':
                return 'Rejected';
            case 'approve':
                return 'Approved';
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

    canEdit(item: ExpensesClaimListItem): boolean {
        const status = this.getWorkflowStatus(item);
        return status === 'pending' || status === 'draft';
    }

    canDelete(_item: ExpensesClaimListItem): boolean {
        return true;
    }

    canShowMoreActions(item: ExpensesClaimListItem): boolean {
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
            title: 'Delete Expenses Claim',
            message:
                'Are you sure you want to delete this expenses claim? This action cannot be undone.',
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
                    .deleteExpensesClaim(id)
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe({
                        next: (response) => {
                            if (response?.status) {
                                this.loadClaims();
                                this.showAlert(
                                    'success',
                                    response.message ||
                                        'Expenses claim deleted successfully.'
                                );
                            } else {
                                this.isLoading = false;
                                this.showAlert(
                                    'error',
                                    response?.message ||
                                        'Failed to delete expenses claim.'
                                );
                            }
                        },
                        error: (error) => {
                            console.error(
                                'Error deleting expenses claim:',
                                error
                            );
                            this.isLoading = false;
                            this.showAlert(
                                'error',
                                error?.error?.message ||
                                    'Failed to delete expenses claim.'
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
        this.loadClaims();
    }

    onActionListSortChange(event: ListSortEvent): void {
        this.actionListSort = event;
        this.pageIndex = 0;
        this.loadClaims();
    }
}
