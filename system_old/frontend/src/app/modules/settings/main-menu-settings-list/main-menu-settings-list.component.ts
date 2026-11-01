import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { MainMenusService, MainMenuApiRow } from 'app/core/services/main-menus.service';
import { MainMenuCreateDialogComponent } from './main-menu-create-dialog.component';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

interface MainMenuListItem extends MainMenuApiRow {
    No: number;
}

@Component({
    selector: 'app-main-menu-settings-list',
    standalone: true,
    imports: [
        ListTableSortModule,
        CommonModule,
        FormsModule,
        MatButtonModule,
        MatCardModule,
        MatDialogModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatPaginatorModule,
        MatProgressSpinnerModule,
        MatTableModule,
        MatTooltipModule,
        FuseAlertComponent,
    ],
    templateUrl: './main-menu-settings-list.component.html',
    styleUrls: ['./main-menu-settings-list.component.scss'],
})
export class MainMenuSettingsListComponent implements OnInit {
    listSort: ListSortEvent = { column: 0, dir: 'asc' };
    displayedColumns: string[] = ['No', 'name', 'created_at', 'updated_at', 'action'];
    items: MainMenuListItem[] = [];
    isLoading = false;

    pageIndex = 0;
    pageSize = 10;
    totalRecords = 0;
    searchText = '';

    alert: { type: FuseAlertType; message: string } | null = null;

    constructor(
        private mainMenusService: MainMenusService,
        private router: Router,
        private dialog: MatDialog
    ) {}

    ngOnInit(): void {
        this.loadData();
    }

    loadData(): void {
        this.isLoading = true;
        this.mainMenusService
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
                    const startNo = this.pageIndex * this.pageSize;
                    this.items = (result.items ?? []).map((r, i) => ({
                        ...r,
                        No: r.No ?? startNo + i + 1,
                    }));
                    this.totalRecords = result.total ?? 0;
                    this.isLoading = false;
                },
                error: (error) => {
                    console.error('Error loading main menus:', error);
                    this.items = [];
                    this.totalRecords = 0;
                    this.showAlert(
                        'error',
                        error?.error?.message || 'Unable to load Main menu list'
                    );
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

    onSearch(): void {
        this.pageIndex = 0;
        this.loadData();
    }

    clearSearch(): void {
        if (!this.searchText) return;
        this.searchText = '';
        this.pageIndex = 0;
        this.loadData();
    }

    onOpenDetail(item: MainMenuApiRow): void {
        if (!item?.id) return;
        this.router.navigate(['/settings/main-menus', item.id]);
    }

    onCreate(): void {
        const dialogRef = this.dialog.open(MainMenuCreateDialogComponent, {
            width: '520px',
        });

        dialogRef.afterClosed().subscribe((name?: string) => {
            const trimmed = (name ?? '').trim();
            if (!trimmed) return;
            this.isLoading = true;
            this.mainMenusService.create({ name: trimmed }).subscribe({
                next: (res) => {
                    if (!res?.status) {
                        this.showAlert('error', res?.message || 'Create Main menu failed');
                        this.isLoading = false;
                        return;
                    }
                    this.showAlert('success', 'Main menu created successfully');
                    this.loadData();
                },
                error: (error) => {
                    console.error('Error creating main menu:', error);
                    this.showAlert(
                        'error',
                        error?.error?.message || 'Create Main menu failed'
                    );
                    this.isLoading = false;
                },
            });
        });
    }

    private showAlert(type: FuseAlertType, message: string): void {
        this.alert = { type, message };
        setTimeout(() => {
            this.alert = null;
        }, 5000);
    }
}

