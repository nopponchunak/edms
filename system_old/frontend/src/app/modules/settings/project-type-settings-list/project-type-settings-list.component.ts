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
import { ProjectTypeService, ProjectType } from 'app/core/services/project-type.service';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

@Component({
    selector: 'app-project-type-settings-list',
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
    templateUrl: './project-type-settings-list.component.html',
    styleUrls: ['./project-type-settings-list.component.scss'],
})
export class ProjectTypeSettingsListComponent implements OnInit {
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
    items: ProjectType[] = [];
    isLoading = false;
    pageIndex = 0;
    pageSize = 25;
    totalRecords = 0;
    alert: { type: FuseAlertType; message: string } | null = null;

    constructor(
        private projectTypeService: ProjectTypeService,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.loadData();
    }

    loadData(): void {
        this.isLoading = true;
        this.projectTypeService
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
                    console.error('Error loading project types:', error);
                    this.alert = {
                        type: 'error',
                        message:
                            error?.error?.message ||
                            'Unable to load Project Type data',
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
        this.router.navigate(['/settings/project-types/new']);
    }

    onEdit(item: ProjectType): void {
        this.router.navigate(['/settings/project-types/edit', item.id]);
    }

    onDelete(item: ProjectType): void {
        if (
            !confirm(
                `Are you sure you want to delete "${item.name}"? This action cannot be undone.`
            )
        ) {
            return;
        }

        this.isLoading = true;
        this.projectTypeService.delete(item.id).subscribe({
            next: () => {
                this.showAlert('success', 'Project Type deleted successfully');
                this.loadData();
            },
            error: (error) => {
                console.error('Error deleting project type:', error);
                this.showAlert(
                    'error',
                    error?.error?.message || 'Unable to delete project type'
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
