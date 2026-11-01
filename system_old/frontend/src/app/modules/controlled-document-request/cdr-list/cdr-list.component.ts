import { CommonModule } from '@angular/common';
import {
    Component,
    HostListener,
    inject,
    OnDestroy,
    OnInit,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { Router, RouterLink } from '@angular/router';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import {
    PurchaseFormsFilterComponent,
    PurchaseFormsFilterConfig,
    PurchaseFormsFilterValues,
} from 'app/core/components/purchase-forms-filter';
import {
    ControlledDocumentRequestListItem,
    ControlledDocumentRequestService,
    ControlledDocumentRequestsPageRequest,
} from 'app/core/services/controlled-document-request.service';
import { EmployeeService } from 'app/core/services/employee.service';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';
import {
    filterControlledDocumentRequestActionRequests,
    getCurrentUserCode,
    isApproved,
    isControlledDocumentRequestPending,
    isMyRequestByUserCode,
    isRejected,
} from 'app/core/utils/action-request-filter.util';
import {
    formatDateDisplay,
    formatDateTimeDisplay,
} from 'app/core/utils/date-format.util';
import { of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

// ⭐ เพิ่ม import paginator
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

interface ActionRequestItem {
    id: string;
    request: ControlledDocumentRequestListItem;
    actionType:
        | 'reviewed_by_status'
        | 'approved_by_status'
        | 'acknowledged_by_status'
        | 'acknowledged_by_status_2';
    currentStatus: string | null;
}

@Component({
    selector: 'app-cdr-list',
    standalone: true,
    imports: [
        ListTableSortModule,
        CommonModule,
        RouterLink,
        MatButtonModule,
        MatIconModule,
        MatTabsModule,
        MatProgressSpinnerModule,
        MatTableModule,
        MatMenuModule,
        FuseAlertComponent,
        MatPaginatorModule,
        PurchaseFormsFilterComponent,
    ],
    templateUrl: './cdr-list.component.html',
    styleUrls: ['./cdr-list.component.scss'],
})
export class CdrListComponent implements OnInit, OnDestroy {
    listSort: ListSortEvent = { column: 0, dir: 'desc' };
    private _unsubscribeAll: Subject<any> = new Subject<any>();
    readonly navigationPermissionService = inject(NavigationPermissionService);
    readonly permissionNavId = 'controlled-document-request-change';

    displayedColumns: string[] = [
        'cdrNo',
        'createdAt',
        'documentName',
        'requestedBy',
        'requestedDate',
        'status',
        'actions',
    ];

    actionDisplayedColumns: string[] = [
        'cdrNo',
        'documentName',
        'requestedBy',
        'requestedDate',
        'actionStep',
        'status',
        'action',
    ];

    allData: ControlledDocumentRequestListItem[] = [];
    dataSource: ControlledDocumentRequestListItem[] = [];
    filteredDataSource: ControlledDocumentRequestListItem[] = [];
    private allActionRequests: ActionRequestItem[] = [];
    actionRequests: ActionRequestItem[] = [];
    isLoading = false;
    alert: { type: FuseAlertType; message: string } | null = null;

    // Filters
    searchTerm = '';
    statusFilter = '';

    filterConfig: PurchaseFormsFilterConfig = {
        searchLabel: 'Search Controlled Document Requests',
        searchPlaceholder: 'Search by CDR No., Document Name, or Requester...',
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

    // Tab: 'all' | 'my' | 'pending' | 'action'
    currentTab: 'all' | 'my' | 'pending' | 'action' = 'all';
    viewMode: 'card' | 'table' = 'table';
    showFilterPanel = false;

    // ⭐ state ของ paginator
    totalRecords = 0; // จำนวนรายการทั้งหมด
    pageSize = 10; // จำนวนต่อหน้าเริ่มต้น
    pageIndex = 0; // หน้าเริ่มต้น (0 = หน้าแรก)
    employeeLookup = new Map<string, string>();
    actionRequestTotal = 0;

    get actionRequestCount(): number {
        return this.actionRequestTotal;
    }

    constructor(
        private router: Router,
        private cdrService: ControlledDocumentRequestService,
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
        this.loadActionRequestCount();
        this.loadRequests();
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

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
        this.closeFilterPanel();
        // ⭐ เวลาเปลี่ยนแท็บ ให้กลับไปหน้าแรกเสมอ
        this.pageIndex = 0;
        this.loadRequests();
    }

    onPageChange(event: PageEvent): void {
        this.pageIndex = event.pageIndex;
        this.pageSize = event.pageSize;

        if (this.currentTab === 'all') {
            this.loadRequests(); // โหลดข้อมูลหน้าใหม่
            return;
        }

        this.onFilterChange();
    }

    getEmployeeLabel(ref: string | number | null | undefined): string {
        return this.employeeService.formatEmployeeReference(
            ref,
            this.employeeLookup,
            'N/A'
        );
    }

    loadRequests(): void {
        this.isLoading = true;
        this.alert = null;

        if (this.currentTab !== 'action') {
            this.loadActionRequestCount();
        }

        if (this.currentTab === 'action') {
            // ใช้ POST /api/controlled_document_requests_page สำหรับ Action Request
            const request: ControlledDocumentRequestsPageRequest = {
                draw: 1,
                type: 'deposit',
                columns: [
                    { data: 'No' },
                    { data: 'cdr_no' },
                    { data: 'document_name' },
                    { data: 'requested_by' },
                    { data: 'requested_date' },
                    { data: 'status' },
                    { data: 'reviewed_by' },
                    { data: 'reviewed_by_status' },
                    { data: 'approved_by' },
                    { data: 'approved_by_status' },
                    { data: 'acknowledged_by' },
                    { data: 'acknowledged_by_status' },
                    { data: 'acknowledged_by_status_2' },
                ],
                order: [this.listSort],
                start: 0,
                length: 100, // Load more for filtering (ยังไม่ paginate ตรงนี้)
                search: { value: this.searchTerm.trim(), regex: false },
            };

            this.cdrService
                .findAllPaginated(request)
                .pipe(
                    catchError((err) => {
                        this.alert = {
                            type: 'error',
                            message:
                                err?.error?.message ||
                                'Failed to load controlled document requests. Please try again.',
                        };
                        return of({
                            data: [],
                            currentPage: 1,
                            total: 0,
                        } as any);
                    }),
                    finalize(() => (this.isLoading = false))
                )
                .subscribe((response) => {
                    const responseData = response.data || [];
                    this.allData = responseData;

                    // Resolve employee names
                    this.resolveEmployees(responseData);

                    this.buildActionRequests();
                    this.dataSource = [];
                    this.filteredDataSource = [];
                    this.totalRecords = this.actionRequests.length;
                    // ⭐ ถ้าอยากใส่ paginator สำหรับ action tab ค่อยมาเพิ่มภายหลัง
                });
        } else if (this.currentTab === 'all') {
            // ใช้ POST /api/controlled_document_requests_page สำหรับ All Requests
            const request: ControlledDocumentRequestsPageRequest = {
                draw: 1,
                type: 'deposit',
                columns: [
                    { data: 'No' },
                    { data: 'cdr_no' },
                    { data: 'document_name' },
                    { data: 'requested_by' },
                    { data: 'requested_date' },
                    { data: 'status' },
                    { data: 'reviewed_by' },
                    { data: 'reviewed_by_status' },
                    { data: 'approved_by' },
                    { data: 'approved_by_status' },
                    { data: 'acknowledged_by' },
                    { data: 'acknowledged_by_status' },
                    { data: 'acknowledged_by_status_2' },
                ],
                order: [this.listSort],
                // ⭐ ใช้ pageIndex + pageSize จาก paginator
                start: this.pageIndex * this.pageSize,
                length: this.pageSize,
                search: { value: this.searchTerm.trim(), regex: false },
            };

            this.cdrService
                .findAllPaginated(request)
                .pipe(
                    catchError((err) => {
                        this.alert = {
                            type: 'error',
                            message:
                                err?.error?.message ||
                                'Failed to load controlled document requests. Please try again.',
                        };
                        return of({
                            data: [],
                            currentPage: 1,
                            total: 0,
                        } as any);
                    }),
                    finalize(() => (this.isLoading = false))
                )
                .subscribe((response) => {
                    const responseData = response.data || [];
                    this.allData = responseData;

                    // Resolve employee names
                    this.resolveEmployees(responseData);

                    this.dataSource = [...this.allData];
                    this.totalRecords =
                        response.total ||
                        response.recordsTotal ||
                        this.allData.length;
                    this.onFilterChange();
                });
        } else {
            // สำหรับ My Requests และ Pending My Action ใช้ findAllPaginated แล้ว filter ที่ frontend
            const request: ControlledDocumentRequestsPageRequest = {
                draw: 1,
                type: 'deposit',
                columns: [
                    { data: 'No' },
                    { data: 'cdr_no' },
                    { data: 'document_name' },
                    { data: 'requested_by' },
                    { data: 'requested_date' },
                    { data: 'status' },
                    { data: 'reviewed_by' },
                    { data: 'reviewed_by_status' },
                    { data: 'approved_by' },
                    { data: 'approved_by_status' },
                    { data: 'acknowledged_by' },
                    { data: 'acknowledged_by_status' },
                    { data: 'acknowledged_by_status_2' },
                ],
                order: [this.listSort],
                start: 0,
                length: 1000, // ดึงข้อมูลเยอะเพื่อ filter
                search: { value: '', regex: false },
            };

            this.cdrService
                .findAllPaginated(request)
                .pipe(
                    catchError((err) => {
                        this.alert = {
                            type: 'error',
                            message:
                                err?.error?.message ||
                                'Failed to load controlled document requests. Please try again.',
                        };
                        return of({
                            data: [],
                            currentPage: 1,
                            total: 0,
                        } as any);
                    }),
                    finalize(() => (this.isLoading = false))
                )
                .subscribe((response) => {
                    const responseData = response.data || [];
                    // Filter ตาม tab
                    if (this.currentTab === 'my') {
                        const userCode = getCurrentUserCode();
                        // แสดงทุก request ที่มี code ของ user ปัจจุบันอยู่ในข้อมูล (ไม่สนว่าฟิลด์ไหน)
                        this.allData = responseData.filter((item: any) =>
                            isMyRequestByUserCode(item, userCode)
                        );
                    } else if (this.currentTab === 'pending') {
                        // แสดงเฉพาะที่ยังไม่ approve ครบทุกขั้นใน workflow (ไม่กรองด้วย user code)
                        this.allData = responseData.filter((item: any) =>
                            isControlledDocumentRequestPending(item)
                        );
                    } else {
                        this.allData = responseData;
                    }

                    // Resolve employee names
                    this.resolveEmployees(responseData);

                    this.dataSource = [...this.allData];
                    this.onFilterChange();
                });
        }
    }

    private buildActionRequests(): void {
        // Get current user code from localStorage
        const userCode = getCurrentUserCode();

        // Filter action requests using utility function
        // This filters by user code AND workflow sequence
        this.allActionRequests = filterControlledDocumentRequestActionRequests(
            this.allData,
            userCode
        );
        this.actionRequestTotal = this.allActionRequests.length;
        this.applyActionFilters();
    }

    private loadActionRequestCount(): void {
        const request: ControlledDocumentRequestsPageRequest = {
            draw: 1,
            type: 'deposit',
            columns: [
                { data: 'No' },
                { data: 'cdr_no' },
                { data: 'document_name' },
                { data: 'requested_by' },
                { data: 'requested_date' },
                { data: 'status' },
                { data: 'reviewed_by' },
                { data: 'reviewed_by_status' },
                { data: 'approved_by' },
                { data: 'approved_by_status' },
                { data: 'acknowledged_by' },
                { data: 'acknowledged_by_status' },
                { data: 'acknowledged_by_status_2' },
            ],
            order: [this.listSort],
            start: 0,
            length: 1000,
            search: { value: '', regex: false },
        };

        this.cdrService.findAllPaginated(request).subscribe({
            next: (response) => {
                const userCode = getCurrentUserCode();
                const items = response.data ?? [];
                this.resolveEmployees(items);
                const actionRequests =
                    filterControlledDocumentRequestActionRequests(
                        this.sortRequestsByLatestId(items),
                        userCode
                    );
                this.actionRequestTotal = actionRequests.length;

                if (this.currentTab !== 'action') {
                    this.allActionRequests = actionRequests;
                    this.actionRequests = actionRequests;
                }
            },
            error: (error) => {
                console.error('Error loading action request count:', error);
            },
        });
    }

    private resolveEmployees(items: ControlledDocumentRequestListItem[]): void {
        const employeeCodes = new Set<string>();
        items.forEach((item) => {
            if (item.requestedBy) employeeCodes.add(item.requestedBy);
            if (item.reviewedBy) employeeCodes.add(item.reviewedBy);
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

    onFilterChange(): void {
        if (this.currentTab === 'action') {
            this.applyActionFilters();
            return;
        }

        const filtered = this.dataSource.filter(
            (item) => this.matchesSearch(item) && this.matchesStatus(item)
        );

        if (this.currentTab === 'all') {
            this.filteredDataSource = filtered;
            return;
        }

        this.totalRecords = filtered.length;
        this.filteredDataSource = this.paginateRequests(filtered);
    }

    private applyActionFilters(): void {
        this.actionRequests = this.allActionRequests.filter(
            (item) =>
                this.matchesSearch(item.request) &&
                this.matchesStatus(item.request)
        );
    }

    private matchesSearch(item: ControlledDocumentRequestListItem): boolean {
        const term = this.searchTerm.trim().toLowerCase();
        if (!term) {
            return true;
        }

        return [
            item.cdrNo,
            item.documentName,
            item.requestedBy,
            this.getEmployeeLabel(item.requestedBy),
            item.requestedDate,
            this.formatDate(item.requestedDate),
            this.formatDateTime(item.requestedDate),
        ].some((value) =>
            String(value ?? '')
                .toLowerCase()
                .includes(term)
        );
    }

    private matchesStatus(item: ControlledDocumentRequestListItem): boolean {
        return (
            !this.statusFilter ||
            this.getWorkflowStatus(item) === this.statusFilter
        );
    }

    get visibleRows(): ControlledDocumentRequestListItem[] {
        return this.filteredDataSource;
    }

    get filteredCount(): number {
        return this.currentTab === 'action'
            ? this.actionRequests.length
            : this.filteredDataSource.length;
    }

    get activeFilterCount(): number {
        return [this.searchTerm, this.statusFilter].filter((value) => !!value)
            .length;
    }

    applyFilters(filters: PurchaseFormsFilterValues): void {
        this.searchTerm = filters.searchTerm || '';
        this.statusFilter = filters.statusFilter || '';
        this.pageIndex = 0;
        this.closeFilterPanel();
        this.loadRequests();
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
                return 'All Controlled Document Requests';
            case 'my':
                return 'My Controlled Document Requests';
            case 'pending':
                return 'Pending Controlled Document Requests';
            case 'action':
                return 'Action Requests';
            default:
                return 'Controlled Document Requests';
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
                return 'No controlled document requests have been created yet.';
        }
    }

    canShowCreateEmptyButton(): boolean {
        return (
            (this.currentTab === 'all' || this.currentTab === 'my') &&
            this.activeFilterCount === 0
        );
    }

    canShowMoreActions(request: ControlledDocumentRequestListItem): boolean {
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

    private paginateRequests(
        items: ControlledDocumentRequestListItem[]
    ): ControlledDocumentRequestListItem[] {
        const start = this.pageIndex * this.pageSize;
        return items.slice(start, start + this.pageSize);
    }

    private sortRequestsByLatestId(
        items: ControlledDocumentRequestListItem[]
    ): ControlledDocumentRequestListItem[] {
        return [...items].sort(
            (a, b) => this.toSortableId(b.id) - this.toSortableId(a.id)
        );
    }

    private toSortableId(id: string | number | null | undefined): number {
        if (id === null || id === undefined) {
            return -1;
        }

        const parsed = Number(id);
        if (!Number.isNaN(parsed)) {
            return parsed;
        }

        const digits = String(id).match(/\d+/g)?.join('') ?? '';
        const fallback = Number(digits);
        return Number.isNaN(fallback) ? -1 : fallback;
    }

    create(): void {
        this.router.navigate(['/controlled-document-request/new']);
    }

    onCreateNew(): void {
        this.create();
    }

    view(id: string): void {
        this.router.navigate(['/controlled-document-request/view', id]);
    }

    onView(id: string): void {
        this.view(id);
    }

    edit(id: string): void {
        this.router.navigate(['/controlled-document-request/edit', id]);
    }

    onEdit(id: string): void {
        this.edit(id);
    }

    onDelete(id: string): void {
        const confirmation = this.fuseConfirmationService.open({
            title: 'Delete',
            message: 'Are you sure you want to delete this request?',
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
                this.cdrService.remove(id).subscribe({
                    next: () => {
                        // ลบออกจาก list ปัจจุบัน
                        this.allData = this.allData.filter((r) => r.id !== id);
                        this.dataSource = [...this.allData];
                        this.onFilterChange();

                        // ถ้าอยู่แท็บ Action ก็ rebuild actionRequests
                        if (this.currentTab === 'action') {
                            this.buildActionRequests();
                        }

                        this.showAlert(
                            'success',
                            'Request deleted successfully!'
                        );
                    },
                    error: (error) => {
                        console.error('Error deleting request:', error);
                        this.showAlert(
                            'error',
                            error?.error?.message ||
                                'Failed to delete request. Please try again.'
                        );
                    },
                });
            }
        });
    }

    canEdit(request: ControlledDocumentRequestListItem): boolean {
        return this.getWorkflowStatus(request) === 'pending';
    }

    canDelete(request: ControlledDocumentRequestListItem): boolean {
        return this.getWorkflowStatus(request) === 'pending';
    }

    showAlert(type: FuseAlertType, message: string): void {
        this.alert = { type, message };
        setTimeout(() => {
            this.alert = null;
        }, 5000);
    }

    formatDate(dateString: string | null | undefined): string {
        return formatDateDisplay(dateString);
    }

    formatDateTime(dateString: string | null | undefined): string {
        return formatDateTimeDisplay(dateString);
    }

    getWorkflowStatus(item: any): 'pending' | 'reject' | 'approve' {
        const backendStatus = this.normalizeStatusValue(item?.status);
        if (backendStatus === 'reject' || backendStatus === 'rejected') {
            return 'reject';
        }
        if (
            backendStatus === 'actioned' ||
            backendStatus === 'completed' ||
            backendStatus === 'complete'
        ) {
            return 'approve';
        }

        const workflowSteps = this.getWorkflowSteps(item);
        const hasReject = workflowSteps.some((step) => isRejected(step.status));
        if (hasReject) return 'reject';

        const allApproved =
            workflowSteps.length > 0 &&
            workflowSteps.every((step) => isApproved(step.status));
        if (allApproved) return 'approve';

        return 'pending';
    }

    private getWorkflowSteps(item: any): Array<{
        assignee: string | null | undefined;
        status: string | null | undefined;
    }> {
        return [
            {
                assignee: item?.reviewedBy ?? item?.reviewed_by,
                status: item?.reviewedByStatus ?? item?.reviewed_by_status,
            },
            {
                assignee: item?.approvedBy ?? item?.approved_by,
                status: item?.approvedByStatus ?? item?.approved_by_status,
            },
            {
                assignee: item?.acknowledgedBy ?? item?.acknowledged_by,
                status:
                    item?.acknowledgedByStatus2 ??
                    item?.acknowledged_by_status_2,
            },
        ].filter(
            (step) =>
                this.hasWorkflowValue(step.assignee) ||
                this.hasWorkflowValue(step.status)
        );
    }

    private hasWorkflowValue(value: string | null | undefined): boolean {
        return (
            value !== null && value !== undefined && String(value).trim() !== ''
        );
    }

    private normalizeStatusValue(value: string | null | undefined): string {
        return String(value ?? '')
            .trim()
            .toLowerCase();
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
            case 'review':
                return 'Review';
            case 'actioned':
                return 'Actioned';
            default:
                return status;
        }
    }

    getActionTypeText(actionType: string): string {
        switch (actionType) {
            case 'reviewed_by_status':
                return 'Review';
            case 'approved_by_status':
                return 'Approve';
            case 'acknowledged_by_status_2':
                return 'Final Action';
            default:
                return actionType;
        }
    }

    getByStatusText(status: string | null | undefined): string {
        if (!status || status === 'null' || status === null) return 'Pending';
        switch (status.toLowerCase()) {
            case 'pending':
                return 'Pending';
            case 'approve':
                return 'Approved';
            case 'reject':
                return 'Rejected';
            default:
                return status;
        }
    }

    onSearchTermChange(value: string): void {
        this.searchTerm = value || '';
        this.pageIndex = 0;
        this.loadRequests();
    }

    onStatusFilterChange(value: string): void {
        this.statusFilter = value || '';
        this.pageIndex = 0;
        this.loadRequests();
    }

    clearFilters(): void {
        this.searchTerm = '';
        this.statusFilter = '';
        this.pageIndex = 0;
        this.closeFilterPanel();
        this.loadRequests();
    }
    onListSortChange(event: ListSortEvent): void {
        this.listSort = event;
        this.pageIndex = 0;
        this.loadRequests();
    }
}
