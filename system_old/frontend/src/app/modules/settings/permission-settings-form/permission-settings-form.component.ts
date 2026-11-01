import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, TemplateRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { PermissionService, MainMenu, MenuItem, PermissionActionKey } from 'app/core/services/permission.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ToastrService } from 'ngx-toastr';

const PERMISSION_ACTIONS: Array<{ key: PermissionActionKey; label: string }> = [
    { key: 'create', label: 'Create' },
    { key: 'view_own', label: 'View Own' },
    { key: 'edit_own', label: 'Edit Own' },
    { key: 'delete_own', label: 'Delete Own' },
    { key: 'view_all', label: 'View All' },
    { key: 'edit_all', label: 'Edit All' },
    { key: 'delete_all', label: 'Delete All' },
];

const RESTRICTED_PERMISSION_MENU_KEYS = new Set(['mm6.audit_log_settings']);
const RESTRICTED_PERMISSION_MENU_PATHS = new Set(['/settings/audit-logs']);

interface SelectedPermission extends Record<PermissionActionKey, boolean> {
    menu_id: number;
    select_all: boolean;
}

@Component({
    selector: 'app-permission-settings-form',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatButtonModule,
        MatCardModule,
        MatFormFieldModule,
        MatInputModule,
        MatIconModule,
        MatCheckboxModule,
        MatProgressSpinnerModule,
        MatExpansionModule,
    ],
    templateUrl: './permission-settings-form.component.html',
    styleUrls: ['./permission-settings-form.component.scss'],
})
export class PermissionSettingsFormComponent implements OnInit {
    @ViewChild('menuTreeItem', { static: true }) menuTreeItemTemplate!: TemplateRef<any>;
    
    permissionForm: FormGroup;
    mainMenus: MainMenu[] = [];
    selectedPermissions: Map<number, SelectedPermission> = new Map();
    permissionActions = PERMISSION_ACTIONS;
    
    isLoading = false;
    isLoadingMenus = false;
    
    permissionId: number | null = null;
    isEditMode = false;

    constructor(
        private fb: FormBuilder,
        private permissionService: PermissionService,
        private router: Router,
        private route: ActivatedRoute,
        private fuseConfirmationService: FuseConfirmationService,
        private toastr: ToastrService
    ) {
        this.permissionForm = this.fb.group({
            name: ['', [Validators.required]],
        });
    }

    ngOnInit(): void {
        // Check if editing
        this.route.params.subscribe(params => {
            if (params['id']) {
                this.permissionId = +params['id'];
                this.isEditMode = true;
                this.loadPermission();
            }
        });
        
        this.loadMainMenus();
    }

    loadPermission(): void {
        if (!this.permissionId) return;

        this.isLoading = true;
        
        // Load permission basic info
        this.permissionService.getPermission(this.permissionId).subscribe({
            next: (response) => {
                if (response.status && response.data) {
                    this.permissionForm.patchValue({
                        name: response.data.name,
                    });
                }
                this.isLoading = false;
            },
            error: (error) => {
                console.error('Error loading permission:', error);
                this.isLoading = false;
                this.toastr.error(error?.error?.message || 'Unable to load permission data. Please try again.');
            },
        });

        // Load permission menu data
        this.permissionService.getPermissionMenu(this.permissionId).subscribe({
            next: (response) => {
                if (response.status && response.data) {
                    // Map permission menu data to selectedPermissions
                    response.data.forEach((item: any) => {
                        if (
                            !item.menu ||
                            this.isRestrictedPermissionMenu(item.menu) ||
                            !this.isAssignableMenu(item.menu)
                        ) {
                            return;
                        }

                        const permission = this.createSelectedPermission(item.menu_id);
                        permission.create = this.isActionEnabled(item, 'create', 'save');
                        permission.view_own = this.isActionEnabled(item, 'view_own', 'view');
                        permission.edit_own = this.isActionEnabled(item, 'edit_own', 'edit');
                        permission.delete_own = this.isActionEnabled(item, 'delete_own', 'delete');
                        permission.view_all = this.isActionEnabled(item, 'view_all', 'view');
                        permission.edit_all = this.isActionEnabled(item, 'edit_all', 'edit');
                        permission.delete_all = this.isActionEnabled(item, 'delete_all', 'delete');
                        permission.select_all = this.areAllActionsSelected(permission);
                        this.selectedPermissions.set(item.menu_id, permission);
                    });
                }
            },
            error: (error) => {
                console.error('Error loading permission menu:', error);
                // Don't show error alert here, just log it
                // User can still select permissions manually
            },
        });
    }

    loadMainMenus(): void {
        this.isLoadingMenus = true;

        this.permissionService.getMainMenu().subscribe({
            next: (response) => {
                if (response.status && response.data) {
                    this.mainMenus = this.filterRestrictedPermissionMenus(response.data);
                } else {
                    this.toastr.error(response.message || 'Unable to load menu data');
                }
                this.isLoadingMenus = false;
            },
            error: (error) => {
                console.error('Error loading main menus:', error);
                this.isLoadingMenus = false;
                this.toastr.error(error?.error?.message || 'Unable to load menu data. Please try again.');
            },
        });
    }

