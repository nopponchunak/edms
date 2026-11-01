import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { ApiService } from 'app/core/services/api.service';
import { formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

interface AuditLogItem {
    id: number;
    user_id: string;
    actor_code: string | null;
    actor_username: string | null;
    actor_user_name: string | null;
    actor_name: string | null;
    actor_email: string | null;
    actor_initial: string | null;
    actor_firstname: string | null;
    actor_lastname: string | null;
    actor_department_name: string | null;
    description: string;
    type: string;
    created_at: string;
    updated_at: string;
    No: number;
}

@Component({
    selector: 'app-audit-log-list',
    standalone: true,
    imports: [
        ListTableSortModule,
        CommonModule,
        FormsModule,
        MatFormFieldModule,
        MatIconModule,
        MatPaginatorModule,
        MatProgressSpinnerModule,
        MatSelectModule,
        MatTableModule,
        FuseAlertComponent,
    ],
    templateUrl: './audit-log-list.component.html',
    styleUrls: ['./audit-log-list.component.scss'],
})
export class AuditLogListComponent implements OnInit {
    listSort: ListSortEvent = { column: 4, dir: 'desc' };
    displayedColumns: string[] = ['No', 'actor', 'type', 'description', 'created_at'];
    logs: AuditLogItem[] = [];
    typeOptions: string[] = [];
    isLoading = false;
    isLoadingTypes = false;

    pageIndex = 0;
    pageSize = 25;
    totalRecords = 0;

    searchTerm = '';
    typeFilter = '';
    dateFrom = '';
    dateTo = '';

    alert: { type: FuseAlertType; message: string } | null = null;

    constructor(private apiService: ApiService) {}

    ngOnInit(): void {
        this.loadTypes();
        this.loadLogs();
    }

    loadLogs(): void {
        this.isLoading = true;
        this.alert = null;

        const requestBody = {
            draw: this.pageIndex + 1,
            order: [this.listSort],
            start: this.pageIndex * this.pageSize,
            length: this.pageSize,
            search: {
                value: this.searchTerm.trim(),
                regex: false,
            },
            ...(this.typeFilter ? { type: this.typeFilter } : {}),
            ...(this.dateFrom ? { date_from: this.dateFrom } : {}),
            ...(this.dateTo ? { date_to: this.dateTo } : {}),
        };

        this.apiService.getAuditLogPage(requestBody).subscribe({
            next: (response) => {
                if (response?.status && response.data) {
                    this.logs = response.data.data || [];
                    this.totalRecords = response.data.total || 0;
                } else {
                    this.logs = [];
                    this.totalRecords = 0;
                    this.showAlert('error', response?.message || 'Unable to load audit logs');
                }
                this.isLoading = false;
            },
            error: (error) => {
                console.error('Error loading audit logs:', error);
                this.logs = [];
                this.totalRecords = 0;
                this.isLoading = false;
                this.showAlert('error', error?.error?.message || 'Unable to load audit logs. Please try again.');
            },
        });
    }

    loadTypes(): void {
        this.isLoadingTypes = true;
        this.apiService.getAuditLogTypes().subscribe({
            next: (response) => {
                const data = Array.isArray(response?.data) ? response.data : [];
                this.typeOptions = data
                    .map((item) => (item ?? '').toString().trim())
                    .filter((item) => item !== '');
                this.isLoadingTypes = false;
            },
            error: (error) => {
                console.error('Error loading audit log types:', error);
                this.typeOptions = [];
                this.isLoadingTypes = false;
            },
        });
    }

    onSearch(): void {
        this.pageIndex = 0;
        this.loadLogs();
    }

    onFilterChange(): void {
        this.pageIndex = 0;
        this.loadLogs();
    }

    clearFilters(): void {
        this.searchTerm = '';
        this.typeFilter = '';
        this.dateFrom = '';
        this.dateTo = '';
        this.pageIndex = 0;
        this.loadLogs();
    }

    onPageChange(event: PageEvent): void {
        this.pageIndex = event.pageIndex;
        this.pageSize = event.pageSize;
        this.loadLogs();
    }

    getActorName(log: AuditLogItem): string {
        return log.actor_name || log.actor_user_name || log.actor_username || log.user_id || '-';
    }

    getActorMeta(log: AuditLogItem): string {
        const code = log.actor_code || log.user_id || '';
        const username = log.actor_username || '';
        const department = log.actor_department_name || '';
        return [code, username, department].filter(Boolean).join(' | ') || '-';
    }

    formatDateTime(value: string | null): string {
        return formatDateTimeDisplay(value);
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
        this.loadLogs();
    }
}
