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
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';
import {
    SupplierAssessmentService,
    SupplierAssessmentsPageRequest,
} from 'app/core/services/supplier-assessment.service';
import {
    filterSupplierAssessmentActionRequests,
    getCurrentUserCode,
    isMyRequestByUserCode,
    isPending,
    isSupplierAssessmentPending,
} from 'app/core/utils/action-request-filter.util';
import { formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

interface ActionRequestItem {
    id: string;
    request: SupplierAssessmentListItem;
    actionType: 'approved_by_status' | 'acknowledged_by_status';
    currentStatus: string | null;
}

type SupplierAssessmentListTab = 'all' | 'my' | 'pending' | 'action';

export interface SupplierAssessmentListItem {
    id: string;
    supplierName: string;
    assessmentDate: string;
    totalScore: number;
    status: 'pending' | 'reject' | 'approve';

    assessedBy?: string | null;
    assessedByName?: string | null;
    assessedByDate?: string | null;
    assessedByStatus?: 'pending' | 'reject' | 'approve' | null;

    approvedBy?: string | null;
    approvedByName?: string | null;
    approvedByDate?: string | null;
    approvedByStatus?: 'pending' | 'reject' | 'approve' | null;

    acknowledgedBy?: string | null;
    acknowledgedByName?: string | null;
    acknowledgedByDate?: string | null;
    acknowledgedByStatus?: 'pending' | 'reject' | 'approve' | null;

    createdAt: string;
    updatedAt: string;
    createdBy?: string | null;
    createdByName?: string | null;
    projectType?: string;
}

@Component({
    selector: 'app-supplier-assessment-list',
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
        PurchaseFormsFilterComponent,
        RouterLink,
    ],
    templateUrl: './supplier-assessment-list.component.html',
    styleUrls: ['./supplier-assessment-list.component.scss'],
})
export class SupplierAssessmentListComponent implements OnInit, OnDestroy {
    listSort: ListSortEvent = { column: 0, dir: 'desc' };
    private _unsubscribeAll: Subject<any> = new Subject<any>();
    readonly navigationPermissionService = inject(NavigationPermissionService);
    readonly permissionNavId = 'supplier-assessment';

    displayedColumns: string[] = [
        'supplierName',
        'assessmentDate',
        'totalScore',
        'assessedBy',
        'createdAt',
        'status',
        'actions',
    ];

    actionDisplayedColumns: string[] = [
        'supplierName',
        'assessmentDate',
        'totalScore',
        'assessedBy',
        'actionStep',
        'status',
        'action',
    ];

    private allData: SupplierAssessmentListItem[] = [];
    private allActionRequests: ActionRequestItem[] = [];
    filteredDataSource: SupplierAssessmentListItem[] = [];
    actionRequests: ActionRequestItem[] = [];

    isLoading = false;
    alert: { type: FuseAlertType; message: string } | null = null;

    searchTerm = '';
    statusFilter = '';
    projectTypeFilter = '';

    currentTab: SupplierAssessmentListTab = 'all';
    viewMode: 'card' | 'table' = 'table';
    showFilterPanel = false;

    pageIndex = 0;
    pageSize = 10;
    totalRecords = 0;

    filterConfig: PurchaseFormsFilterConfig = {
        searchLabel: 'Search Supplier Assessment',
        searchPlaceholder: 'Search by supplier, assessor, or creator...',
        statusFilterLabel: 'Filter by Status',
        statusOptions: [
            { value: 'pending', label: 'Pending' },
            { value: 'reject', label: 'Rejected' },
            { value: 'approve', label: 'Approved' },
        ],
        statusLabelFn: (value: string) => this.getStatusLabel(value),
        thirdFilterLabel: '',
        thirdFilterOptions: [],
        showThirdFilter: false,
    };

    constructor(
        private router: Router,
        private supplierAssessmentService: SupplierAssessmentService,
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
        this.loadAssessments();
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    loadAssessments(): void {
        this.isLoading = true;
        this.alert = null;

        const request: SupplierAssessmentsPageRequest = {
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
                { data: 'assessed_by' },
                { data: 'assessed_by_status' },
                { data: 'approved_by' },
                { data: 'approved_by_status' },
                { data: 'acknowledged_by' },
                { data: 'acknowledged_by_status' },
            ],
            order: [this.listSort],
            start: 0,
            length: 1000,
            search: {
                value: '',
                regex: false,
            },
        };

        this.supplierAssessmentService
            .findAllPaginated(request)
            .pipe(
                catchError((err) => {
                    this.alert = {
                        type: 'error',
                        message:
                            err?.error?.message ||
                            'Failed to load supplier assessments. Please try again.',
                    };
                    return of([]);
                }),
                finalize(() => (this.isLoading = false)),
                takeUntil(this._unsubscribeAll)
            )
            .subscribe((items: any[]) => {
                this.allData = (items || []).map((item) =>
                    this.mapAssessment(item)
                );

                this.buildActionRequests();
                this.onFilterChange(false);
            });
    }

