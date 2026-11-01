import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { SupplierType, SupplierTypeService } from 'app/core/services/supplier-type.service';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

@Component({
    selector: 'app-supplier-type-settings-list',
    standalone: true,
    imports: [
        ListTableSortModule,
        CommonModule,
        MatButtonModule,
        MatIconModule,
        MatPaginatorModule,
        MatProgressSpinnerModule,
        MatTableModule,
        MatTooltipModule,
        FuseAlertComponent,
    ],
    templateUrl: './supplier-type-settings-list.component.html',
    styleUrls: ['./supplier-type-settings-list.component.scss'],
})
export class SupplierTypeSettingsListComponent implements OnInit {
    listSort: ListSortEvent = { column: 1, dir: 'asc' };
    displayedColumns: string[] = [
        'no',
        'code',
        'name',
        'detail',
        'is_active',
        'created_at',
        'updated_at',
        'action',
    ];
    items: SupplierType[] = [];
    isLoading = false;
    pageIndex = 0;
    pageSize = 25;
    totalRecords = 0;
    isSeedingDefaults = false;
    alert: { type: FuseAlertType; message: string } | null = null;

    constructor(
        private supplierTypeService: SupplierTypeService,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.loadData();
    }

    loadData(): void {
        this.isLoading = true;
        this.supplierTypeService
            .page({
                page: this.pageIndex + 1,
                perPage: this.pageSize,
                order: [this.listSort],
                is_active: 1,
            })
            .subscribe({
                next: (result) => {
                    this.items = result.items;
                    this.totalRecords = result.total;
                    this.isLoading = false;
                },
                error: (error) => {
                    console.error('Error loading supplier types:', error);
                    this.alert = {
                        type: 'error',
                        message:
                            error?.error?.message ||
                            'Unable to load Supplier Type data',
                    };
                    this.isLoading = false;
                },
            });
    }

    onPageChange(event: PageEvent): void {
        this.pageIndex = event.pageIndex;
        this.pageSize = event.pageSize;
        this.loadData();
    }

    getRowNo(index: number): number {
        return this.pageIndex * this.pageSize + index + 1;
    }

    onCreate(): void {
        this.router.navigate(['/settings/supplier-types/new']);
    }

    onSeedDefaults(): void {
        if (this.isSeedingDefaults) {
            return;
        }

        this.isSeedingDefaults = true;
        this.supplierTypeService.seedDefaults().subscribe({
            next: (result) => {
                this.showAlert(
                    'success',
                    `Default Supplier Types added. Created: ${result.created}, Restored: ${result.restored}, Existing: ${result.existing}.`
                );
                this.pageIndex = 0;
                this.loadData();
                this.isSeedingDefaults = false;
            },
            error: (error) => {
                console.error('Error adding default supplier types:', error);
                this.showAlert(
                    'error',
                    error?.error?.message || 'Unable to add default Supplier Types'
                );
                this.isSeedingDefaults = false;
            },
        });
    }

    onEdit(item: SupplierType): void {
        this.router.navigate(['/settings/supplier-types/edit', item.id]);
    }

    onDelete(item: SupplierType): void {
        if (
            !confirm(
                `Are you sure you want to delete "${item.name}"? This action cannot be undone.`
            )
        ) {
            return;
        }

        this.isLoading = true;
        this.supplierTypeService.delete(item.id).subscribe({
            next: () => {
                this.showAlert('success', 'Supplier Type deleted successfully');
                this.loadData();
            },
            error: (error) => {
                console.error('Error deleting supplier type:', error);
                this.showAlert(
                    'error',
                    error?.error?.message || 'Unable to delete supplier type'
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
    onListSortChange(event: ListSortEvent): void {
        this.listSort = event;
        this.pageIndex = 0;
        this.loadData();
    }
}
