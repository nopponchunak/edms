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
import { GiftHospitality } from 'app/core/models/gift-hospitality.model';
import {
    GiftHospitalitiesPageRequest,
    GiftHospitalityService,
} from 'app/core/services/gift-hospitality.service';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';
import {
    filterGiftHospitalityActionRequests,
    getCurrentUserCode,
    isMyRequestByUserCode,
} from 'app/core/utils/action-request-filter.util';
import { formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

interface ActionRequestItem {
    id: string;
    request: GiftHospitality;
    actionType:
        | 'verified_by_status'
        | 'acknowledged_by_status'
        | 'approved_by_status'
        | 'ims_acknowledged_by_status';
    currentStatus: string | null;
}

type GiftHospitalityListTab = 'all' | 'my' | 'pending' | 'action';

@Component({
    selector: 'app-gift-hospitality-list',
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
    templateUrl: './gift-hospitality-list.component.html',
    styleUrls: ['./gift-hospitality-list.component.scss'],
})
export class GiftHospitalityListComponent implements OnInit, OnDestroy {
    listSort: ListSortEvent = { column: 0, dir: 'desc' };
    private _unsubscribeAll: Subject<void> = new Subject<void>();
    readonly navigationPermissionService = inject(NavigationPermissionService);
    readonly permissionNavId = 'request-for-receiving-of-gift-hospitality';

    displayedColumns: string[] = [
        'description',
        'company',
        'type',
        'value',
        'proposedDate',
        'createdAt',
        'status',
        'actions',
    ];

    actionDisplayedColumns: string[] = [
        'description',
        'company',
        'type',
        'value',
        'actionStep',
        'status',
        'action',
    ];

    private allData: GiftHospitality[] = [];
    private allActionRequests: ActionRequestItem[] = [];
    filteredRequests: GiftHospitality[] = [];
    actionRequests: ActionRequestItem[] = [];

    isLoading = false;
    alert: { type: FuseAlertType; message: string } | null = null;

    currentTab: GiftHospitalityListTab = 'all';
    viewMode: 'card' | 'table' = 'table';
    showFilterPanel = false;

    searchTerm = '';
    statusFilter = '';
    requestTypeFilter = '';

    totalRecords = 0;
    pageSize = 10;
    pageIndex = 0;

    filterConfig: PurchaseFormsFilterConfig = {
        searchLabel: 'Search Gift / Hospitality Receiving',
        searchPlaceholder: 'Search by description, company, or purpose...',
        statusFilterLabel: 'Filter by Status',
        statusOptions: [
            { value: 'pending', label: 'Pending' },
            { value: 'reject', label: 'Rejected' },
            { value: 'approve', label: 'Approved' },
        ],
        statusLabelFn: (value: string) => this.getStatusLabel(value),
        thirdFilterLabel: 'Filter by Request Type',
        thirdFilterOptions: [
            { value: 'gift', label: 'Gift' },
            { value: 'hospitality', label: 'Hospitality' },
        ],
        showThirdFilter: true,
    };

    constructor(
        private giftHospitalityService: GiftHospitalityService,
        private route: ActivatedRoute,
        private fuseConfirmationService: FuseConfirmationService
    ) {}

    ngOnInit(): void {
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
                        params['tab'] as GiftHospitalityListTab
                    );
                    this.pageIndex = 0;
                }
                this.loadRequests();
            });
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next();
        this._unsubscribeAll.complete();
    }

    private normalizeTab(tab: GiftHospitalityListTab): GiftHospitalityListTab {
        const validTabs: GiftHospitalityListTab[] = [
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

    loadRequests(): void {
        this.currentTab = this.normalizeTab(this.currentTab);
        this.isLoading = true;
        this.alert = null;

        const request: GiftHospitalitiesPageRequest = {
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

        this.giftHospitalityService
            .findAllPaginated(request)
            .pipe(
                takeUntil(this._unsubscribeAll),
                catchError((error) => {
                    console.error('Error loading gift hospitalities:', error);
                    this.showAlert(
                        'error',
                        error?.error?.message ||
                            'Failed to load requests. Please try again.'
                    );
                    return of(null);
                }),
                finalize(() => (this.isLoading = false))
            )
            .subscribe((response) => {
                this.allData = response?.data ?? [];
                this.buildActionRequests();
                this.onFilterChange(false);
            });
    }

    onPageChange(event: PageEvent): void {
        this.pageIndex = event.pageIndex;
        this.pageSize = event.pageSize;
    }

    onTabChange(tab: GiftHospitalityListTab): void {
        this.currentTab = this.normalizeTab(tab);
        this.pageIndex = 0;
        this.closeFilterPanel();
        this.onFilterChange(false);
    }

    onFilterChange(resetPage = true): void {
        if (this.currentTab === 'action') {
            this.applyActionFilters();
            this.filteredRequests = this.actionRequests.map(
                (item) => item.request
            );
            this.totalRecords = this.actionRequests.length;
            return;
        }

        this.applyClientSideFilters(resetPage);
        this.totalRecords = this.filteredRequests.length;
    }

    private applyClientSideFilters(resetPage = true): void {
        const term = (this.searchTerm || '').toLowerCase().trim();
        const userCode = getCurrentUserCode();
        const actionRequestIds = new Set(
            this.allActionRequests.map((item) => String(item.request.id))
        );

        this.filteredRequests = this.allData.filter((request) => {
            let matchesTab = true;

            if (this.currentTab === 'my') {
                matchesTab = isMyRequestByUserCode(request, userCode);
            } else if (this.currentTab === 'pending') {
                matchesTab =
                    (isMyRequestByUserCode(request, userCode) &&
                        this.getWorkflowStatus(request) === 'pending') ||
                    actionRequestIds.has(String(request.id));
            }

            const matchesSearch = this.matchesSearchTerm(request, term);
            const matchesStatus =
                !this.statusFilter ||
                this.getWorkflowStatus(request) === this.statusFilter;
            const matchesType =
                !this.requestTypeFilter ||
                request.requestType === this.requestTypeFilter;

            return matchesTab && matchesSearch && matchesStatus && matchesType;
        });

        if (resetPage) {
            this.pageIndex = 0;
        }
    }

    private buildActionRequests(): void {
        const userCode = getCurrentUserCode();
        this.allActionRequests = this.sortActionRequestsByLatest(
            filterGiftHospitalityActionRequests(this.allData, userCode)
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
                !this.requestTypeFilter ||
                request.requestType === this.requestTypeFilter;

            return matchesSearch && matchesStatus && matchesType;
        });
    }

    private matchesSearchTerm(request: GiftHospitality, term: string): boolean {
        if (!term) return true;

        const requestedByName = `${request.requestedBy?.firstName || ''} ${
            request.requestedBy?.lastName || ''
        }`;

        return [
            request.description,
            request.purpose,
            request.companyOfGiver,
            request.requestType,
            request.createBy,
            request.updateBy,
            request.requestedBy?.email,
            requestedByName,
        ].some((value) =>
            String(value || '')
                .toLowerCase()
                .includes(term)
        );
    }

    clearFilters(): void {
        this.searchTerm = '';
        this.statusFilter = '';
        this.requestTypeFilter = '';
        this.pageIndex = 0;
        this.closeFilterPanel();
        this.onFilterChange();
    }

    applyFilters(filters: PurchaseFormsFilterValues): void {
        this.searchTerm = filters.searchTerm || '';
        this.statusFilter = filters.statusFilter || '';
        this.requestTypeFilter = filters.thirdFilter || '';
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

    get visibleRows(): GiftHospitality[] {
        const start = this.pageIndex * this.pageSize;
        return this.filteredRequests.slice(start, start + this.pageSize);
    }

    get filteredCount(): number {
        return this.currentTab === 'action'
            ? this.actionRequests.length
            : this.filteredRequests.length;
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
            this.requestTypeFilter,
        ].filter((value) => !!value).length;
    }

    getListTitle(): string {
        switch (this.currentTab) {
            case 'all':
                return 'All Gift / Hospitality Receiving Requests';
            case 'my':
                return 'My Gift / Hospitality Receiving Requests';
            case 'pending':
                return 'Pending Gift / Hospitality Receiving Requests';
            case 'action':
                return 'Action Requests';
            default:
                return 'Gift / Hospitality Receiving Requests';
        }
    }

    getEmptyTitle(): string {
        return this.currentTab === 'action'
            ? 'No action requests found'
            : 'No gift / hospitality receiving requests found';
    }

    getEmptyDescription(): string {
        switch (this.currentTab) {
            case 'action':
                return 'No action requests found. All requests have been processed.';
            case 'pending':
                return 'No receiving requests are pending your action at the moment.';
            case 'my':
                return "You haven't created any gift / hospitality receiving requests yet.";
            case 'all':
            default:
                return 'No gift or hospitality receiving requests have been created yet.';
        }
    }

    canShowCreateEmptyButton(): boolean {
        return (
            (this.currentTab === 'all' || this.currentTab === 'my') &&
            this.activeFilterCount === 0
        );
    }

    deleteRequest(id: string): void {
        const confirmation = this.fuseConfirmationService.open({
            title: 'Delete Request',
            message:
                'Are you sure you want to delete this request? This action cannot be undone.',
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
                this.giftHospitalityService
                    .remove(id)
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe({
                        next: () => {
                            this.loadRequests();
                            this.showAlert(
                                'success',
                                'Request deleted successfully.'
                            );
                        },
                        error: (error) => {
                            console.error('Error deleting request:', error);
                            this.isLoading = false;
                            this.showAlert('error', 'Error deleting request.');
                        },
                    });
            });
    }

    canEdit(request: GiftHospitality): boolean {
        return this.getWorkflowStatus(request) === 'pending';
    }

    canDelete(request: GiftHospitality): boolean {
        return this.getWorkflowStatus(request) === 'pending';
    }

    canShowMoreActions(request: GiftHospitality): boolean {
        return (
            (this.canEdit(request) &&
                this.navigationPermissionService.hasEditPermissionByNavId(
                    this.permissionNavId
                )) ||
            (this.canDelete(request) &&
                this.navigationPermissionService.hasDeletePermissionByNavId(
                    this.permissionNavId
                ))
        );
    }

    getRequestTypeText(type: string | null | undefined): string {
        return type === 'gift' ? 'Gift' : 'Hospitality';
    }

    formatCurrency(value: number | null | undefined): string {
        return new Intl.NumberFormat('th-TH', {
            style: 'currency',
            currency: 'THB',
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }).format(Number(value || 0));
    }

    formatDate(dateString: string | null | undefined): string {
        return formatDateTimeDisplay(dateString);
    }

    getDescription(request: GiftHospitality): string {
        return request.description || '-';
    }

    getCompany(request: GiftHospitality): string {
        return request.companyOfGiver || '-';
    }

    getRequester(request: GiftHospitality): string {
        const firstName = request.requestedBy?.firstName || '';
        const lastName = request.requestedBy?.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim();
        return fullName || request.createBy || '-';
    }

    getActionTypeText(actionType: string): string {
        switch (actionType) {
            case 'verified_by_status':
                return 'Verified By';
            case 'acknowledged_by_status':
                return 'Acknowledge 2 (CA)';
            case 'approved_by_status':
                return 'Approved By';
            case 'ims_acknowledged_by_status':
                return 'Acknowledge 1 (ACSL)';
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

    getWorkflowStatus(
        request: GiftHospitality
    ): 'pending' | 'reject' | 'approve' {
        const statuses = [
            request.verifiedByStatus,
            request.acknowledgedByStatus,
            request.approvedByStatus,
            request.imsAcknowledgedByStatus,
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
        switch (status || '') {
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

    private sortRequestsByLatest(items: GiftHospitality[]): GiftHospitality[] {
        return [...items].sort(
            (a, b) => this.getLatestTimestamp(b) - this.getLatestTimestamp(a)
        );
    }

    private sortActionRequestsByLatest(
        items: ActionRequestItem[]
    ): ActionRequestItem[] {
        return [...items].sort(
            (a, b) =>
                this.getLatestTimestamp(b.request) -
                this.getLatestTimestamp(a.request)
        );
    }

    private getLatestTimestamp(request: GiftHospitality): number {
        const dateValue =
            request.updatedAt || request.createdAt || request.proposedDate;
        const timestamp = dateValue ? new Date(dateValue).getTime() : 0;
        if (!Number.isNaN(timestamp)) {
            return timestamp;
        }

        const id = Number(request.id);
        return Number.isNaN(id) ? 0 : id;
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
        this.loadRequests();
    }
}