    private mapAssessment(item: any): SupplierAssessmentListItem {
        const mapped: SupplierAssessmentListItem = {
            id: String(item.id ?? ''),
            supplierName:
                item.companyName ??
                item.supplierName ??
                item.company_name ??
                '-',
            assessmentDate: this.safeDateISO(
                item.assessedDate ??
                    item.assessmentDate ??
                    item.assessed_date ??
                    item.assessment_date
            ),
            totalScore: Number(item.totalScore ?? item.total_score ?? 0),
            status: 'pending',
            assessedBy: item.assessedBy ?? item.assessed_by ?? null,
            assessedByName: this.normalizeEmployeeName(
                item.assessedByName ?? item.assessed_by_name
            ),
            assessedByDate: this.safeDateISO(
                item.assessedByDate ?? item.assessed_by_date
            ),
            assessedByStatus: this.safeWorkflowStatus(
                item.assessedByStatus ?? item.assessed_by_status
            ),
            approvedBy: item.approvedBy ?? item.approved_by ?? null,
            approvedByName: this.normalizeEmployeeName(
                item.approvedByName ?? item.approved_by_name
            ),
            approvedByDate: this.safeDateISO(
                item.approvedByDate ?? item.approved_by_date
            ),
            approvedByStatus: this.safeWorkflowStatus(
                item.approvedByStatus ?? item.approved_by_status
            ),
            acknowledgedBy: item.acknowledgedBy ?? item.acknowledged_by ?? null,
            acknowledgedByName: this.normalizeEmployeeName(
                item.acknowledgedByName ?? item.acknowledged_by_name
            ),
            acknowledgedByDate: this.safeDateISO(
                item.acknowledgedByDate ?? item.acknowledged_by_date
            ),
            acknowledgedByStatus: this.safeWorkflowStatus(
                item.acknowledgedByStatus ?? item.acknowledged_by_status
            ),
            createdAt: this.safeDateISO(item.createdAt ?? item.created_at),
            updatedAt: this.safeDateISO(item.updatedAt ?? item.updated_at),
            createdBy:
                item.createBy ??
                item.createdBy ??
                item.create_by ??
                item.created_by ??
                null,
            createdByName: this.normalizeEmployeeName(
                item.createByName ??
                    item.createdByName ??
                    item.create_by_name ??
                    item.created_by_name
            ),
            projectType: item.projectType ?? item.project_type ?? '',
        };

        mapped.status = this.deriveStatus(mapped);
        return mapped;
    }

    onPageChange(event: PageEvent): void {
        this.pageIndex = event.pageIndex;
        this.pageSize = event.pageSize;
    }

