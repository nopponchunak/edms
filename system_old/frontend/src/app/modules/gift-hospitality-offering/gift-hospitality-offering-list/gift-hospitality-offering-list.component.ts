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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import {
    PurchaseFormsFilterComponent,
    PurchaseFormsFilterConfig,
    PurchaseFormsFilterValues,
} from 'app/core/components/purchase-forms-filter';
import { GiftHospitalityOffering } from 'app/core/models/gift-hospitality-offering.model';
import {
    GiftHospitalityOfferingService,
    GiftHospitalityOfferingsPageRequest,
} from 'app/core/services/gift-hospitality-offering.service';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';
import {
    filterGiftHospitalityOfferingActionRequests,
    getCurrentUserCode,
    isMyRequestByUserCode,
} from 'app/core/utils/action-request-filter.util';
import { formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

interface ActionRequestItem {
    id: string;
    request: GiftHospitalityOffering;
    actionType:
        | 'verified_by_status'
        | 'acknowledged_by_status'
        | 'approved_by_status'
        | 'approved_by_2_status'
        | 'ims_acknowledged_by_status';
    currentStatus: string | null;
}

type GiftHospitalityOfferingListTab = 'all' | 'my' | 'pending' | 'action';

@Component({
    selector: 'app-gift-hospitality-offering-list',
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
    templateUrl: './gift-hospitality-offering-list.component.html',
    styleUrls: ['./gift-hospitality-offering-list.component.scss'],
})
export class GiftHospitalityOfferingListComponent implements OnInit, OnDestroy {
    listSort: ListSortEvent = { column: 0, dir: 'desc' };
    private _unsubscribeAll: Subject<void> = new Subject<void>();
    readonly navigationPermissionService = inject(NavigationPermissionService);
    readonly permissionNavId = 'request-for-offering-of-gift-hospitality';

    displayedColumns: string[] = [
        'description',
        'receiver',
        'type',
        'value',
        'proposedDate',
        'createdAt',
        'status',
        'actions',
    ];

    actionDisplayedColumns: string[] = [
        'description',
        'receiver',
        'type',
        'value',
        'actionStep',
        'status',
        'action',
    ];

    private allData: GiftHospitalityOffering[] = [];
    private allActionRequests: ActionRequestItem[] = [];
    filteredOfferings: GiftHospitalityOffering[] = [];
    actionRequests: ActionRequestItem[] = [];

    isLoading = false;
    alert: { type: FuseAlertType; message: string } | null = null;

    currentTab: GiftHospitalityOfferingListTab = 'all';
    viewMode: 'card' | 'table' = 'table';
    showFilterPanel = false;

    searchTerm = '';
    statusFilter = '';
    requestTypeFilter = '';

    totalRecords = 0;
    pageSize = 10;
    pageIndex = 0;

    filterConfig: PurchaseFormsFilterConfig = {
        searchLabel: 'Search Gift / Hospitality Offering',
        searchPlaceholder: 'Search by description, receiver, or purpose...',
        statusFilterLabel: 'Filter by Status',
        statusOptions: [
            { value: 'pending', label: 'Pending' },
            { value: 'reject', label: 'Rejected' },
            { value: 'approve', label: 'Approved' },
        ],
        statusLabelFn: (value: string) => this.getStatusLabel(value),
        thirdFilterLabel: 'Filter by Request Type',
        thirdFilterOptions: [
            { value: 'Gift', label: 'Gift' },
            { value: 'Hospitality', label: 'Hospitality' },
        ],
        showThirdFilter: true,
    };

    constructor(
        private offeringService: GiftHospitalityOfferingService,
        private router: Router,
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
                        params['tab'] as GiftHospitalityOfferingListTab
                    );
                    this.pageIndex = 0;
                }
                this.loadOfferings();
            });
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next();
        this._unsubscribeAll.complete();
    }

    private normalizeTab(
        tab: GiftHospitalityOfferingListTab
    ): GiftHospitalityOfferingListTab {
        return tab === 'all' &&
            !this.navigationPermissionService.hasViewAllPermissionByNavId(
                this.permissionNavId
            )
            ? 'my'
            : tab;
    }

    loadOfferings(): void {
        this.currentTab = this.normalizeTab(this.currentTab);
        this.isLoading = true;
        this.alert = null;

        const request: GiftHospitalityOfferingsPageRequest = {
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

        this.offeringService
            .findAllPaginated(request)
            .pipe(
                takeUntil(this._unsubscribeAll),
                catchError((error) => {
                    console.error(
                        'Error loading gift hospitality offerings:',
                        error
                    );
                    this.showAlert(
                        'error',
                        error?.error?.message ||
                            'Failed to load offerings. Please try again.'
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

    onTabChange(tab: GiftHospitalityOfferingListTab): void {
        this.currentTab = this.normalizeTab(tab);
        this.pageIndex = 0;
        this.closeFilterPanel();
        this.onFilterChange(false);
    }

    onFilterChange(resetPage = true): void {
        if (this.currentTab === 'action') {
            this.applyActionFilters();
            this.filteredOfferings = this.actionRequests.map(
                (item) => item.request
            );
            this.totalRecords = this.actionRequests.length;
            return;
        }

        this.applyClientSideFilters(resetPage);
        this.totalRecords = this.filteredOfferings.length;
    }

    private applyClientSideFilters(resetPage = true): void {
        const term = (this.searchTerm || '').toLowerCase().trim();
        const userCode = getCurrentUserCode();
        const actionRequestIds = new Set(
            this.allActionRequests.map((item) => String(item.request.id))
        );

        this.filteredOfferings = this.allData.filter((offering) => {
            let matchesTab = true;

            if (this.currentTab === 'my') {
                matchesTab = isMyRequestByUserCode(offering, userCode);
            } else if (this.currentTab === 'pending') {
                matchesTab =
                    (isMyRequestByUserCode(offering, userCode) &&
                        this.getWorkflowStatus(offering) === 'pending') ||
                    actionRequestIds.has(String(offering.id));
            }

            const matchesSearch = this.matchesSearchTerm(offering, term);
            const matchesStatus =
                !this.statusFilter ||
                this.getWorkflowStatus(offering) === this.statusFilter;
            const matchesType =
                !this.requestTypeFilter ||
                offering.type === this.requestTypeFilter;

            return matchesTab && matchesSearch && matchesStatus && matchesType;
        });

        if (resetPage) {
            this.pageIndex = 0;
        }
    }

    private buildActionRequests(): void {
        const userCode = getCurrentUserCode();
        this.allActionRequests = this.sortActionRequestsByLatest(
            filterGiftHospitalityOfferingActionRequests(this.allData, userCode)
        );
        this.applyActionFilters();
    }

    private applyActionFilters(): void {
        const term = (this.searchTerm || '').toLowerCase().trim();

        this.actionRequests = this.allActionRequests.filter((item) => {
            const offering = item.request;
            const matchesSearch = this.matchesSearchTerm(offering, term);
            const matchesStatus =
                !this.statusFilter ||
                this.getWorkflowStatus(offering) === this.statusFilter;
            const matchesType =
                !this.requestTypeFilter ||
                offering.type === this.requestTypeFilter;

            return matchesSearch && matchesStatus && matchesType;
        });
    }

    private matchesSearchTerm(
        offering: GiftHospitalityOffering,
        term: string
    ): boolean {
        if (!term) return true;

        const requestedByName = `${offering.requestedBy?.firstName || ''} ${
            offering.requestedBy?.lastName || ''
        }`;

        return [
            offering.description,
            offering.purpose,
            offering.receiverNameAndCompany,
            offering.createBy,
            offering.updateBy,
            offering.requestedBy?.email,
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

    get visibleRows(): GiftHospitalityOffering[] {
        const start = this.pageIndex * this.pageSize;
        return this.filteredOfferings.slice(start, start + this.pageSize);
    }

    get filteredCount(): number {
        return this.currentTab === 'action'
            ? this.actionRequests.length
            : this.filteredOfferings.length;
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
                return 'All Gift / Hospitality Offering Requests';
            case 'my':
                return 'My Gift / Hospitality Offering Requests';
            case 'pending':
                return 'Pending Gift / Hospitality Offering Requests';
            case 'action':
                return 'Action Requests';
            default:
                return 'Gift / Hospitality Offering Requests';
        }
    }

    getEmptyTitle(): string {
        return this.currentTab === 'action'
            ? 'No action requests found'
            : 'No offering requests found';
    }

    getEmptyDescription(): string {
        switch (this.currentTab) {
            case 'action':
                return 'No action requests found. All requests have been processed.';
            case 'pending':
                return 'No offering requests are pending your action at the moment.';
            case 'my':
                return "You haven't created any offering requests yet.";
            case 'all':
            default:
                return 'No gift or hospitality offering requests have been created yet.';
        }
    }

    canShowCreateEmptyButton(): boolean {
        return (
            (this.currentTab === 'all' || this.currentTab === 'my') &&
            this.activeFilterCount === 0
        );
    }

    deleteOffering(id: string): void {
        const confirmation = this.fuseConfirmationService.open({
            title: 'Delete Offering',
            message:
                'Are you sure you want to delete this offering request? This action cannot be undone.',
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
                this.offeringService
                    .remove(id)
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe({
                        next: () => {
                            this.loadOfferings();
                            this.showAlert(
                                'success',
                                'Offering deleted successfully.'
                            );
                        },
                        error: (error) => {
                            console.error('Error deleting offering:', error);
                            this.isLoading = false;
                            this.showAlert('error', 'Error deleting offering.');
                        },
                    });
            });
    }

    canEdit(offering: GiftHospitalityOffering): boolean {
        return this.getWorkflowStatus(offering) === 'pending';
    }

    canDelete(offering: GiftHospitalityOffering): boolean {
        return this.getWorkflowStatus(offering) === 'pending';
    }

    canShowMoreActions(offering: GiftHospitalityOffering): boolean {
        return (
            (this.canEdit(offering) &&
                this.navigationPermissionService.hasEditPermissionByNavId(
                    this.permissionNavId
                )) ||
            (this.canDelete(offering) &&
                this.navigationPermissionService.hasDeletePermissionByNavId(
                    this.permissionNavId
                ))
        );
    }

    getRequestTypeText(type: string | null | undefined): string {
        return type === 'Gift' ? 'Gift' : 'Hospitality';
    }

    formatCurrency(
        value: number | null | undefined,
        currencyCode: string | null | undefined = 'THB'
    ): string {
        return new Intl.NumberFormat('th-TH', {
            style: 'currency',
            currency: currencyCode || 'THB',
        }).format(Number(value || 0));
    }

    formatDate(dateString: string | null | undefined): string {
        return formatDateTimeDisplay(dateString);
    }

    getDescription(offering: GiftHospitalityOffering): string {
        return offering.description || '-';
    }

    getReceiver(offering: GiftHospitalityOffering): string {
        return offering.receiverNameAndCompany || '-';
    }

    getRequester(offering: GiftHospitalityOffering): string {
        const firstName = offering.requestedBy?.firstName || '';
        const lastName = offering.requestedBy?.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim();
        return fullName || offering.createBy || '-';
    }

    getActionTypeText(actionType: string): string {
        switch (actionType) {
            case 'verified_by_status':
                return 'Verified By';
            case 'acknowledged_by_status':
                return 'Acknowledged By';
            case 'approved_by_status':
                return 'Approved By';
            case 'approved_by_2_status':
                return 'Approved By 2';
            case 'ims_acknowledged_by_status':
                return 'ACSL Acknowledge';
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
        offering: GiftHospitalityOffering
    ): 'pending' | 'reject' | 'approve' {
        const statuses = [
            offering.verifiedByStatus,
            offering.acknowledgedByStatus,
            offering.approvedByStatus,
            offering.imsAcknowledgedByStatus,
        ];

        if (offering.approvedBy2 || offering.approvedBy2Status) {
            statuses.push(offering.approvedBy2Status);
        }

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

    private sortOfferingsByLatest(
        items: GiftHospitalityOffering[]
    ): GiftHospitalityOffering[] {
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

    private getLatestTimestamp(offering: GiftHospitalityOffering): number {
        const dateValue =
            offering.updatedAt || offering.createdAt || offering.proposedDate;
        const timestamp = dateValue ? new Date(dateValue).getTime() : 0;
        if (!Number.isNaN(timestamp)) {
            return timestamp;
        }

        const id = Number(offering.id);
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
        this.loadOfferings();
    }
}
