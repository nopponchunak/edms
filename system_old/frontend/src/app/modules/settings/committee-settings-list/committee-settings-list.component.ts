import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';
import {
    CommitteesService,
    CommitteeApiRow,
} from 'app/core/services/committees.service';

@Component({
    selector: 'app-committee-settings-list',
    standalone: true,
    imports: [
        ListTableSortModule,
        CommonModule,
        MatButtonModule,
        MatCardModule,
        MatTableModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MatPaginatorModule,
        MatDialogModule,
        MatTooltipModule,
        FuseAlertComponent,
    ],
    templateUrl: './committee-settings-list.component.html',
    styleUrls: ['./committee-settings-list.component.scss'],
})
export class CommitteeSettingsListComponent implements OnInit {
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
    items: CommitteeApiRow[] = [];
    isLoading = false;
    pageIndex = 0;
    pageSize = 10;
    totalRecords = 0;
    searchText = '';

    alert: { type: FuseAlertType; message: string } | null = null;

    constructor(
        private committeesService: CommitteesService,
        private router: Router,
        private dialog: MatDialog
    ) {}

    ngOnInit(): void {
        this.loadData();
    }

    loadData(): void {
        this.isLoading = true;
        this.committeesService
            .list({
                page: this.pageIndex + 1,
                perPage: this.pageSize,
                search: this.searchText,
                draw: 1,
                orderColumnIndex: this.listSort.column,
                orderDir: this.listSort.dir,
            })
            .subscribe({
                next: (result) => {
                    this.items = result.items;
                    this.totalRecords = result.total;
                    this.isLoading = false;
                },
                error: (error) => {
                    console.error('Error loading committees:', error);
                    this.alert = {
                        type: 'error',
                        message:
                            error?.error?.message ||
                            'Unable to load Committee data',
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

    onListSortChange(event: ListSortEvent): void {
        this.listSort = event;
        this.pageIndex = 0;
        this.loadData();
    }

    onSearchChange(value: string): void {
        this.searchText = value;
        this.pageIndex = 0;
        this.loadData();
    }

    onCreate(): void {
        this.router.navigate(['/settings/committees/new']);
    }

    onEdit(item: CommitteeApiRow): void {
        this.router.navigate(['/settings/committees/edit', item.id]);
    }

    onDelete(item: CommitteeApiRow): void {
        if (
            !confirm(
                `Are you sure you want to delete "${item.name}"? This action cannot be undone.`
            )
        ) {
            return;
        }

        this.isLoading = true;
        this.committeesService.delete(item.id).subscribe({
            next: () => {
                this.showAlert('success', 'Committee deleted successfully');
                this.loadData();
            },
            error: (error) => {
                console.error('Error deleting committee:', error);
                this.showAlert(
                    'error',
                    error?.error?.message || 'Unable to delete committee'
                );
                this.isLoading = false;
            },
        });
    }

    onFirstSetup(): void {
        const requiredNames = ['ACSC', 'ACSL', 'VVE'];
        this.isLoading = true;

        this.committeesService
            .list({
                page: 1,
                perPage: 100,
            })
            .subscribe({
                next: (result) => {
                    const existingNames = result.items.map((i) =>
                        i.name.toUpperCase()
                    );
                    const missingNames = requiredNames.filter(
                        (name) => !existingNames.includes(name)
                    );

                    if (missingNames.length === 0) {
                        this.showAlert(
                            'info',
                            'All required committees (ACSC, ACSL, VVE) already exist.'
                        );
                        this.isLoading = false;
                        return;
                    }

                    const creations = missingNames.map((name) =>
                        this.committeesService.create({
                            committee_name: name,
                            employee_codes: [],
                        })
                    );

                    forkJoin(creations).subscribe({
                        next: () => {
                            this.showAlert(
                                'success',
                                `Successfully created missing committees: ${missingNames.join(
                                    ', '
                                )}`
                            );
                            this.loadData();
                        },
                        error: (error) => {
                            console.error('Error creating committees:', error);
                            this.showAlert(
                                'error',
                                'Failed to create some committees.'
                            );
                            this.isLoading = false;
                        },
                    });
                },
                error: (error) => {
                    console.error('Error checking committees:', error);
                    this.showAlert(
                        'error',
                        'Failed to check existing committees.'
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


