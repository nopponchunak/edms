import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, Sort } from '@angular/material/sort';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { ApiService } from 'app/core/services/api.service';
import { PermissionItem, PermissionService } from 'app/core/services/permission.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

export interface UserPageItem {
    id: number;
    permission_id: number;
    username: string;
    code: string;
    initial: string | null;
    name: string;
    email: string;
    title_name: string | null;
    level_name: string | null;
    department_name: string | null;
    image: string | null;
    status: string;
    create_by: string;
    update_by: string | null;
    created_at: string;
    updated_at: string;
    No: number;
    permission?: {
        id: number;
        name: string;
        create_by: string | null;
        update_by: string | null;
        created_at: string | null;
        updated_at: string | null;
        deleted_at: string | null;
    } | null;
}

export type UserSettingsType = 'local' | 'sync_ad';

interface SyncAdUserFilters {
    status: string;
    employee_type_name: string;
    title_name: string;
    level_name: string;
    department_name: string;
}

interface SyncAdUserFilterOptions {
    employee_type_name: string[];
    title_name: string[];
    level_name: string[];
    department_name: string[];
}

const USER_TYPE_LABELS: Record<UserSettingsType, string> = {
    local: 'Local',
    sync_ad: 'Active Directory',
};

@Component({
    selector: 'app-user-settings-list',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        RouterLink,
        MatButtonModule,
        MatIconModule,
        MatFormFieldModule,
        MatInputModule,
        MatTableModule,
        MatPaginatorModule,
        MatProgressSpinnerModule,
        MatMenuModule,
        MatSelectModule,
        MatSortModule,
        NgxMatSelectSearchModule,
        FuseAlertComponent,
    ],
    templateUrl: './user-settings-list.component.html',
    styleUrls: ['./user-settings-list.component.scss'],
})
export class UserSettingsListComponent implements OnInit, OnDestroy {
    @ViewChild(MatPaginator) paginator!: MatPaginator;

    /** Current type from route: 'local' | 'sync_ad' */
    type: UserSettingsType = 'local';
    typeLabels = USER_TYPE_LABELS;
    tabIndex = 0;

    private readonly localDisplayedColumns: string[] = [
        'No',
        'username',
        'initial',
        'name',
        'email',
        'title_name',
        'level_name',
        'department_name',
        'permission',
        'status',
        'created_at',
        'action',
    ];
    private readonly syncAdDisplayedColumns: string[] = this.localDisplayedColumns.filter(
        (column) => column !== 'created_at'
    );

    displayedColumns: string[] = [...this.localDisplayedColumns];

    users: UserPageItem[] = [];
    isLoading = false;
    isLoadingPermissions = false;
    isLoadingFilters = false;
    isSyncingEmployees = false;
    permissions: PermissionItem[] = [];
    private permissionNameById = new Map<number, string>();
    private savingPermissionUserIds = new Set<number>();
    private hasLoadedSyncAdFilterOptions = false;

    statusOptions: Array<{ value: string; label: string }> = [
        { value: 'Yes', label: 'Yes' },
        { value: 'No', label: 'No' },
        { value: 'Request', label: 'Request' },
    ];
    private savingStatusUserIds = new Set<number>();

    // Pagination & search
    pageIndex = 0;
    pageSize = 10;
    totalRecords = 0;
    searchTerm = '';
    sortActive = 'No';
    sortDirection: 'asc' | 'desc' = 'desc';
    private readonly sortColumnIndexes: Record<string, number> = {
        No: 0,
        username: 1,
        initial: 2,
        name: 3,
        email: 4,
        title_name: 5,
        level_name: 6,
        department_name: 7,
        permission: 8,
        status: 9,
        created_at: 10,
    };
    filters: SyncAdUserFilters = this.createEmptyFilters();
    filterOptions: SyncAdUserFilterOptions = {
        employee_type_name: [],
        title_name: [],
        level_name: [],
        department_name: [],
    };
    filteredFilterOptions: SyncAdUserFilterOptions = {
        employee_type_name: [],
        title_name: [],
        level_name: [],
        department_name: [],
    };
    employeeTypeSearchCtrl = new FormControl('');
    titleSearchCtrl = new FormControl('');
    levelSearchCtrl = new FormControl('');
    departmentSearchCtrl = new FormControl('');

