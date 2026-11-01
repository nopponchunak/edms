import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from 'environments/environment';

export type DtOrderDir = 'asc' | 'desc';

export interface DtColumn {
    data: string;
}

export interface DtOrder {
    column: number;
    dir: DtOrderDir;
}

export interface DtSearch {
    value: string;
    regex: boolean;
}

export interface MainMenuPageRequest {
    draw: number;
    columns: DtColumn[];
    order: DtOrder[];
    start: number;
    length: number;
    search: DtSearch;
}

export interface MainMenuApiRow {
    id: number;
    name: string;
    created_at?: string | null;
    updated_at?: string | null;
    deleted_at?: string | null;
    No?: number;
}

export interface MenuTreeNode {
    id: number;
    main_menu_id: number;
    parent_id: number | null;
    name: string;
    sort_order: number;
    created_at?: string | null;
    updated_at?: string | null;
    deleted_at?: string | null;
    children: MenuTreeNode[];
}

export interface MainMenuDetail {
    id: number;
    name: string;
    created_at?: string | null;
    updated_at?: string | null;
    deleted_at?: string | null;
    Menus?: any[];
    MenusTree: MenuTreeNode[];
}

interface ApiResponse<T> {
    code: string;
    status: boolean;
    message: string;
    data: T;
}

interface DataTablesPage<T> {
    current_page: number;
    data: T[];
    per_page: number;
    total: number;
}

export interface MainMenuPageResult {
    items: MainMenuApiRow[];
    total: number;
    page: number;
    perPage: number;
}

export interface CreateMainMenuRequest {
    name: string;
}

export interface CreateMenusBatchRequest {
    name: string[];
    main_menu_id: number[];
    parent_id: Array<number | null>;
    sort_order: number[];
}

@Injectable({ providedIn: 'root' })
export class MainMenusService {
    private readonly base =
        (environment as any).apiUrl ?? (environment as any).apiBase;
    private readonly apiBase = `${this.base}/api`;

    constructor(private http: HttpClient) {}

    list(opts: {
        page: number;
        perPage: number;
        search?: string;
        draw?: number;
        orderColumnIndex?: number;
        orderDir?: DtOrderDir;
    }): Observable<MainMenuPageResult> {
        const page = opts.page ?? 1;
        const perPage = opts.perPage ?? 10;
        const keyword = (opts.search ?? '').trim();

        const body: MainMenuPageRequest = {
            draw: opts.draw ?? 1,
            columns: [
                { data: 'No' },
                { data: 'name' },
                { data: 'created_at' },
                { data: 'updated_at' },
                { data: 'action' },
            ],
            order: [
                {
                    column: opts.orderColumnIndex ?? 0,
                    dir: opts.orderDir ?? 'asc',
                },
            ],
            start: (page - 1) * perPage,
            length: perPage,
            search: { value: keyword, regex: false },
        };

        return this.http
            .post<ApiResponse<DataTablesPage<MainMenuApiRow>>>(
                `${this.apiBase}/main_menu_page`,
                body
            )
            .pipe(
                map((res) => {
                    const p = res?.data;
                    return {
                        items: p?.data ?? [],
                        total: p?.total ?? 0,
                        page: p?.current_page ?? page,
                        perPage: p?.per_page ?? perPage,
                    };
                })
            );
    }

    create(payload: CreateMainMenuRequest): Observable<ApiResponse<any>> {
        return this.http.post<ApiResponse<any>>(
            `${this.apiBase}/main_menu`,
            payload
        );
    }

    getById(id: number | string): Observable<ApiResponse<MainMenuDetail>> {
        return this.http.get<ApiResponse<MainMenuDetail>>(
            `${this.apiBase}/main_menu/${id}`
        );
    }

    /**
     * Create menus under a main menu (batch).
     *
     * NOTE: If your backend uses a different endpoint (e.g. /api/menus),
     * change it here.
     */
    createMenusBatch(payload: CreateMenusBatchRequest): Observable<ApiResponse<any>> {
        return this.http.post<ApiResponse<any>>(`${this.apiBase}/menu`, payload);
    }

    /**
     * Delete a menu by id.
     *
     * NOTE: If your backend uses a different endpoint (e.g. /api/menus/:id),
     * change it here.
     */
    deleteMenu(id: number | string): Observable<ApiResponse<any>> {
        return this.http.delete<ApiResponse<any>>(`${this.apiBase}/menu/${id}`);
    }
}
