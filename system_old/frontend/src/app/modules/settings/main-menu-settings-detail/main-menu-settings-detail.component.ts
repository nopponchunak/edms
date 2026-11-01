import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';

import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import {
    MainMenusService,
    MainMenuDetail,
    MenuTreeNode,
} from 'app/core/services/main-menus.service';
import {
    MainMenuAddMenusDialogComponent,
    ParentMenuOption,
    AddMenuRowResult,
} from './main-menu-add-menus-dialog.component';

interface MenuTreeRow {
    id: number;
    name: string;
    sort_order: number;
    parent_id: number | null;
    parent_name: string | null;
    level: number;
}

@Component({
    selector: 'app-main-menu-settings-detail',
    standalone: true,
    imports: [
        CommonModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MatTableModule,
        FuseAlertComponent,
    ],
    templateUrl: './main-menu-settings-detail.component.html',
    styleUrls: ['./main-menu-settings-detail.component.scss'],
})
export class MainMenuSettingsDetailComponent implements OnInit {
    displayedColumns: string[] = ['sort_order', 'name', 'parent', 'id'];
    isLoading = false;

    mainMenuId!: number;
    mainMenu: MainMenuDetail | null = null;
    menuRows: MenuTreeRow[] = [];

    alert: { type: FuseAlertType; message: string } | null = null;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private mainMenusService: MainMenusService,
        private dialog: MatDialog
    ) {}

    ngOnInit(): void {
        const idParam = this.route.snapshot.paramMap.get('id');
        const id = Number(idParam);
        if (!idParam || Number.isNaN(id) || id <= 0) {
            this.showAlert('error', 'Invalid Main menu id');
            return;
        }
        this.mainMenuId = id;
        this.loadDetail();
    }

    back(): void {
        this.router.navigate(['/settings/main-menus']);
    }

    loadDetail(): void {
        this.isLoading = true;
        this.mainMenusService.getById(this.mainMenuId).subscribe({
            next: (res) => {
                if (!res?.status) {
                    this.mainMenu = null;
                    this.menuRows = [];
                    this.showAlert('error', res?.message || 'Load detail failed');
                    this.isLoading = false;
                    return;
                }

                this.mainMenu = res.data;
                const tree = Array.isArray(res?.data?.MenusTree)
                    ? res.data.MenusTree
                    : [];

                this.menuRows = this.flattenMenusTree(tree);
                this.isLoading = false;
            },
            error: (error) => {
                console.error('Error loading main menu detail:', error);
                this.mainMenu = null;
                this.menuRows = [];
                this.showAlert(
                    'error',
                    error?.error?.message || 'Unable to load Main menu detail'
                );
                this.isLoading = false;
            },
        });
    }

    openAddMenus(): void {
        const parentOptions = this.buildParentOptions();
        const dialogRef = this.dialog.open(MainMenuAddMenusDialogComponent, {
            width: '1200px',
            maxWidth: '95vw',
            data: { parentOptions } as { parentOptions: ParentMenuOption[] },
        });

        dialogRef.afterClosed().subscribe((rows?: AddMenuRowResult[]) => {
            if (!rows || rows.length === 0) return;

            const payload = {
                name: rows.map((r) => r.name),
                main_menu_id: rows.map(() => this.mainMenuId),
                parent_id: rows.map((r) => r.parent_id ?? null),
                sort_order: rows.map((r) => r.sort_order),
            };

            this.isLoading = true;
            this.mainMenusService.createMenusBatch(payload).subscribe({
                next: (res) => {
                    if (!res?.status) {
                        this.showAlert('error', res?.message || 'Add menu failed');
                        this.isLoading = false;
                        return;
                    }
                    this.showAlert('success', 'Menus added successfully');
                    this.loadDetail();
                },
                error: (error) => {
                    console.error('Error adding menus:', error);
                    this.showAlert(
                        'error',
                        error?.error?.message || 'Add menu failed'
                    );
                    this.isLoading = false;
                },
            });
        });
    }

    trackById(_index: number, row: MenuTreeRow): number {
        return row.id;
    }

    private flattenMenusTree(tree: MenuTreeNode[]): MenuTreeRow[] {
        const rows: MenuTreeRow[] = [];

        const walk = (
            nodes: MenuTreeNode[],
            level: number,
            parent: { id: number; name: string } | null
        ) => {
            const sorted = [...nodes].sort((a, b) => {
                const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
                if (so !== 0) return so;
                return (a.id ?? 0) - (b.id ?? 0);
            });

            for (const node of sorted) {
                rows.push({
                    id: node.id,
                    name: node.name,
                    sort_order: node.sort_order,
                    parent_id: node.parent_id ?? null,
                    parent_name: parent?.name ?? null,
                    level,
                });
                if (Array.isArray(node.children) && node.children.length > 0) {
                    walk(node.children, level + 1, { id: node.id, name: node.name });
                }
            }
        };

        walk(tree ?? [], 0, null);
        return rows;
    }

    private buildParentOptions(): ParentMenuOption[] {
        return this.menuRows.map((r) => ({
            id: r.id,
            label: `${'—'.repeat(r.level)} ${r.name}`.trim(),
        }));
    }

    private showAlert(type: FuseAlertType, message: string): void {
        this.alert = { type, message };
        setTimeout(() => {
            this.alert = null;
        }, 5000);
    }
}
