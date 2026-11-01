import { CommonModule } from '@angular/common';
import {
    Component,
    HostListener,
    OnDestroy,
    OnInit,
    ViewChild,
    inject,
} from '@angular/core';
import { Router } from '@angular/router';
import {
    formatDateDisplay,
    formatDateTimeDisplay,
} from 'app/core/utils/date-format.util';

import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import {
    MatPaginator,
    MatPaginatorModule,
    PageEvent,
} from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSort, MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

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
    getCurrentUserCode,
    isMyRequestByUserCode,
} from 'app/core/utils/action-request-filter.util';
import { Subject, takeUntil } from 'rxjs';

export interface ProjectQualityAssurancePlanListItem {
    id: number;
    No: number;
    name: string; // project_name from API
    status?: string | null;
    create_by: string | null;
    update_by: string | null;
    created_at: string;
    updated_at: string;
}

interface ActionRequestItem {
    id: number;
    request: ProjectQualityAssurancePlanListItem;
    actionType: string;
    currentStatus: string | null;
}

@Component({
    selector: 'app-project-quality-assurance-plan-list',
    standalone: true,
    imports: [
        CommonModule,
        MatTableModule,
        MatIconModule,
        MatMenuModule,
        MatProgressSpinnerModule,
        MatTooltipModule,
        MatPaginatorModule,
        MatSortModule,
        PurchaseFormsFilterComponent,
        FuseAlertComponent,
    ],
    templateUrl: './project-quality-assurance-plan-list.component.html',
    styleUrls: ['./project-quality-assurance-plan-list.component.scss'],
})
export class ProjectQualityAssurancePlanListComponent
    implements OnInit, OnDestroy
{
    private _unsubscribeAll: Subject<any> = new Subject<any>();
    readonly navigationPermissionService = inject(NavigationPermissionService);
    readonly permissionNavId = 'project-quality-assurance-plan';

    @ViewChild(MatPaginator) paginator!: MatPaginator;
    @ViewChild(MatSort) sort!: MatSort;

    /** คอลัมน์ในตารางตาม API response */
    displayedColumns: string[] = [
        'No',
        'name',
        'create_by',
        'update_by',
        'created_at',
        'updated_at',
        'action',
    ];

    /** ข้อมูลทั้งหมด (มาจาก API) */
    private allData: ProjectQualityAssurancePlanListItem[] = [];

    /** ข้อมูลหลังกรอง (ใช้แสดงในตาราง) */
    dataSource: ProjectQualityAssurancePlanListItem[] = [];
    filteredDataSource: ProjectQualityAssurancePlanListItem[] = [];
    actionRequests: ActionRequestItem[] = [];

    isLoading = false;
    alert: { type: FuseAlertType; message: string } | null = null;

    // ฟิลเตอร์ด้านบน
    searchTerm = '';
    statusFilter = '';

    // DataTables parameters
    draw = 1;
    pageIndex = 0;
    pageSize = 10;
    totalRecords = 0;
    sortColumn = 0;
    sortDirection: 'asc' | 'desc' = 'asc';
    employeeLookup = new Map<string, string>();

    currentTab: 'all' | 'my' | 'pending' | 'action' = 'all';
    viewMode: 'card' | 'table' = 'table';
    showFilterPanel = false;

    filterConfig: PurchaseFormsFilterConfig = {
        searchLabel: 'Search Plans',
        searchPlaceholder:
            'Search by project name, created by, or updated by...',
        statusFilterLabel: 'Filter by Status',
        statusOptions: [
            { value: 'draft', label: 'Draft' },
            { value: 'submitted', label: 'Submitted' },
            { value: 'approved', label: 'Approved' },
            { value: 'acknowledged', label: 'Acknowledged' },
            { value: 'rejected', label: 'Rejected' },
        ],
        statusLabelFn: (value: string) => this.getStatusLabel(value),
        showStatusFilter: false,
        showThirdFilter: false,
    };

    constructor(
        private router: Router,
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
                if (this.searchTerm) {
                    this.onFilterChange();
                }
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
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    /** เวลาเปลี่ยนแท็บ */
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
        this.pageIndex = 0;
        this.closeFilterPanel();
        this.loadData();
    }

    /** โหลดข้อมูลจาก API */
    loadData(): void {
        this.isLoading = true;

        if (this.currentTab === 'action') {
            // Action Request tab - ใช้ API page
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
                order: [{ column: 0, dir: 'asc' }],
                start: 0,
                length: 100, // Load more for filtering
                search: { value: '', regex: false },
            };

            this.apiService
                .getProjectQualityAssurancePlanPage(requestBody)
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: (response) => {
                        if (response?.status === false) {
                            this.showAlert(
                                'error',
                                response.message ||
                                    'Failed to load action requests'
                            );
                            this.actionRequests = [];
                            this.dataSource = [];
                            this.allData = [];
                            this.filteredDataSource = [];
                            this.totalRecords = 0;
                        } else {
                            const rawData = this.extractPageRows(response);
                            const normalizedData = rawData.map(
                                (item: any, index: number) =>
                                    this.normalizeListItem(item, index, 0)
                            );
                            this.ensureEmployeeLabels(normalizedData);

                            const actionData = normalizedData.filter((item) =>
                                this.isActionItem(item)
                            );
                            this.actionRequests = actionData.map((item) => ({
                                id: item.id,
                                request: item,
                                actionType: item.status || 'review',
                                currentStatus: item.status || null,
                            }));
                            this.allData = normalizedData;
                            this.dataSource = [...normalizedData];
                            this.filteredDataSource = [...actionData];
                            this.totalRecords = this.extractTotalRecords(
                                response,
                                rawData
                            );
                            this.draw = this.extractDraw(response);
                            this.onFilterChange();
                        }
                        this.isLoading = false;
                    },
                    error: (error) => {
                        console.error('Error loading action requests:', error);
                        this.showAlert(
                            'error',
                            'Failed to load action requests. Please try again.'
                        );
                        this.actionRequests = [];
                        this.isLoading = false;
                    },
                });
        } else {
            // Forms tab - ใช้ API page ปกติ
            const requestBody = {
                draw: this.draw,
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
                order: [
                    {
                        column: this.sortColumn,
                        dir: this.sortDirection,
                    },
                ],
                start: this.pageIndex * this.pageSize,
                length: this.pageSize,
                search: {
                    value: this.searchTerm,
                    regex: false,
                },
            };

            this.apiService
                .getProjectQualityAssurancePlanPage(requestBody)
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: (response) => {
                        if (response?.status === false) {
                            this.showAlert(
                                'error',
                                response.message || 'Failed to load data'
                            );
                            this.dataSource = [];
                            this.allData = [];
                            this.filteredDataSource = [];
                            this.totalRecords = 0;
                        } else {
                            const rawData = this.extractPageRows(response);
                            this.allData = rawData.map(
                                (item: any, index: number) =>
                                    this.normalizeListItem(
                                        item,
                                        index,
                                        this.pageIndex * this.pageSize
                                    )
                            );
                            this.ensureEmployeeLabels(this.allData);
                            this.dataSource = [...this.allData];
                            this.totalRecords = this.extractTotalRecords(
                                response,
                                rawData
                            );
                            this.draw = this.extractDraw(response);

                            // Apply filters
                            this.onFilterChange();
                        }
                        this.isLoading = false;
                    },
                    error: (error) => {
                        console.error('Error loading data:', error);
                        this.showAlert(
                            'error',
                            'Failed to load data. Please try again.'
                        );
                        this.dataSource = [];
                        this.allData = [];
                        this.filteredDataSource = [];
                        this.totalRecords = 0;
                        this.isLoading = false;
                    },
                });
        }
    }

    /** เรียกทุกครั้งที่เปลี่ยนค่า search */
    onFilterChange(): void {
        const term = this.searchTerm.toLowerCase().trim();
        const userCode = getCurrentUserCode();

        this.filteredDataSource = this.dataSource.filter((item) => {
            let matchesTab = true;
            if (this.currentTab === 'my') {
                matchesTab = this.isMyRequest(item, userCode);
            } else if (this.currentTab === 'pending') {
                matchesTab =
                    this.isPendingItem(item) &&
                    this.isRelatedToCurrentUser(item, userCode);
            } else if (this.currentTab === 'action') {
                matchesTab =
                    this.isActionItem(item) &&
                    this.isRelatedToCurrentUser(item, userCode);
            }

            const matchesTerm =
                !term ||
                item.name?.toLowerCase().includes(term) ||
                this.getEmployeeLabel(item.create_by)
                    .toLowerCase()
                    .includes(term) ||
                this.getEmployeeLabel(item.update_by)
                    .toLowerCase()
                    .includes(term);
            const matchesStatus =
                !this.statusFilter || item.status === this.statusFilter;

            return matchesTab && matchesTerm && matchesStatus;
        });
    }

    clearFilters(): void {
        this.searchTerm = '';
        this.statusFilter = '';
        this.pageIndex = 0;
        this.closeFilterPanel();
        this.loadData();
    }

    onSearchTermChange(value: string): void {
        this.searchTerm = value || '';
        this.pageIndex = 0;
        this.loadData();
    }

    onStatusFilterChange(value: string): void {
        this.statusFilter = value || '';
        this.pageIndex = 0;
        this.loadData();
    }

    applyFilters(filters: PurchaseFormsFilterValues): void {
        this.searchTerm = filters.searchTerm || '';
        this.statusFilter = filters.statusFilter || '';
        this.pageIndex = 0;
        this.closeFilterPanel();
        this.loadData();
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

    /** เมื่อเปลี่ยนหน้า */
    onPageChange(event: PageEvent): void {
        this.pageIndex = event.pageIndex;
        this.pageSize = event.pageSize;
        this.loadData();
    }

    /** เมื่อมีการเรียงลำดับ */
    onSortChange(sort: Sort): void {
        // Map Material table column names to API column indices
        const columnMap: { [key: string]: number } = {
            No: 0,
            name: 1,
            create_by: 2,
            update_by: 3,
            created_at: 4,
            updated_at: 5,
        };

        this.sortColumn = columnMap[sort.active] || 0;
        this.sortDirection = sort.direction === 'asc' ? 'asc' : 'desc';
        this.loadData();
    }

    // ---------- Navigation ----------
    onCreateNew(): void {
        this.router.navigate(['/project-quality-assurance-plan/new']);
    }

    onView(id: number): void {
        this.router.navigate([
            '/project-quality-assurance-plan/view',
            id.toString(),
        ]);
    }

    /** ใช้กับปุ่ม Edit ในแท็บ Forms */
    onEdit(id: number): void {
        this.router.navigate([
            '/project-quality-assurance-plan/edit',
            id.toString(),
        ]);
    }

    /** ใช้กับปุ่ม Review ในแท็บ Action Requests */
    onReview(id: number, actionType?: string): void {
        if (actionType) {
            this.router.navigate([
                '/project-quality-assurance-plan/review',
                id.toString(),
                actionType,
            ]);
        } else {
            // Fallback to review if no action type
            this.router.navigate([
                '/project-quality-assurance-plan/review',
                id.toString(),
            ]);
        }
    }

    onDelete(id: number): void {
        const confirmation = this.fuseConfirmationService.open({
            title: 'Delete',
            message: 'Are you sure you want to delete this plan?',
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
                this.isLoading = true;
                this.apiService
                    .deleteProjectQualityAssurancePlan(id)
                    .subscribe({
                        next: (response) => {
                            this.isLoading = false;
                            if (response.status) {
                                this.showAlert(
                                    'success',
                                    response.message ||
                                        'Plan deleted successfully!'
                                );
                                // โหลดข้อมูลใหม่ให้ทั้งตาราง/แท็บอัปเดต
                                this.loadData();
                            } else {
                                this.showAlert(
                                    'error',
                                    response.message || 'Failed to delete plan.'
                                );
                            }
                        },
                        error: (error) => {
                            console.error('Error deleting plan:', error);
                            this.isLoading = false;
                            this.showAlert(
                                'error',
                                error.error?.message ||
                                    'Failed to delete plan. Please try again.'
                            );
                        },
                    });
            }
        });
    }

    // ---------- UI helpers ----------
    formatDate(date: Date | string | null | undefined): string {
        return formatDateDisplay(date);
    }

    formatDateTime(date: Date | string | null | undefined): string {
        return formatDateTimeDisplay(date);
    }

    getEmployeeLabel(ref: string | number | null | undefined): string {
        return this.employeeService.formatEmployeeReference(
            ref,
            this.employeeLookup,
            '-'
        );
    }

    getStatusLabel(status: string | null | undefined): string {
        switch (status) {
            case 'draft':
                return 'Draft';
            case 'submitted':
                return 'Submitted';
            case 'approved':
                return 'Approved';
            case 'acknowledged':
                return 'Acknowledged';
            case 'rejected':
                return 'Rejected';
            default:
                return status || 'Pending';
        }
    }

    getStatusBadgeClass(status: string | null | undefined): string {
        switch (status) {
            case 'approved':
            case 'acknowledged':
                return 'bg-green-100 text-green-800';
            case 'rejected':
                return 'bg-red-100 text-red-800';
            case 'submitted':
                return 'bg-blue-100 text-blue-800';
            case 'draft':
                return 'bg-gray-100 text-gray-800';
            default:
                return 'bg-yellow-100 text-yellow-800';
        }
    }

    get actionRequestCount(): number {
        const userCode = getCurrentUserCode();
        const source = this.allData.length ? this.allData : this.dataSource;
        return source.filter(
            (item) =>
                this.isActionItem(item) &&
                this.isRelatedToCurrentUser(item, userCode)
        ).length;
    }

    get totalCount(): number {
        return this.totalRecords;
    }

    get listTitle(): string {
        if (this.currentTab === 'action') {
            return 'Action Requests';
        }

        if (this.currentTab === 'my') {
            return 'My Project Quality Assurance Plans';
        }

        if (this.currentTab === 'pending') {
            return 'My Pending Project Quality Assurance Plans';
        }

        return 'All Project Quality Assurance Plans';
    }

    get listCountText(): string {
        if (this.currentTab === 'action') {
            return `${this.filteredDataSource.length} action requests`;
        }

        return `${this.filteredDataSource.length} of ${this.totalCount} plans`;
    }

    get activeFilterCount(): number {
        return [this.searchTerm, this.statusFilter].filter((value) => !!value)
            .length;
    }

    private isActionItem(item: ProjectQualityAssurancePlanListItem): boolean {
        const status = String(item.status ?? '').toLowerCase();
        return ![
            'approved',
            'acknowledged',
            'completed',
            'rejected',
            'declined',
        ].includes(status);
    }

    private isPendingItem(item: ProjectQualityAssurancePlanListItem): boolean {
        return this.isActionItem(item);
    }

    private isMyRequest(
        item: ProjectQualityAssurancePlanListItem,
        userCode: string | null
    ): boolean {
        return isMyRequestByUserCode(item, userCode);
    }

    private isRelatedToCurrentUser(
        item: ProjectQualityAssurancePlanListItem,
        userCode: string | null
    ): boolean {
        if (!userCode) return false;
        const target = userCode.trim().toLowerCase();
        return [
            item.create_by,
            item.update_by,
            (item as any).prepared_by_tl,
            (item as any).approved_by_di,
            (item as any).acknowledged_by_vve,
        ].some(
            (value) =>
                String(value ?? '')
                    .trim()
                    .toLowerCase() === target
        );
    }

    private extractPageRows(response: any): any[] {
        if (Array.isArray(response?.data?.data)) {
            return response.data.data;
        }

        if (Array.isArray(response?.data)) {
            return response.data;
        }

        if (Array.isArray(response)) {
            return response;
        }

        return [];
    }

    private extractTotalRecords(response: any, rows: any[]): number {
        return (
            response?.data?.total ??
            response?.data?.recordsTotal ??
            response?.data?.recordsFiltered ??
            response?.recordsTotal ??
            response?.recordsFiltered ??
            rows.length ??
            0
        );
    }

    private extractDraw(response: any): number {
        return (
            response?.data?.current_page ??
            response?.data?.draw ??
            response?.draw ??
            this.draw
        );
    }

    private normalizeListItem(
        item: any,
        index: number,
        startIndex: number
    ): ProjectQualityAssurancePlanListItem {
        return {
            ...item,
            No: item?.No ?? startIndex + index + 1,
            name: item?.name || item?.project_name || '-',
            status: item?.status ?? null,
            create_by: item?.create_by ?? null,
            update_by: item?.update_by ?? null,
            created_at: item?.created_at ?? '',
            updated_at: item?.updated_at ?? '',
        };
    }

    private ensureEmployeeLabels(
        items: ProjectQualityAssurancePlanListItem[]
    ): void {
        const employeeRefs = new Set<string>();
        items.forEach((item) => {
            if (item.create_by) employeeRefs.add(item.create_by);
            if (item.update_by) employeeRefs.add(item.update_by);
        });

        if (employeeRefs.size === 0) {
            return;
        }

        const currentLookup = this.employeeLookup;
        this.employeeService
            .ensureEmployeesInLookup(currentLookup, Array.from(employeeRefs))
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((resolvedLookup) => {
                if (
                    this.employeeLookup === currentLookup ||
                    this.employeeLookup.size === 0
                ) {
                    this.employeeLookup = resolvedLookup;
                } else {
                    resolvedLookup.forEach((label, ref) =>
                        this.employeeLookup.set(ref, label)
                    );
                }
                if (this.searchTerm) {
                    this.onFilterChange();
                }
            });
    }

    private showAlert(type: FuseAlertType, message: string): void {
        this.alert = { type, message };
        setTimeout(() => {
            this.alert = null;
        }, 5000);
    }
}
