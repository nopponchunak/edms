import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';

import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import {
    PermissionAssignedUser,
    PermissionDetail,
    PermissionService,
} from 'app/core/services/permission.service';
import { formatDateDisplay } from 'app/core/utils/date-format.util';

@Component({
    selector: 'app-permission-settings-view',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        MatButtonModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MatTableModule,
        FuseAlertComponent,
    ],
    templateUrl: './permission-settings-view.component.html',
    styleUrls: ['./permission-settings-view.component.scss'],
})
export class PermissionSettingsViewComponent implements OnInit {
    displayedColumns: string[] = ['No', 'username', 'code', 'name', 'email', 'status'];

    permissionId!: number;
    permission: PermissionDetail | null = null;
    users: PermissionAssignedUser[] = [];
    isLoading = false;
    alert: { type: FuseAlertType; message: string } | null = null;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private permissionService: PermissionService
    ) {}

    ngOnInit(): void {
        const idParam = this.route.snapshot.paramMap.get('id');
        const id = Number(idParam);
        if (!idParam || Number.isNaN(id) || id <= 0) {
            this.showAlert('error', 'Invalid permission id');
            return;
        }

        this.permissionId = id;
        this.loadPermission();
    }

    back(): void {
        this.router.navigate(['/settings/permissions']);
    }

    loadPermission(): void {
        this.isLoading = true;
        this.alert = null;

        forkJoin({
            permission: this.permissionService.getPermission(this.permissionId),
            users: this.permissionService.getUsersByPermissionId(this.permissionId),
        }).subscribe({
            next: ({ permission, users }) => {
                if (!permission?.status || !permission.data) {
                    this.permission = null;
                    this.users = [];
                    this.showAlert('error', permission?.message || 'Unable to load permission data');
                    this.isLoading = false;
                    return;
                }

                this.permission = permission.data;
                const assignedUsers = Array.isArray(users?.data) ? users.data : [];
                this.users = assignedUsers.map((user, index) => ({
                    ...user,
                    No: user.No ?? index + 1,
                }));

                if (!users?.status) {
                    this.showAlert('error', users?.message || 'Unable to load users for this permission');
                }

                this.isLoading = false;
            },
            error: (error) => {
                console.error('Error loading permission detail:', error);
                this.permission = null;
                this.users = [];
                this.isLoading = false;
                this.showAlert(
                    'error',
                    error?.error?.message || 'Unable to load permission detail. Please try again.'
                );
            },
        });
    }

    formatDate(dateString: string | null): string {
        return formatDateDisplay(dateString);
    }

    getStatusLabel(status: string | null | undefined): string {
        return status || '-';
    }

    getStatusBadgeClass(status: string | null | undefined): string {
        const normalized = String(status || '').toLowerCase();
        switch (normalized) {
            case 'yes':
            case 'active':
                return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'no':
            case 'inactive':
                return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
            case 'request':
                return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300';
            default:
                return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
        }
    }

    trackByUserId(_index: number, user: PermissionAssignedUser): number {
        return user.id;
    }

    private showAlert(type: FuseAlertType, message: string): void {
        this.alert = { type, message };
        setTimeout(() => {
            this.alert = null;
        }, 5000);
    }
}
