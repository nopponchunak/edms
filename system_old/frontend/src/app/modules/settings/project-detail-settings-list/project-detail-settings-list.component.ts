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
import { ProjectDetailService, ProjectDetail } from 'app/core/services/project-detail.service';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

@Component({
    selector: 'app-project-detail-settings-list',
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
    templateUrl: './project-detail-settings-list.component.html',
    styleUrls: ['./project-detail-settings-list.component.scss'],
})
export class ProjectDetailSettingsListComponent implements OnInit {
    listSort: ListSortEvent = { column: 1, dir: 'asc' };
    displayedColumns: string[] = [
        'no',
        'code',
        'name',
        'created_at',
        'updated_at',
        'action',
    ];
    items: ProjectDetail[] = [];
    isLoading = false;
    pageIndex = 0;
    pageSize = 10;
    totalRecords = 0;
    private draw = 1;
    alert: { type: FuseAlertType; message: string } | null = null;

    constructor(
        private projectDetailService: ProjectDetailService,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.loadData();
    }

    loadData(): void {
        this.isLoading = true;
        const start = this.pageIndex * this.pageSize;
        this.projectDetailService
            .listPage({
                draw: this.draw,
                start,
                length: this.pageSize,
                search: {},
                order: [this.listSort],
                is_active: 1,
            })
            .subscribe({
                next: (result) => {
                    this.items = result.data ?? [];
                    this.totalRecords = result.recordsTotal ?? 0;
                    this.isLoading = false;
                },
                error: (error) => {
                    console.error('Error loading project details:', error);
                    this.alert = {
                        type: 'error',
                        message:
                            error?.error?.message ||
                            'Unable to load Project Detail data',
                    };
                    this.isLoading = false;
                },
            });
    }

    onPageChange(event: PageEvent): void {
        this.pageIndex = event.pageIndex;
        this.pageSize = event.pageSize;
        this.draw += 1;
        this.loadData();
    }

    getRowNo(index: number): number {
        return this.pageIndex * this.pageSize + index + 1;
    }

    onCreate(): void {
        this.router.navigate(['/settings/project-details/new']);
    }

    onEdit(item: ProjectDetail): void {
        this.router.navigate(['/settings/project-details/edit', item.id]);
    }

    onDelete(item: ProjectDetail): void {
        if (
            !confirm(
                `Are you sure you want to delete "${item.name}"? This action cannot be undone.`
            )
        ) {
            return;
        }

        this.isLoading = true;
        this.projectDetailService.delete(item.id).subscribe({
            next: () => {
                this.showAlert('success', 'Project Detail deleted successfully');
                this.loadData();
            },
            error: (error) => {
                console.error('Error deleting project detail:', error);
                this.showAlert(
                    'error',
                    error?.error?.message || 'Unable to delete project detail'
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