    alert: { type: FuseAlertType; message: string } | null = null;
    private readonly searchInput$ = new Subject<string>();
    private readonly destroy$ = new Subject<void>();

    constructor(
        private apiService: ApiService,
        private permissionService: PermissionService,
        private fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private route: ActivatedRoute,
    ) {}

    ngOnInit(): void {
        this.bindFilterSearch(this.employeeTypeSearchCtrl, 'employee_type_name');
        this.bindFilterSearch(this.titleSearchCtrl, 'title_name');
        this.bindFilterSearch(this.levelSearchCtrl, 'level_name');
        this.bindFilterSearch(this.departmentSearchCtrl, 'department_name');

        this.searchInput$
            .pipe(debounceTime(400), distinctUntilChanged(), takeUntil(this.destroy$))
            .subscribe(() => {
                if (this.type !== 'sync_ad') {
                    return;
                }
                this.pageIndex = 0;
                this.loadUsers();
            });

        this.loadPermissions();
        this.route.params.subscribe((params) => {
            const t = (params['type'] || 'local').toLowerCase();
            if (t === 'local' || t === 'sync_ad') {
                this.type = t;
                this.tabIndex = t === 'local' ? 0 : 1;
                this.displayedColumns = this.getDisplayedColumns(this.type);
                this.pageIndex = 0;
                if (this.type === 'sync_ad') {
                    this.loadSyncAdFilterOptions();
                } else {
                    this.resetSyncAdFilters(false);
                }
                this.loadUsers();
            } else {
                this.router.navigate(['/settings/users/local'], { replaceUrl: true });
            }
        });
    }