    togglePermission(menu: MenuItem, permissionType: PermissionActionKey, event?: any): void {
        if (!this.isAssignableMenu(menu)) {
            return;
        }

        const menuId = menu.id;
        if (!this.selectedPermissions.has(menuId)) {
            this.selectedPermissions.set(menuId, this.createSelectedPermission(menuId));
        }

        const permission = this.selectedPermissions.get(menuId)!;
        if (event && event.checked !== undefined) {
            permission[permissionType] = event.checked;
        } else {
            permission[permissionType] = !permission[permissionType];
        }

        // Update select_all based on all permissions
        permission.select_all = this.areAllActionsSelected(permission);
    }

    isPermissionSelected(menuId: number, permissionType: PermissionActionKey): boolean {
        const permission = this.selectedPermissions.get(menuId);
        return permission ? permission[permissionType] : false;
    }

    isMenuActionSelected(menu: MenuItem, permissionType: PermissionActionKey): boolean {
        if (this.isAssignableMenu(menu)) {
            return this.isPermissionSelected(menu.id, permissionType);
        }

        return this.collectAssignableMenuIds([menu]).some((menuId) =>
            this.isPermissionSelected(menuId, permissionType)
        );
    }

    isMenuActionPartiallySelected(menu: MenuItem, permissionType: PermissionActionKey): boolean {
        if (this.isAssignableMenu(menu)) {
            return false;
        }

        const menuIds = this.collectAssignableMenuIds([menu]);
        if (menuIds.length === 0) {
            return false;
        }

        const selectedCount = menuIds.filter((menuId) =>
            this.isPermissionSelected(menuId, permissionType)
        ).length;

        return selectedCount > 0 && selectedCount < menuIds.length;
    }

    selectAllInMainMenu(mainMenuId: number, select: boolean): void {
        const mainMenu = this.mainMenus.find(m => m.id === mainMenuId);
        if (!mainMenu) return;

        const menuIds = this.collectAssignableMenuIds(mainMenu.MenusTree);
        menuIds.forEach(menuId => {
            if (!this.selectedPermissions.has(menuId)) {
                this.selectedPermissions.set(menuId, this.createSelectedPermission(menuId, select));
            } else {
                const perm = this.selectedPermissions.get(menuId)!;
                this.permissionActions.forEach(action => {
                    perm[action.key] = select;
                });
                perm.select_all = select;
            }
        });
    }

    isAllSelectedInMainMenu(mainMenuId: number): boolean {
        const mainMenu = this.mainMenus.find(m => m.id === mainMenuId);
        if (!mainMenu) return false;

        const menuIds = this.collectAssignableMenuIds(mainMenu.MenusTree);
        if (menuIds.length === 0) return false;

        return menuIds.every(menuId => {
            const perm = this.selectedPermissions.get(menuId);
            return perm && perm.select_all && this.areAllActionsSelected(perm);
        });
    }

    onSubmit(): void {
        if (this.isLoading) return;

        if (this.permissionForm.invalid) {
            this.toastr.error('Please fill in all required fields');
            return;
        }

        const confirmation = this.fuseConfirmationService.open({
            title: this.isEditMode ? 'Confirm update' : 'Confirm submit',
            message: this.isEditMode
                ? 'Are you sure you want to update this permission?'
                : 'Are you sure you want to create this permission?',
            icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
            actions: {
                cancel: { show: true, label: 'Cancel' },
                confirm: { show: true, label: this.isEditMode ? 'Update' : 'Create', color: 'primary' },
            },
            dismissible: false,
        });

        confirmation.afterClosed().subscribe((result) => {
            if (result !== 'confirmed') return;
            this.submitForm();
        });
    }

