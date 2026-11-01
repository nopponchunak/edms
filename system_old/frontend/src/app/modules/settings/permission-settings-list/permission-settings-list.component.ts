import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { PermissionService, PermissionItem } from 'app/core/services/permission.service';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

@Component({
    selector: 'app-permission-settings-list',
    standalone: true,
    imports: [
        ListTableSortModule,
        CommonModule,
        MatButtonModule,
        MatCardModule,
        MatIconModule,
        MatTableModule,
        MatPaginatorModule,
        MatProgressSpinnerModule,
        MatMenuModule,
        FuseAlertComponent,
    ],
    templateUrl: './permission-settings-list.component.html',
    styleUrls: ['./permission-settings-list.component.scss'],
})
export class PermissionSettingsListComponent implements OnInit {
    listSort: ListSortEvent = { column: 0, dir: 'asc' };
    displayedColumns: string[] = [
        'No',
        'name',
        'create_by',
        'update_by',
        'created_at',
        'updated_at',
        'action',
    ];

    permissions: PermissionItem[] = [];
    isLoading = false;

    // Pagination
    pageIndex = 0;
    pageSize = 10;
    totalRecords = 0;
    currentPage = 1;

    alert: { type: FuseAlertType; message: string } | null = null;

    constructor(
        private permissionService: PermissionService,
        private router: Router,
    ) {}

    ngOnInit(): void {
        this.loadPermissions();
    }

    loadPermissions(): void {
        this.isLoading = true;
        this.alert = null;

        const requestBody = {
            draw: this.pageIndex + 1,
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
            start: this.pageIndex * this.pageSize,
            length: this.pageSize,
            search: {
                value: '',
                regex: false,
            },
        };

        this.permissionService.getPermissionPage(requestBody).subscribe({
            next: (response) => {
                if (response.status && response.data) {
                    this.permissions = response.data.data || [];
                    this.totalRecords = response.data.total || 0;
                    this.currentPage = response.data.current_page || 1;
                } else {
                    this.permissions = [];
                    this.totalRecords = 0;
                    this.showAlert('error', response.message || 'Unable to load permission data');
                }
                this.isLoading = false;
            },
            error: (error) => {
                console.error('Error loading permissions:', error);
                this.permissions = [];
                this.totalRecords = 0;
                this.isLoading = false;
                this.showAlert('error', error?.error?.message || 'Unable to load permission data. Please try again.');
            },
        });
    }

    onPageChange(event: PageEvent): void {
        this.pageIndex = event.pageIndex;
        this.pageSize = event.pageSize;
        this.currentPage = event.pageIndex + 1;
        this.loadPermissions();
    }

    onAddPermission(): void {
        this.router.navigate(['/settings/permissions/new']);
    }

    onViewPermission(permission: PermissionItem): void {
        if (!permission || !permission.id) {
            return;
        }
        this.router.navigate(['/settings/permissions/view', permission.id]);
    }

    onEditPermission(permission: PermissionItem): void {
        if (!permission || !permission.id) {
            return;
        }
        this.router.navigate(['/settings/permissions/edit', permission.id]);
    }

    formatDate(dateString: string | null): string {
        return formatDateDisplay(dateString);
    }

    private showAlert(type: FuseAlertType, message: string): void {
        this.alert = { type, message };
        setTimeout(() => {
            this.alert = null;
        }, 4000);
    }
    onListSortChange(event: ListSortEvent): void {
        this.listSort = event;
        this.pageIndex = 0;
        this.loadPermissions();
    }
}
