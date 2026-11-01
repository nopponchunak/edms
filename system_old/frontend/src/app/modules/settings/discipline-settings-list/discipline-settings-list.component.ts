import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { DisciplineService, Discipline } from 'app/core/services/discipline.service';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

@Component({
    selector: 'app-discipline-settings-list',
    standalone: true,
    imports: [
        ListTableSortModule,
        CommonModule,
        MatButtonModule,
        MatTableModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MatPaginatorModule,
        MatTooltipModule,
        FuseAlertComponent,
    ],
    templateUrl: './discipline-settings-list.component.html',
    styleUrls: ['./discipline-settings-list.component.scss'],
})
export class DisciplineSettingsListComponent implements OnInit {
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
    items: Discipline[] = [];
    isLoading = false;
    pageIndex = 0;
    pageSize = 10;
    totalRecords = 0;
    alert: { type: FuseAlertType; message: string } | null = null;

    constructor(
        private disciplineService: DisciplineService,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.loadData();
    }

    loadData(): void {
        this.isLoading = true;
        this.disciplineService
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
                    console.error('Error loading disciplines:', error);
                    this.alert = {
                        type: 'error',
                        message:
                            error?.error?.message ||
                            'Unable to load Discipline data',
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
        this.router.navigate(['/settings/disciplines/new']);
    }

    onEdit(item: Discipline): void {
        this.router.navigate(['/settings/disciplines/edit', item.id]);
    }

    onDelete(item: Discipline): void {
        if (
            !confirm(
                `Are you sure you want to delete "${item.name}"? This action cannot be undone.`
            )
        ) {
            return;
        }

        this.isLoading = true;
        this.disciplineService.delete(item.id).subscribe({
            next: () => {
                this.showAlert('success', 'Discipline deleted successfully');
                this.loadData();
            },
            error: (error) => {
                console.error('Error deleting discipline:', error);
                this.showAlert(
                    'error',
                    error?.error?.message || 'Unable to delete discipline'
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