    private submitForm(): void {
        // Collect all menu IDs from all main menus
        const allMenuIds: number[] = [];
        this.mainMenus.forEach(mainMenu => {
            allMenuIds.push(...this.collectAssignableMenuIds(mainMenu.MenusTree));
        });

        this.isLoading = true;

        // Create menu array with all menus (selected or not)
        const menu = allMenuIds.map(menuId => {
            const perm = this.selectedPermissions.get(menuId);
            const create = perm?.create ? 1 : 0;
            const viewOwn = perm?.view_own ? 1 : 0;
            const editOwn = perm?.edit_own ? 1 : 0;
            const deleteOwn = perm?.delete_own ? 1 : 0;
            const viewAll = perm?.view_all ? 1 : 0;
            const editAll = perm?.edit_all ? 1 : 0;
            const deleteAll = perm?.delete_all ? 1 : 0;

            return {
                menu_id: menuId,
                select_all: perm ? this.areAllActionsSelected(perm) : false,
                create,
                view_own: viewOwn,
                edit_own: editOwn,
                delete_own: deleteOwn,
                view_all: viewAll,
                edit_all: editAll,
                delete_all: deleteAll,
                view: viewOwn || viewAll ? 1 : 0,
                edit: editOwn || editAll ? 1 : 0,
                save: create || editOwn || editAll ? 1 : 0,
                delete: deleteOwn || deleteAll ? 1 : 0,
            };
        });

        const requestData = {
            name: this.permissionForm.value.name,
            menu: menu,
        };

        if (this.isEditMode && this.permissionId) {
            // Update existing permission
            this.permissionService.updatePermission(this.permissionId, requestData).subscribe({
                next: (response) => {
                    this.isLoading = false;
                    if (response.status || response.code === '200') {
                        this.toastr.success('Permission updated successfully!');
                        setTimeout(() => {
                            this.router.navigate(['/settings/permissions']);
                        }, 1500);
                    } else {
                        this.toastr.error(response.message || 'Failed to update permission');
                    }
                },
                error: (error) => {
                    console.error('Error updating permission:', error);
                    this.isLoading = false;
                    this.toastr.error(error?.error?.message || 'Failed to update permission. Please try again.');
                },
            });
        } else {
            // Create new permission
            this.permissionService.createPermission(requestData).subscribe({
                next: (response) => {
                    this.isLoading = false;
                    if (response.status || response.code === '200') {
                        this.toastr.success('Permission created successfully!');
                        setTimeout(() => {
                            this.router.navigate(['/settings/permissions']);
                        }, 1500);
                    } else {
                        this.toastr.error(response.message || 'Failed to create permission');
                    }
                },
                error: (error) => {
                    console.error('Error creating permission:', error);
                    this.isLoading = false;
                    this.toastr.error(error?.error?.message || 'Failed to create permission. Please try again.');
                },
            });
        }
    }

    onCancel(): void {
        this.router.navigate(['/settings/permissions']);
    }

    renderMenuTree(menus: MenuItem[], level: number = 0): void {
        // This is handled in the template
    }

    private createSelectedPermission(menuId: number, selected = false): SelectedPermission {
        return {
            menu_id: menuId,
            select_all: selected,
            create: selected,
            view_own: selected,
            edit_own: selected,
            delete_own: selected,
            view_all: selected,
            edit_all: selected,
            delete_all: selected,
        };
    }

    private areAllActionsSelected(permission: SelectedPermission): boolean {
        return this.permissionActions.every(action => permission[action.key]);
    }

    isAssignableMenu(menu: MenuItem): boolean {
        const hasChildren = (menu.children ?? []).length > 0;
        const hasPath = (menu.path ?? '').trim() !== '';
        return hasPath && !hasChildren;
    }

    isHeaderMenu(menu: MenuItem): boolean {
        return !this.isAssignableMenu(menu);
    }

    private collectAssignableMenuIds(menus: MenuItem[]): number[] {
        let ids: number[] = [];
        (menus ?? []).forEach((menu) => {
            if (this.isAssignableMenu(menu)) {
                ids.push(menu.id);
                return;
            }

            if (menu.children && menu.children.length > 0) {
                ids = ids.concat(this.collectAssignableMenuIds(menu.children));
            }
        });

        return ids;
    }

    private isActionEnabled(
        item: any,
        key: PermissionActionKey,
        legacyKey?: 'view' | 'edit' | 'save' | 'delete'
    ): boolean {
        if (item[key] !== undefined && item[key] !== null) {
            return Number(item[key]) === 1;
        }

        return legacyKey ? Number(item[legacyKey] ?? 0) === 1 : false;
    }

    private filterRestrictedPermissionMenus(mainMenus: MainMenu[]): MainMenu[] {
        return (mainMenus ?? [])
            .map((mainMenu) => {
                const menus = (mainMenu.Menus ?? []).filter(
                    (menu) => !this.isRestrictedPermissionMenu(menu)
                );
                const menusTree = this.filterRestrictedMenuTree(mainMenu.MenusTree ?? []);

                return {
                    ...mainMenu,
                    Menus: menus,
                    MenusTree: menusTree,
                };
            })
            .filter((mainMenu) => (mainMenu.MenusTree ?? []).length > 0);
    }

    private filterRestrictedMenuTree(menus: MenuItem[]): MenuItem[] {
        return (menus ?? [])
            .filter((menu) => !this.isRestrictedPermissionMenu(menu))
            .map((menu) => ({
                ...menu,
                children: this.filterRestrictedMenuTree(menu.children ?? []),
            }));
    }

    private isRestrictedPermissionMenu(menu: Partial<MenuItem> | null | undefined): boolean {
        const key = (menu?.key ?? '').trim();
        const path = (menu?.path ?? '').trim();
        return (
            RESTRICTED_PERMISSION_MENU_KEYS.has(key) ||
            RESTRICTED_PERMISSION_MENU_PATHS.has(path)
        );
    }

}