    onTabChange(tab: SupplierAssessmentListTab): void {
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

        const isMine = (item: SupplierAssessmentListItem): boolean =>
            isMyRequestByUserCode(item, userCode);

        const hasMyPendingStep = (
            item: SupplierAssessmentListItem
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
                    (isMine(item) && isSupplierAssessmentPending(item)) ||
                    hasMyPendingStep(item);
            }

            const matchesSearch =
                !term ||
                (item.supplierName || '').toLowerCase().includes(term) ||
                this.getAssessedByLabel(item)
                    .toLowerCase()
                    .includes(term) ||
                this.getCreatedByLabel(item)
                    .toLowerCase()
                    .includes(term);

            const matchesStatus =
                !this.statusFilter || item.status === this.statusFilter;

            return matchesTab && matchesSearch && matchesStatus;
        });

        if (resetPage) {
            this.pageIndex = 0;
        }
    }

    private buildActionRequests(): void {
        const userCode = getCurrentUserCode();
        this.allActionRequests = filterSupplierAssessmentActionRequests(
            this.allData as any[],
            userCode
        )
            .map((actionRequest) => {
                const request = this.allData.find(
                    (item) => item.id === actionRequest.id
                );
                if (!request) return null;
                return {
                    id: actionRequest.id,
                    request,
                    actionType: actionRequest.actionType,
                    currentStatus: actionRequest.currentStatus,
                } as ActionRequestItem;
            })
            .filter((item): item is ActionRequestItem => !!item);
        this.applyActionFilters();
    }

    private applyActionFilters(): void {
        const term = (this.searchTerm || '').toLowerCase().trim();
        this.actionRequests = this.allActionRequests.filter((item) => {
            const request = item.request;
            const matchesSearch =
                !term ||
                (request.supplierName || '').toLowerCase().includes(term) ||
                this.getAssessedByLabel(request)
                    .toLowerCase()
                    .includes(term);

            const matchesStatus =
                !this.statusFilter || request.status === this.statusFilter;

            return matchesSearch && matchesStatus;
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

    get visibleRows(): SupplierAssessmentListItem[] {
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
                return 'All Supplier Assessments';
            case 'my':
                return 'My Supplier Assessments';
            case 'pending':
                return 'Pending Supplier Assessments';
            case 'action':
                return 'Action Requests';
            default:
                return 'Supplier Assessments';
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
                return 'No supplier assessments have been created yet.';
        }
    }

    canShowCreateEmptyButton(): boolean {
        return (
            (this.currentTab === 'all' || this.currentTab === 'my') &&
            this.activeFilterCount === 0
        );
    }

    getAssessedByLabel(item: SupplierAssessmentListItem): string {
        return (
            item.assessedByName ||
            this.formatEmployeeReference(item.assessedBy, 'N/A')
        );
    }

    getCreatedByLabel(item: SupplierAssessmentListItem): string {
        return (
            item.createdByName ||
            this.formatEmployeeReference(item.createdBy, 'N/A')
        );
    }

    getEmployeeLabel(ref: string | number | null | undefined): string {
        return this.formatEmployeeReference(ref, 'N/A');
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

    getWorkflowStatusBadgeClass(status: string): string {
        switch (status) {
            case 'approve':
                return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'reject':
                return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
            default:
                return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
        }
    }

    getScoreText(item: SupplierAssessmentListItem): string {
        return `${item.totalScore ?? 0}/100`;
    }

    onCreateNew(): void {
        this.router.navigate(['/supplier-assessment/new']);
    }

    onView(id: string): void {
        this.router.navigate(['/supplier-assessment/view', id]);
    }

    onEdit(id: string): void {
        this.router.navigate(['/supplier-assessment/edit', id]);
    }

    onDelete(id: string): void {
        const confirmation = this.fuseConfirmationService.open({
            title: 'Delete',
            message: 'Are you sure you want to delete this assessment?',
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
                this.supplierAssessmentService
                    .remove(parseInt(id, 10))
                    .subscribe({
                        next: () => {
                            this.showAlert(
                                'success',
                                'Assessment deleted successfully!'
                            );
                            this.loadAssessments();
                        },
                        error: (error) => {
                            console.error('Error deleting assessment:', error);
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

    showAlert(type: FuseAlertType, message: string): void {
        this.alert = { type, message };
        setTimeout(() => (this.alert = null), 5000);
    }

    formatDate(dateString: string | Date | null | undefined): string {
        return formatDateTimeDisplay(dateString);
    }

    private safeDateISO(input: unknown): string {
        if (!input) return '';
        const d = input instanceof Date ? input : new Date(String(input));
        if (isNaN(d.getTime())) return '';
        return d.toISOString();
    }

    private safeWorkflowStatus(
        input: unknown
    ): 'pending' | 'reject' | 'approve' | null {
        if (input === null || input === undefined || input === '') return null;
        const s = String(input).toLowerCase();
        if (s === 'pending') return 'pending';
        if (s === 'reject' || s === 'rejected') return 'reject';
        if (s === 'approve' || s === 'approved') return 'approve';
        return null;
    }

    private normalizeEmployeeName(input: unknown): string | null {
        if (input === null || input === undefined) return null;
        const value = String(input).trim();
        return value && value !== '-' && value.toLowerCase() !== 'null'
            ? value
            : null;
    }

    private formatEmployeeReference(
        ref: string | number | null | undefined,
        fallback: string
    ): string {
        if (ref === null || ref === undefined) return fallback;
        const value = String(ref).trim();
        return value || fallback;
    }

    private deriveStatus(
        item: SupplierAssessmentListItem
    ): 'pending' | 'reject' | 'approve' {
        const statuses = [item.approvedByStatus, item.acknowledgedByStatus];
        if (statuses.some((status) => status === 'reject')) return 'reject';
        if (statuses.every((status) => status === 'approve')) return 'approve';
        return 'pending';
    }

    canEdit(item: SupplierAssessmentListItem): boolean {
        return this.deriveStatus(item) === 'pending';
    }

    canDelete(item: SupplierAssessmentListItem): boolean {
        return this.deriveStatus(item) === 'pending';
    }

    canShowMoreActions(item: SupplierAssessmentListItem): boolean {
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
        this.loadAssessments();
    }
}
