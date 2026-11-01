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
import {
    CharitableContribution,
    FormStatus,
    RequestType,
} from 'app/core/models/charitable-contribution.model';
import {
    CharitableContributionService,
    CharitableContributionsPageRequest,
} from 'app/core/services/charitable-contribution.service';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';
import {
    filterCharitableContributionActionRequests,
    getCurrentUserCode,
    isCharitableContributionPending,
    isMyRequestByUserCode,
} from 'app/core/utils/action-request-filter.util';
import { formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

interface ActionRequestItem {
    id: string;
    request: CharitableContribution;
    actionType:
        | 'acsc_by_status'
        | 'acsl_by_status'
        | 'approver_by_status'
        | 'approver_by_2_status'
        | 'ims_acknowledged_by_status';
    currentStatus: string | null;
}

type CharitableContributionListTab = 'all' | 'my' | 'pending' | 'action';

@Component({
    selector: 'app-charitable-contribution-list',
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
    templateUrl: './charitable-contribution-list.component.html',
    styleUrls: ['./charitable-contribution-list.component.scss'],
})
export class CharitableContributionListComponent implements OnInit, OnDestroy {
    listSort: ListSortEvent = { column: 5, dir: 'desc' };
    private _unsubscribeAll: Subject<void> = new Subject<void>();
    readonly navigationPermissionService = inject(NavigationPermissionService);
    readonly permissionNavId =
        'request-for-charitable-contributions-sponsorship';

    displayedColumns: string[] = [
        'description',
        'organizer',
        'type',
        'amount',
        'proposedDate',
        'createdAt',
        'status',
        'actions',
    ];

    actionDisplayedColumns: string[] = [
        'description',
        'organizer',
        'type',
        'amount',
        'actionStep',
        'status',
        'action',
    ];

    private allData: CharitableContribution[] = [];
    private allActionRequests: ActionRequestItem[] = [];
    filteredRequests: CharitableContribution[] = [];
    actionRequests: ActionRequestItem[] = [];

    isLoading = false;
    alert: { type: FuseAlertType; message: string } | null = null;

    currentTab: CharitableContributionListTab = 'all';
    viewMode: 'card' | 'table' = 'table';
    showFilterPanel = false;

    searchTerm = '';
    statusFilter = '';
    requestTypeFilter = '';

    totalRecords = 0;
    pageSize = 10;
    pageIndex = 0;

    filterConfig: PurchaseFormsFilterConfig = {
        searchLabel: 'Search Charitable Contributions',
        searchPlaceholder: 'Search by description, organizer, or requester...',
        statusFilterLabel: 'Filter by Status',
        statusOptions: [
            { value: 'pending', label: 'Pending' },
            { value: 'reject', label: 'Rejected' },
            { value: 'approve', label: 'Approved' },
        ],
        statusLabelFn: (value: string) => this.getStatusLabel(value),
        thirdFilterLabel: 'Filter by Request Type',
        thirdFilterOptions: [
            {
                value: RequestType.CHARITABLE_CONTRIBUTION,
                label: 'Charitable Contribution',
            },
            { value: RequestType.SPONSORSHIP, label: 'Sponsorship' },
        ],
        showThirdFilter: true,
    };

    constructor(
        private charitableContributionService: CharitableContributionService,
        private router: Router,
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

        this.loadRequests();
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next();
        this._unsubscribeAll.complete();
    }

    loadRequests(): void {
        this.isLoading = true;
        this.alert = null;

        const request: CharitableContributionsPageRequest = {
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

        this.charitableContributionService
            .findAllPaginated(request)
            .pipe(
                takeUntil(this._unsubscribeAll),
                catchError((error) => {
                    console.error(
                        'Error loading charitable contribution requests:',
                        error
                    );
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
        this.pageSize = event.pageSize;
        this.pageIndex = event.pageIndex;
    }

    onTabChange(tab: CharitableContributionListTab): void {
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
                        isCharitableContributionPending(request)) ||
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
            filterCharitableContributionActionRequests(this.allData, userCode)
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

    private matchesSearchTerm(
        request: CharitableContribution,
        term: string
    ): boolean {
        if (!term) return true;

        const requestedByName = `${request.requestedBy?.firstName || ''} ${
            request.requestedBy?.lastName || ''
        }`;

        return [
            request.eventDescription,
            request.eventPurpose,
            request.organizerName,
            request.contributionDescription,
            request.createBy,
            request.updateBy,
            request.requestedById,
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

    get visibleRows(): CharitableContribution[] {
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
                return 'All Charitable Contribution Requests';
            case 'my':
                return 'My Charitable Contribution Requests';
            case 'pending':
                return 'Pending Charitable Contribution Requests';
            case 'action':
                return 'Action Requests';
            default:
                return 'Charitable Contribution Requests';
        }
    }

    getEmptyTitle(): string {
        return this.currentTab === 'action'
            ? 'No action requests found'
            : 'No requests found';
    }

    getEmptyDescription(): string {
        switch (this.currentTab) {
            case 'action':
                return 'No action requests found. All requests have been processed.';
            case 'pending':
                return 'No requests are pending your action at the moment.';
            case 'my':
                return "You haven't created any requests yet.";
            case 'all':
            default:
                return 'No charitable contribution or sponsorship requests have been created yet.';
        }
    }

    canShowCreateEmptyButton(): boolean {
        return (
            (this.currentTab === 'all' || this.currentTab === 'my') &&
            this.activeFilterCount === 0
        );
    }

    getRequestTypeLabel(type: RequestType | string | null | undefined): string {
        return type === RequestType.CHARITABLE_CONTRIBUTION
            ? 'Charitable Contribution'
            : 'Sponsorship';
    }

    formatCurrency(
        amount: number | null | undefined,
        currencyCode: string | null | undefined = 'THB'
    ): string {
        return new Intl.NumberFormat('th-TH', {
            style: 'currency',
            currency: currencyCode || 'THB',
        }).format(Number(amount || 0));
    }

    formatDate(dateString: string | null | undefined): string {
        return formatDateTimeDisplay(dateString);
    }

    getDescription(request: CharitableContribution): string {
        return request.eventDescription || '-';
    }

    getOrganizer(request: CharitableContribution): string {
        return request.organizerName || '-';
    }

    canEdit(request: CharitableContribution): boolean {
        return this.getWorkflowStatus(request) === 'pending';
    }

    canDelete(request: CharitableContribution): boolean {
        return this.getWorkflowStatus(request) === 'pending';
    }

    canSubmit(request: CharitableContribution): boolean {
        return request.status === FormStatus.DRAFT;
    }

    canShowMoreActions(request: CharitableContribution): boolean {
        return (
            (this.navigationPermissionService.hasEditPermissionByNavId(
                this.permissionNavId
            ) &&
                this.canEdit(request)) ||
            this.canSubmit(request) ||
            (this.canDelete(request) &&
                this.navigationPermissionService.hasDeletePermissionByNavId(
                    this.permissionNavId
                ))
        );
    }

    editRequest(request: CharitableContribution): void {
        this.router.navigate(['/charitable-contributions/edit', request.id]);
    }

    viewRequest(request: CharitableContribution): void {
        this.router.navigate(['/charitable-contributions/view', request.id]);
    }

    deleteRequest(request: CharitableContribution): void {
        const confirmation = this.fuseConfirmationService.open({
            title: 'Delete Request',
            message:
                'Are you sure you want to delete this charitable contribution request? This action cannot be undone.',
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
                this.charitableContributionService
                    .delete(request.id)
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
                            this.isLoading = false;
                            this.showAlert(
                                'error',
                                error?.error?.message ||
                                    'Failed to delete request. Please try again.'
                            );
                        },
                    });
            });
    }

    submitRequest(request: CharitableContribution): void {
        const confirmation = this.fuseConfirmationService.open({
            title: 'Confirm Submit',
            message: 'Are you sure you want to submit this request?',
            icon: {
                show: true,
                name: 'heroicons_outline:question-mark-circle',
                color: 'primary',
            },
            actions: {
                cancel: { show: true, label: 'Cancel' },
                confirm: { show: true, label: 'Submit', color: 'primary' },
            },
            dismissible: false,
        });

        confirmation
            .afterClosed()
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((result) => {
                if (result !== 'confirmed') return;

                this.charitableContributionService
                    .submit(request.id)
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe({
                        next: () => {
                            this.loadRequests();
                            this.showAlert(
                                'success',
                                'Request submitted successfully.'
                            );
                        },
                        error: (error) => {
                            this.showAlert(
                                'error',
                                error.error?.message ||
                                    'Failed to submit request. Please try again.'
                            );
                        },
                    });
            });
    }

    getActionTypeLabel(actionType: ActionRequestItem['actionType']): string {
        switch (actionType) {
            case 'acsc_by_status':
                return 'Verify (ACSC)';
            case 'acsl_by_status':
                return 'Acknowledge 2 (CA - JN)';
            case 'ims_acknowledged_by_status':
                return 'Acknowledge 1 (ACSL)';
            case 'approver_by_status':
                return 'Approve (DI/MD)';
            case 'approver_by_2_status':
                return 'Approve 2 (DI)';
            default:
                return 'Update Status';
        }
    }

    getActionStatusText(status: string | null | undefined): string {
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

    getActionStatusColor(status: string | null | undefined): string {
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
        item: CharitableContribution
    ): 'pending' | 'reject' | 'approve' {
        const statuses = [
            item.acscByStatus,
            item.approverByStatus,
            item.approverBy2Status,
            item.imsAcknowledgedByStatus,
            item.acslByStatus,
        ];
        const activeStatuses = statuses.filter(
            (status, index) => index !== 2 || !!item.approverBy2 || !!status
        );
        const hasReject = statuses.some((status) => {
            const normalized = status?.toLowerCase();
            return normalized === 'reject' || normalized === 'rejected';
        });

        if (hasReject) return 'reject';

        const allApproved = activeStatuses.every((status) => {
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
            case 'draft':
                return 'Draft';
            case 'submitted':
                return 'Submitted';
            default:
                return status;
        }
    }

    private sortRequestsByLatest(
        requests: CharitableContribution[]
    ): CharitableContribution[] {
        return [...requests].sort(
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

    private getLatestTimestamp(request: CharitableContribution): number {
        const dateValue =
            request.updatedAt ||
            request.createdAt ||
            request.requestedDate ||
            request.proposedDate;
        const timestamp = dateValue ? new Date(dateValue).getTime() : 0;
        return Number.isNaN(timestamp) ? 0 : timestamp;
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
