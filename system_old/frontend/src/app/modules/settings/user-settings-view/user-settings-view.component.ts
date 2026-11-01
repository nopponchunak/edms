import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { ApiService } from 'app/core/services/api.service';

interface UserPermission {
    id: number;
    name: string;
    create_by: string | null;
    update_by: string | null;
    created_at: string | null;
    updated_at: string | null;
    deleted_at: string | null;
}

interface UserDetail {
    id: number;
    permission_id: number;
    code: string;
    username: string;
    name: string;
    email: string;
    phone: string;
    image: string | null;
    status: string;
    zone_market_id: number | null;
    create_by: string;
    update_by: string | null;
    created_at: string;
    updated_at: string;
    permission?: UserPermission | null;
}

@Component({
    selector: 'app-user-settings-view',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        MatButtonModule,
        MatCardModule,
        MatIconModule,
        MatProgressSpinnerModule,
        FuseAlertComponent,
    ],
    templateUrl: './user-settings-view.component.html',
    styleUrls: ['./user-settings-view.component.scss'],
})
export class UserSettingsViewComponent implements OnInit {
    user: UserDetail | null = null;
    isLoading = false;
    alert: { type: FuseAlertType; message: string } | null = null;

    constructor(
        private route: ActivatedRoute,
        private apiService: ApiService,
    ) {}

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id');
        if (id) {
            this.loadUser(id);
        } else {
            this.showAlert('error', 'User ID not found');
        }
    }

    loadUser(id: string): void {
        this.isLoading = true;
        this.apiService.getUserDetail(id).subscribe({
            next: (response) => {
                if (response.status && response.data) {
                    this.user = response.data as UserDetail;
                } else {
                    this.user = null;
                    this.showAlert('error', response.message || 'Unable to load user data');
                }
                this.isLoading = false;
            },
            error: (error) => {
                console.error('Error loading user detail:', error);
                this.user = null;
                this.isLoading = false;
                this.showAlert('error', 'Unable to load user data. Please try again.');
            },
        });
    }

    getStatusLabel(status: string | null | undefined): string {
        if (!status) return '-';
        return status;
    }

    getStatusBadgeClass(status: string | null | undefined): string {
        if (!status) {
            return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
        }
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

    getPermissionName(): string {
        return this.user?.permission?.name || '-';
    }

    private showAlert(type: FuseAlertType, message: string): void {
        this.alert = { type, message };
        setTimeout(() => {
            this.alert = null;
        }, 4000);
    }
}



