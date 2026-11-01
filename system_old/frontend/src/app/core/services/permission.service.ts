import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface PermissionItem {
    id: number;
    name: string;
    create_by: string | null;
    update_by: string | null;
    created_at: string | null;
    updated_at: string | null;
    No: number;
}

export interface PermissionPageResponse {
    code: string;
    status: boolean;
    message: string;
    data: {
        current_page: number;
        data: PermissionItem[];
        first_page_url: string;
        from: number;
        last_page: number;
        last_page_url: string;
        links: Array<{
            url: string | null;
            label: string;
            active: boolean;
        }>;
        next_page_url: string | null;
        path: string;
        per_page: number;
        prev_page_url: string | null;
        to: number;
        total: number;
    };
}

export interface MenuItem {
    id: number;
    main_menu_id: number;
    parent_id: number | null;
    name: string;
    sort_order: number;
    key: string;
    path: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    children?: MenuItem[];
}

export interface MainMenu {
    id: number;
    name: string;
    sort_order: number;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    No: number;
    Menus: MenuItem[];
    MenusTree: MenuItem[];
}

export interface MainMenuResponse {
    code: string;
    status: boolean;
    message: string;
    data: MainMenu[];
}

export interface PermissionDetail {
    id: number;
    name: string;
    create_by: string | null;
    update_by: string | null;
    created_at: string | null;
    updated_at: string | null;
    deleted_at: string | null;
}

export interface PermissionDetailResponse {
    code: string;
    status: boolean;
    message: string;
    data: PermissionDetail;
}

export interface PermissionAssignedUser {
    id: number;
    permission_id: number;
    username: string;
    code: string | null;
    name: string | null;
    email: string | null;
    image: string | null;
    status: string | null;
    create_by: string | null;
    update_by: string | null;
    created_at: string | null;
    updated_at: string | null;
    No?: number;
}

export interface PermissionAssignedUsersResponse {
    code: string;
    status: boolean;
    message: string;
    data: PermissionAssignedUser[];
}

export type PermissionActionKey =
    | 'create'
    | 'view_own'
    | 'edit_own'
    | 'delete_own'
    | 'view_all'
    | 'edit_all'
    | 'delete_all';

export interface PermissionMenuPayload {
    menu_id: number;
    select_all: boolean;
    create: number;
    view_own: number;
    edit_own: number;
    delete_own: number;
    view_all: number;
    edit_all: number;
    delete_all: number;
    view: number;
    edit: number;
    save: number;
    delete: number;
}

export interface CreatePermissionRequest {
    name: string;
    menu: PermissionMenuPayload[];
}

export interface UpdatePermissionRequest extends CreatePermissionRequest {}

export interface PermissionMenuItem {
    menu_id: number;
    menu: {
        id: number;
        main_menu_id: number;
        parent_id: number | null;
        name: string;
        sort_order: number;
        key: string;
        path: string | null;
        created_at: string;
        updated_at: string;
        deleted_at: string | null;
        main_menu: {
            id: number;
            name: string;
            created_at: string;
            updated_at: string;
            deleted_at: string | null;
        };
    };
    view: number;
    edit: number;
    save: number;
    delete: number;
    create: number;
    view_own: number;
    edit_own: number;
    delete_own: number;
    view_all: number;
    edit_all: number;
    delete_all: number;
}

export interface PermissionMenuResponse {
    code: string;
    status: boolean;
    message: string;
    data: PermissionMenuItem[];
}

@Injectable({
    providedIn: 'root'
})
export class PermissionService {
    constructor(private apiService: ApiService) {}

    /**
     * Get permission page with pagination (DataTables format)
     */
    getPermissionPage(params: {
        draw: number;
        columns: Array<{ data: string }>;
        order: Array<{ column: number; dir: 'asc' | 'desc' }>;
        start: number;
        length: number;
        search: { value: string; regex: boolean };
    }): Observable<PermissionPageResponse> {
        return this.apiService.getPermissionPage(params);
    }

    /**
     * Get main menu with menus tree
     */
    getMainMenu(): Observable<MainMenuResponse> {
        return this.apiService.getMainMenu();
    }

    /**
     * Get permission menu data
     */
    getPermissionMenu(permissionId: number): Observable<PermissionMenuResponse> {
        return this.apiService.getPermissionMenu(permissionId);
    }

    /**
     * Get permission by ID
     */
    getPermission(id: string | number): Observable<PermissionDetailResponse> {
        return this.apiService.getPermission(id);
    }

    /**
     * Get users assigned to a permission
     */
    getUsersByPermissionId(id: string | number): Observable<PermissionAssignedUsersResponse> {
        return this.apiService.getUsersByPermissionId(id);
    }

    /**
     * Create permission
     */
    createPermission(data: CreatePermissionRequest): Observable<any> {
        return this.apiService.createPermission(data);
    }

    /**
     * Update permission
     */
    updatePermission(id: string | number, data: UpdatePermissionRequest): Observable<any> {
        return this.apiService.updatePermission(id, data);
    }

    /**
     * Get permissions list
     */
    getPermissionsList(): Observable<any> {
        return this.apiService.getPermissionsList();
    }
}
