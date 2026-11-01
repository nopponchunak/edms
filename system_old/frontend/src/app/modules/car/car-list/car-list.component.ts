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
import { Car, CarSeverity } from 'app/core/models/car.model';
import { CarService, CarsPageRequest } from 'app/core/services/car.service';
import { EmployeeService } from 'app/core/services/employee.service';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';
import {
    filterCarActionRequests,
    getCurrentUserCode,
    isCarPending,
    isMyRequestByUserCode,
} from 'app/core/utils/action-request-filter.util';
import { formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

interface ActionRequestItem {
    id: string;
    car: Car;
    actionType:
        | 'approved_by_status'
        | 'completed_by_status'
        | 'acknowledged_by_status'
        | 'verified_by_status'
        | 'approved_by_status_2';
    currentStatus: string | null;
}

type CarListTab = 'all' | 'my' | 'pending' | 'action';

@Component({
    selector: 'app-car-list',
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
    templateUrl: './car-list.component.html',
    styleUrls: ['./car-list.component.scss'],
})
export class CarListComponent implements OnInit, OnDestroy {
    listSort: ListSortEvent = { column: 0, dir: 'desc' };
    private _unsubscribeAll: Subject<void> = new Subject<void>();
    readonly navigationPermissionService = inject(NavigationPermissionService);
    readonly permissionNavId = 'cars';

    displayedColumns: string[] = [
        'refNo',
        'project',
        'to',
        'department',
        'severity',
        'createdAt',
        'updatedAt',
        'status',
        'actions',
    ];

    actionDisplayedColumns: string[] = [
        'refNo',
        'project',
        'department',
        'severity',
        'actionStep',
        'status',
        'action',
    ];

    private allData: Car[] = [];
    private allActionRequests: ActionRequestItem[] = [];
    private employeeLookup = new Map<string, string>();
    filteredCars: Car[] = [];
    actionRequests: ActionRequestItem[] = [];

    isLoading = false;
    alert: { type: FuseAlertType; message: string } | null = null;

    searchTerm = '';
    statusFilter = '';
    severityFilter = '';

    currentTab: CarListTab = 'all';
    viewMode: 'card' | 'table' = 'table';
    showFilterPanel = false;

    pageIndex = 0;
    pageSize = 10;
    totalRecords = 0;

    filterConfig: PurchaseFormsFilterConfig = {
        searchLabel: 'Search CARs',
        searchPlaceholder: 'Search by ref no., project, department, or to...',
        statusFilterLabel: 'Filter by Status',
        statusOptions: [
            { value: 'pending', label: 'Pending' },
            { value: 'reject', label: 'Rejected' },
            { value: 'approve', label: 'Approved' },
        ],
        statusLabelFn: (value: string) => this.getStatusLabel(value),
        thirdFilterLabel: 'Filter by Severity',
        thirdFilterOptions: [
            { value: CarSeverity.MAJOR, label: 'MAJOR' },
            { value: CarSeverity.MINOR, label: 'MINOR' },
        ],
        showThirdFilter: true,
    };

    constructor(
        private carService: CarService,
        private employeeService: EmployeeService,
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

        this.loadCars();
        this.loadEmployeeLookup();
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next();
        this._unsubscribeAll.complete();
    }

    loadCars(): void {
        this.isLoading = true;
        this.alert = null;

        const request: CarsPageRequest = {
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

        this.carService
            .findAllPaginated(request)
            .pipe(
                takeUntil(this._unsubscribeAll),
                catchError((error) => {
                    console.error('Error loading CARs:', error);
                    this.showAlert(
                        'error',
                        error?.error?.message ||
                            'Failed to load CARs. Please try again.'
                    );
                    return of(null);
                }),
                finalize(() => (this.isLoading = false))
            )
            .subscribe((response) => {
                this.allData = this.sortCarsByNewest(response?.data ?? []);
                this.buildActionRequests();
                this.onFilterChange(false);
            });
    }

    private loadEmployeeLookup(): void {
        this.employeeService
            .getEmployeeLookupMap()
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((lookup) => {
                this.employeeLookup = lookup;
                this.onFilterChange(false);
            });
    }

    onPageChange(event: PageEvent): void {
        this.pageSize = event.pageSize;
        this.pageIndex = event.pageIndex;
    }

    onTabChange(tab: CarListTab): void {
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
            this.filteredCars = this.actionRequests.map((item) => item.car);
            this.totalRecords = this.actionRequests.length;
            return;
        }

        this.applyClientSideFilters(resetPage);
        this.totalRecords = this.filteredCars.length;
    }

    private applyClientSideFilters(resetPage = true): void {
        const term = (this.searchTerm || '').toLowerCase().trim();
        const userCode = getCurrentUserCode();
        const actionCarIds = new Set(
            this.allActionRequests.map((item) => String(item.car.id))
        );

        this.filteredCars = this.allData.filter((car) => {
            let matchesTab = true;

            if (this.currentTab === 'my') {
                matchesTab = isMyRequestByUserCode(car, userCode);
            } else if (this.currentTab === 'pending') {
                matchesTab =
                    (isMyRequestByUserCode(car, userCode) &&
                        isCarPending(car)) ||
                    actionCarIds.has(String(car.id));
            }

            const matchesSearch = this.matchesSearchTerm(car, term);
            const matchesStatus =
                !this.statusFilter ||
                this.getWorkflowStatus(car) === this.statusFilter;
            const matchesSeverity =
                !this.severityFilter || car.severity === this.severityFilter;

            return (
                matchesTab && matchesSearch && matchesStatus && matchesSeverity
            );
        });

        if (resetPage) {
            this.pageIndex = 0;
        }
    }

    private buildActionRequests(): void {
        const userCode = getCurrentUserCode();
        this.allActionRequests = filterCarActionRequests(
            this.allData,
            userCode
        );
        this.applyActionFilters();
    }

    private applyActionFilters(): void {
        const term = (this.searchTerm || '').toLowerCase().trim();

        this.actionRequests = this.allActionRequests.filter((item) => {
            const car = item.car;
            const matchesSearch = this.matchesSearchTerm(car, term);
            const matchesStatus =
                !this.statusFilter ||
                this.getWorkflowStatus(car) === this.statusFilter;
            const matchesSeverity =
                !this.severityFilter || car.severity === this.severityFilter;

            return matchesSearch && matchesStatus && matchesSeverity;
        });
    }

    private matchesSearchTerm(car: Car, term: string): boolean {
        if (!term) return true;

        const issuerName = `${car.issuer?.firstName || ''} ${
            car.issuer?.lastName || ''
        }`;
        const responsibleName = `${car.responsiblePerson?.firstName || ''} ${
            car.responsiblePerson?.lastName || ''
        }`;
        const imrName = `${car.imr?.firstName || ''} ${
            car.imr?.lastName || ''
        }`;

        return [
            car.refNo,
            car.projectName,
            car.projectNo,
            car.to,
            this.getTo(car),
            car.department,
            car.carIssuedBy,
            car.issuerId,
            car.responsiblePersonId,
            car.imrId,
            issuerName,
            car.issuer?.email,
            responsibleName,
            car.responsiblePerson?.email,
            imrName,
            car.imr?.email,
        ].some((value) =>
            String(value || '')
                .toLowerCase()
                .includes(term)
        );
    }

    clearFilters(): void {
        this.searchTerm = '';
        this.statusFilter = '';
        this.severityFilter = '';
        this.pageIndex = 0;
        this.closeFilterPanel();
        this.onFilterChange();
    }

    applyFilters(filters: PurchaseFormsFilterValues): void {
        this.searchTerm = filters.searchTerm || '';
        this.statusFilter = filters.statusFilter || '';
        this.severityFilter = filters.thirdFilter || '';
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

    get visibleRows(): Car[] {
        const start = this.pageIndex * this.pageSize;
        return this.filteredCars.slice(start, start + this.pageSize);
    }

    get filteredCount(): number {
        return this.currentTab === 'action'
            ? this.actionRequests.length
            : this.filteredCars.length;
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
        return [this.searchTerm, this.statusFilter, this.severityFilter].filter(
            (value) => !!value
        ).length;
    }

    getListTitle(): string {
        switch (this.currentTab) {
            case 'all':
                return 'All CAR Requests';
            case 'my':
                return 'My CAR Requests';
            case 'pending':
                return 'Pending CAR Requests';
            case 'action':
                return 'Action Requests';
            default:
                return 'CAR Requests';
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
                return 'No CAR - Corrective Action Request have been created yet.';
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
            case 'approved_by_status':
                return 'Approved By';
            case 'completed_by_status':
                return 'Completed By';
            case 'acknowledged_by_status':
                return 'Acknowledged By';
            case 'verified_by_status':
                return 'Verified By';
            case 'approved_by_status_2':
                return 'Approved By 2';
            default:
                return 'Action';
        }
    }

    getByStatusText(status: string | null | undefined): string {
        if (!status || status === 'null') return 'Pending';
        const normalized = status.toLowerCase();
        if (normalized === 'pending') return 'Pending';
        if (normalized === 'approve' || normalized === 'approved') {
            return 'Approved';
        }
        if (normalized === 'reject' || normalized === 'rejected') {
            return 'Rejected';
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

    getWorkflowStatus(car: Car): 'pending' | 'reject' | 'approve' {
        const statuses = [
            car.approvedByStatus,
            car.completedByStatus,
            car.acknowledgedByStatus,
            car.verifiedByStatus,
            car.approvedByStatus2,
        ];

        const hasReject = statuses.some((status) => {
            const normalized = status?.toLowerCase().trim();
            return normalized === 'reject' || normalized === 'rejected';
        });

        if (hasReject) return 'reject';

        const allApproved = statuses.every((status) => {
            const normalized = status?.toLowerCase().trim();
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

    getSeverityColor(
        severity: CarSeverity | string | null | undefined
    ): string {
        return severity === CarSeverity.MAJOR
            ? 'bg-red-100 text-red-800'
            : 'bg-yellow-100 text-yellow-800';
    }

    getSeverityLabel(
        severity: CarSeverity | string | null | undefined
    ): string {
        return severity === CarSeverity.MAJOR ? 'MAJOR' : 'MINOR';
    }

    getRefNo(car: Car): string {
        return car.refNo || '-';
    }

    getProjectName(car: Car): string {
        return car.projectName || '-';
    }

    getProjectNo(car: Car): string {
        return car.projectNo || '-';
    }

    getTo(car: Car): string {
        return this.employeeService.formatEmployeeReference(car.to, this.employeeLookup);
    }

    getDepartment(car: Car): string {
        return car.department || '-';
    }

    formatDate(dateString?: string | null): string {
        return formatDateTimeDisplay(dateString);
    }

    canEdit(car: Car): boolean {
        return this.getWorkflowStatus(car) === 'pending';
    }

    canDelete(car: Car): boolean {
        return this.getWorkflowStatus(car) === 'pending';
    }

    canShowMoreActions(car: Car): boolean {
        return (
            (this.canEdit(car) &&
                this.navigationPermissionService.hasEditPermissionByNavId(
                    this.permissionNavId
                )) ||
            (this.canDelete(car) &&
                this.navigationPermissionService.hasDeletePermissionByNavId(
                    this.permissionNavId
                ))
        );
    }

    editCar(car: Car): void {
        this.router.navigate(['/cars/edit', car.id]);
    }

    viewCar(car: Car): void {
        this.router.navigate(['/cars/view', car.id]);
    }

    deleteCar(car: Car): void {
        const confirmation = this.fuseConfirmationService.open({
            title: 'Delete CAR',
            message:
                'Are you sure you want to remove this CAR? This action cannot be undone!',
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

                this.carService
                    .delete(car.id)
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe({
                        next: () => {
                            this.loadCars();
                            this.showAlert(
                                'success',
                                'CAR deleted successfully.'
                            );
                        },
                        error: (error) => {
                            console.error('Error deleting CAR:', error);
                            this.showAlert(
                                'error',
                                'Failed to delete CAR. Please try again.'
                            );
                        },
                    });
            });
    }

    private sortCarsByNewest(items: Car[]): Car[] {
        return [...items].sort(
            (a, b) => this.getCarSortValue(b) - this.getCarSortValue(a)
        );
    }

    private getCarSortValue(car: Car): number {
        const createdAt = car.createdAt
            ? new Date(car.createdAt).getTime()
            : NaN;
        if (!Number.isNaN(createdAt)) {
            return createdAt;
        }

        const id = Number(car.id);
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
        this.loadCars();
    }
}