    private getDisplayedColumns(type: UserSettingsType): string[] {
        return type === 'sync_ad'
            ? [...this.syncAdDisplayedColumns]
            : [...this.localDisplayedColumns];
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    onTabChange(index: number): void {
        const newType: UserSettingsType = index === 0 ? 'local' : 'sync_ad';
        if (newType === this.type) return;
        this.router.navigate(['/settings/users', newType]);
    }

    loadUsers(): void {
        this.isLoading = true;

        const requestBody = {
            draw: this.pageIndex + 1,
            order: [
                {
                    column: this.sortColumnIndexes[this.sortActive] ?? 0,
                    dir: this.sortDirection,
                },
            ],
            start: this.pageIndex * this.pageSize,
            length: this.pageSize,
            search: {
                value: this.searchTerm,
                regex: false,
            },
            type: this.type,
            ...this.getSyncAdFilterPayload(),
        };

        this.apiService.getUserPage(requestBody).subscribe({
            next: (response) => {
                if (response.status && response.data) {
                    this.users = response.data.data || [];
                    this.totalRecords = response.data.total || 0;
                } else {
                    this.users = [];
                    this.totalRecords = 0;
                    this.showAlert('error', response.message || 'Unable to load user data');
                }
                this.isLoading = false;
            },
            error: (error) => {
                console.error('Error loading user page:', error);
                this.users = [];
                this.totalRecords = 0;
                this.isLoading = false;
                this.showAlert('error', 'Unable to load user data. Please try again.');
            },
        });
    }

    onPageChange(event: PageEvent): void {
        this.pageIndex = event.pageIndex;
        this.pageSize = event.pageSize;
        this.loadUsers();
    }

    onSortChange(sort: Sort): void {
        if (!sort.direction || this.sortColumnIndexes[sort.active] === undefined) {
            return;
        }

        this.sortActive = sort.active;
        this.sortDirection = sort.direction;
        this.pageIndex = 0;
        this.loadUsers();
    }

    onSearch(): void {
        this.pageIndex = 0;
        this.loadUsers();
    }

    onSearchTermChange(value: string): void {
        this.searchInput$.next(value || '');
    }

    clearSearch(): void {
        if (!this.searchTerm) {
            return;
        }
        this.searchTerm = '';
        this.pageIndex = 0;
        this.loadUsers();
    }

    onPageSizeSelectChange(value: number | string): void {
        const nextPageSize = Number(value);
        if (!Number.isFinite(nextPageSize) || nextPageSize <= 0 || nextPageSize === this.pageSize) {
            return;
        }
        this.pageSize = nextPageSize;
        this.pageIndex = 0;
        this.loadUsers();
    }

    onFilterChange(): void {
        if (this.type !== 'sync_ad') {
            return;
        }
        this.pageIndex = 0;
        this.loadUsers();
    }

    onSyncEmployees(): void {
        if (this.type !== 'sync_ad' || this.isSyncingEmployees) {
            return;
        }

        const confirmation = this.fuseConfirmationService.open({
            title: 'Sync Employees',
            message: 'Sync the latest employee data from HRM into Active Directory users?',
            icon: {
                show: true,
                name: 'heroicons_outline:arrow-path',
                color: 'primary',
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Sync',
                    color: 'primary',
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
                this.syncEmployees();
            }
        });
    }

    private syncEmployees(): void {
        this.isSyncingEmployees = true;
        this.alert = null;

        this.apiService.syncEmployees().subscribe({
            next: (response) => {
                this.isSyncingEmployees = false;
                if (response?.error === false || response?.status === true) {
                    this.showAlert('success', this.buildEmployeeSyncMessage(response));
                    this.hasLoadedSyncAdFilterOptions = false;
                    this.loadSyncAdFilterOptions();
                    this.pageIndex = 0;
                    this.loadUsers();
                    return;
                }

                this.showAlert('error', response?.message || 'Unable to sync employees');
            },
            error: (error) => {
                console.error('Error syncing employees:', error);
                this.isSyncingEmployees = false;
                this.showAlert(
                    'error',
                    error?.error?.message || 'Unable to sync employees. Please try again.'
                );
            },
        });
    }

    private buildEmployeeSyncMessage(response: any): string {
        const synced = Number(response?.synced ?? response?.data?.synced ?? 0);
        const inserted = Number(response?.inserted ?? response?.data?.inserted ?? 0);
        const updated = Number(response?.updated ?? response?.data?.updated ?? 0);
        const usersInserted = Number(response?.users_inserted ?? response?.data?.users_inserted ?? 0);
        const usersUpdated = Number(response?.users_updated ?? response?.data?.users_updated ?? 0);
        const usersSkipped = Number(response?.users_skipped ?? response?.data?.users_skipped ?? 0);

        return `Employees synced. Synced ${synced}, inserted ${inserted}, updated ${updated}. Users inserted ${usersInserted}, updated ${usersUpdated}, skipped ${usersSkipped}.`;
    }

    getPermissionName(user: UserPageItem): string {
        return (
            user.permission?.name ||
            (typeof user.permission_id === 'number' ? (this.permissionNameById.get(user.permission_id) ?? '-') : '-') ||
            '-'
        );
    }

    isSavingPermission(userId: number): boolean {
        return this.savingPermissionUserIds.has(userId);
    }

    onPermissionChange(user: UserPageItem, newPermissionIdRaw: unknown): void {
        const newPermissionId = Number(newPermissionIdRaw);
        if (!user?.id || !newPermissionId) return;
        if (user.permission_id === newPermissionId) return;
        if (this.isSavingPermission(user.id)) return;

        const confirmation = this.fuseConfirmationService.open({
            title: 'Change Permission',
            message: 'Are you sure you want to change the permission for this user?',
            icon: {
                show: true,
                name: 'heroicons_outline:exclamation-triangle',
                color: 'warn',
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Change',
                    color: 'primary',
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
                this.applyPermissionChange(user, newPermissionId);
            } else {
                // Re-trigger change detection to revert select UI
                const originalId = user.permission_id;
                user.permission_id = 0;
                setTimeout(() => {
                    user.permission_id = originalId;
                });
            }
        });
    }

    private applyPermissionChange(user: UserPageItem, newPermissionId: number): void {
        const prevPermissionId = user.permission_id;
        user.permission_id = newPermissionId;
        user.permission = this.getPermissionById(newPermissionId);

        this.savingPermissionUserIds.add(user.id);
        this.apiService.updateUserPermission(user.id, { permission_id: newPermissionId }).subscribe({
            next: (response) => {
                this.savingPermissionUserIds.delete(user.id);
                if (response?.status) {
                    this.showAlert('success', response.message || 'Permission updated successfully');
                } else {
                    // rollback
                    user.permission_id = prevPermissionId;
                    user.permission = this.getPermissionById(prevPermissionId);
                    this.showAlert('error', response?.message || 'Unable to update permission');
                }
            },
            error: (error) => {
                console.error('Error updating user permission:', error);
                this.savingPermissionUserIds.delete(user.id);
                // rollback
                user.permission_id = prevPermissionId;
                user.permission = this.getPermissionById(prevPermissionId);
                this.showAlert('error', error?.error?.message || 'Unable to update permission. Please try again.');
            },
        });
    }

    isSavingStatus(userId: number): boolean {
        return this.savingStatusUserIds.has(userId);
    }

    onStatusChange(user: UserPageItem, newStatusRaw: unknown): void {
        const newStatus = String(newStatusRaw ?? '').trim();
        if (!user?.id || !newStatus) return;
        if (user.status === newStatus) return;
        if (this.isSavingStatus(user.id)) return;

        const confirmation = this.fuseConfirmationService.open({
            title: 'Change Status',
            message: 'Are you sure you want to change the status for this user?',
            icon: {
                show: true,
                name: 'heroicons_outline:exclamation-triangle',
                color: 'warn',
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Change',
                    color: 'primary',
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
                this.applyStatusChange(user, newStatus);
            } else {
                // Re-trigger change detection to revert select UI
                const originalStatus = user.status;
                user.status = '';
                setTimeout(() => {
                    user.status = originalStatus;
                });
            }
        });
    }

    private applyStatusChange(user: UserPageItem, newStatus: string): void {
        const prevStatus = user.status;
        user.status = newStatus;

        this.savingStatusUserIds.add(user.id);
        this.apiService.updateUserStatus(user.id, { status: newStatus }).subscribe({
            next: (response) => {
                this.savingStatusUserIds.delete(user.id);
                if (response?.status) {
                    this.showAlert('success', response.message || 'Status updated successfully');
                } else {
                    user.status = prevStatus;
                    this.showAlert('error', response?.message || 'Unable to update status');
                }
            },
            error: (error) => {
                console.error('Error updating user status:', error);
                this.savingStatusUserIds.delete(user.id);
                user.status = prevStatus;
                this.showAlert('error', error?.error?.message || 'Unable to update status. Please try again.');
            },
        });
    }

    getStatusBadgeClass(status: string): string {
        if (!status) return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
        const normalized = status.toString().toLowerCase();
        switch (normalized) {
            case 'yes':
            case 'active':
                return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'no':
            case 'inactive':
                return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
            default:
                return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
        }
    }

    onViewUser(user: UserPageItem): void {
        if (!user || !user.id) {
            return;
        }
        this.router.navigate(['/settings/users/view', user.id], {
            queryParamsHandling: 'preserve',
        });
    }

    onEditUser(user: UserPageItem): void {
        if (!user || !user.id) {
            return;
        }
        this.router.navigate(['/settings/users/edit', user.id], {
            queryParamsHandling: 'preserve',
        });
    }

    private showAlert(type: FuseAlertType, message: string): void {
        this.alert = { type, message };
        setTimeout(() => {
            this.alert = null;
        }, 4000);
    }

    private loadPermissions(): void {
        this.isLoadingPermissions = true;
        this.permissionService.getPermissionsList().subscribe({
            next: (response) => {
                if (response?.status && Array.isArray(response.data)) {
                    this.permissions = response.data;
                    this.permissionNameById = new Map(this.permissions.map((p) => [p.id, p.name]));
                } else {
                    this.permissions = [];
                    this.permissionNameById = new Map();
                }
                this.isLoadingPermissions = false;
            },
            error: (error) => {
                console.error('Error loading permissions:', error);
                this.permissions = [];
                this.permissionNameById = new Map();
                this.isLoadingPermissions = false;
            },
        });
    }

    private loadSyncAdFilterOptions(): void {
        if (this.hasLoadedSyncAdFilterOptions || this.isLoadingFilters) {
            return;
        }

        this.isLoadingFilters = true;
        this.apiService.getSyncAdUserFilterOptions().subscribe({
            next: (response) => {
                const data = response?.data || {};
                this.filterOptions = {
                    employee_type_name: this.normalizeFilterOptions(data.employee_type_name),
                    title_name: this.normalizeFilterOptions(data.title_name),
                    level_name: this.normalizeFilterOptions(data.level_name),
                    department_name: this.normalizeFilterOptions(data.department_name),
                };
                this.filteredFilterOptions = {
                    employee_type_name: [...this.filterOptions.employee_type_name],
                    title_name: [...this.filterOptions.title_name],
                    level_name: [...this.filterOptions.level_name],
                    department_name: [...this.filterOptions.department_name],
                };
                this.hasLoadedSyncAdFilterOptions = true;
                this.isLoadingFilters = false;
            },
            error: (error) => {
                console.error('Error loading Active Directory user filters:', error);
                this.filterOptions = {
                    employee_type_name: [],
                    title_name: [],
                    level_name: [],
                    department_name: [],
                };
                this.filteredFilterOptions = {
                    employee_type_name: [],
                    title_name: [],
                    level_name: [],
                    department_name: [],
                };
                this.isLoadingFilters = false;
            },
        });
    }

    private getSyncAdFilterPayload(): Partial<SyncAdUserFilters> {
        if (this.type !== 'sync_ad') {
            return {};
        }

        return Object.entries(this.filters).reduce((payload, [key, value]) => {
            const normalized = (value || '').trim();
            if (normalized) {
                payload[key as keyof SyncAdUserFilters] = normalized;
            }
            return payload;
        }, {} as Partial<SyncAdUserFilters>);
    }

    private resetSyncAdFilters(shouldReload: boolean): void {
        this.filters = this.createEmptyFilters();
        if (shouldReload) {
            this.pageIndex = 0;
            this.loadUsers();
        }
    }

    private createEmptyFilters(): SyncAdUserFilters {
        return {
            status: '',
            employee_type_name: '',
            title_name: '',
            level_name: '',
            department_name: '',
        };
    }

    private bindFilterSearch(
        control: FormControl<string | null>,
        key: keyof SyncAdUserFilterOptions
    ): void {
        control.valueChanges
            .pipe(debounceTime(150), distinctUntilChanged(), takeUntil(this.destroy$))
            .subscribe((search) => {
                this.filteredFilterOptions[key] = this.filterOptionValues(this.filterOptions[key], search || '');
            });
    }

    private filterOptionValues(options: string[], search: string): string[] {
        const normalizedSearch = this.normalizeFilterText(search);
        if (!normalizedSearch) {
            return [...options];
        }

        const terms = normalizedSearch.split(' ').filter(Boolean);
        return options.filter((option) => terms.every((term) => this.filterOptionMatchesTerm(option, term)));
    }

    private filterOptionMatchesTerm(option: string, term: string): boolean {
        const normalizedOption = this.normalizeFilterText(option);
        if (!normalizedOption) {
            return false;
        }

        const words = normalizedOption.split(' ').filter(Boolean);
        const acronym = words.map((word) => word[0]).join('');

        return (
            normalizedOption === term ||
            normalizedOption.startsWith(`${term} `) ||
            acronym.startsWith(term) ||
            words.some((word) => word.startsWith(term))
        );
    }

    private normalizeFilterText(value: string): string {
        return value
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private normalizeFilterOptions(value: unknown): string[] {
        if (!Array.isArray(value)) {
            return [];
        }

        return Array.from(
            new Set(
                value
                    .map((item) => (item ?? '').toString().trim())
                    .filter((item) => item !== '')
            )
        ).sort((a, b) => a.localeCompare(b));
    }

    private getPermissionById(permissionId: number): UserPageItem['permission'] {
        const name = this.permissionNameById.get(permissionId);
        if (!name) return null;
        return {
            id: permissionId,
            name,
            create_by: null,
            update_by: null,
            created_at: null,
            updated_at: null,
            deleted_at: null,
        };
    }

}
