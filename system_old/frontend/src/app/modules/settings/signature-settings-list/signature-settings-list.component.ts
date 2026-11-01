import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';
import {
    SignatureSetting,
    SignatureSettingService,
} from 'app/core/services/signature-setting.service';

@Component({
    selector: 'app-signature-settings-list',
    standalone: true,
    imports: [
        ListTableSortModule,
        CommonModule,
        FormsModule,
        MatButtonModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatPaginatorModule,
        MatProgressSpinnerModule,
        MatSelectModule,
        MatTableModule,
        MatTooltipModule,
        FuseAlertComponent,
    ],
    templateUrl: './signature-settings-list.component.html',
    styleUrls: ['./signature-settings-list.component.scss'],
})
export class SignatureSettingsListComponent implements OnInit {
    listSort: ListSortEvent = { column: 5, dir: 'desc' };
    displayedColumns: string[] = [
        'no',
        'employee_code',
        'name',
        'department',
        'is_active',
        'updated_at',
        'action',
    ];
    items: SignatureSetting[] = [];
    isLoading = false;
    pageIndex = 0;
    pageSize = 25;
    totalRecords = 0;
    searchTerm = '';
    statusFilter: number | null = null;
    alert: { type: FuseAlertType; message: string } | null = null;

    constructor(
        private signatureSettingService: SignatureSettingService,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.loadData();
    }

    loadData(): void {
        this.isLoading = true;
        this.signatureSettingService
            .page({
                page: this.pageIndex + 1,
                perPage: this.pageSize,
                search: this.searchTerm.trim(),
                is_active: this.statusFilter,
                order: [this.listSort],
            })
            .subscribe({
                next: (result) => {
                    this.items = result.items;
                    this.totalRecords = result.total;
                    this.isLoading = false;
                },
                error: (error) => {
                    console.error('Error loading signature settings:', error);
                    this.showAlert(
                        'error',
                        error?.error?.message || 'Unable to load Signature Setting data'
                    );
                    this.isLoading = false;
                },
            });
    }

    onSearch(): void {
        this.pageIndex = 0;
        this.loadData();
    }

    onStatusChange(): void {
        this.pageIndex = 0;
        this.loadData();
    }

    onPageChange(event: PageEvent): void {
        this.pageIndex = event.pageIndex;
        this.pageSize = event.pageSize;
        this.loadData();
    }

    onListSortChange(event: ListSortEvent): void {
        this.listSort = event;
        this.pageIndex = 0;
        this.loadData();
    }

    getRowNo(index: number): number {
        return this.pageIndex * this.pageSize + index + 1;
    }

    getEmployeeName(item: SignatureSetting): string {
        const firstname = item.firstname || item.employee?.firstname || '';
        const lastname = item.lastname || item.employee?.lastname || '';
        const fullName = [firstname, lastname].filter(Boolean).join(' ').trim();
        const initial = item.initial || item.employee?.initial || '';

        if (initial && fullName) {
            return `${initial}, ${fullName}`;
        }

        return fullName || item.employee_code || '-';
    }

    getDepartment(item: SignatureSetting): string {
        return item.department_name || item.employee?.department_name || '-';
    }

    onCreate(): void {
        this.router.navigate(['/settings/signatures/new']);
    }

    onEdit(item: SignatureSetting): void {
        this.router.navigate(['/settings/signatures/edit', item.id]);
    }

    onDelete(item: SignatureSetting): void {
        if (
            !confirm(
                `Delete signature setting for "${this.getEmployeeName(item)}"? The employee will no longer print as a signature.`
            )
        ) {
            return;
        }

        this.isLoading = true;
        this.signatureSettingService.delete(item.id).subscribe({
            next: () => {
                this.showAlert('success', 'Signature Setting deleted successfully');
                this.loadData();
            },
            error: (error) => {
                console.error('Error deleting signature setting:', error);
                this.showAlert(
                    'error',
                    error?.error?.message || 'Unable to delete signature setting'
                );
                this.isLoading = false;
            },
        });
    }

    private showAlert(type: FuseAlertType, message: string): void {
        this.alert = { type, message };
        setTimeout(() => {
            this.alert = null;
        }, 5000);
    }
}
