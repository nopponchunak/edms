import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ApiConfig } from 'app/core/config/api.config';
import {
    catchError,
    concatMap,
    defaultIfEmpty,
    filter,
    from,
    map,
    Observable,
    of,
    take,
} from 'rxjs';

export type ManualMatchType = 'exact' | 'prefix' | 'pattern';
export type ManualSortColumn =
    | 'No'
    | 'title'
    | 'original_file_name'
    | 'status'
    | 'updated_at';
export type ManualSortDirection = 'asc' | 'desc';
export type ManualStatus = 'active' | 'inactive';
export type ManualMediaType = 'pdf' | 'image' | 'video' | 'unsupported';

export interface ManualPageMapping {
    id?: number;
    manual_id?: number;
    menu_id?: number | null;
    menu_name?: string | null;
    url_path: string;
    match_type: ManualMatchType;
    display_order?: number;
    is_active?: number;
}

export interface Manual {
    id: number;
    title: string;
    description?: string | null;
    original_file_name?: string | null;
    file_path?: string | null;
    mime_type?: string | null;
    media_type?: ManualMediaType | string | null;
    file_extension?: string | null;
    file_size?: number | null;
    status?: ManualStatus | string | null;
    created_at?: string | null;
    updated_at?: string | null;
    No?: number;
    mappings?: ManualPageMapping[];
}

export interface ManualMenuOption {
    id: number;
    name: string;
    path: string | null;
    key?: string | null;
    label: string;
}

interface ApiResponse<T> {
    code?: string;
    status: boolean;
    message: string;
    data: T;
}

interface LaravelPaginator<T> {
    current_page: number;
    data: T[];
    last_page: number;
    per_page: number;
    total: number;
}

interface MainMenuApiRow {
    id: number;
    name: string;
    Menus?: MenuApiRow[];
    MenusTree?: MenuApiRow[];
}

interface MenuApiRow {
    id: number;
    main_menu_id: number;
    parent_id: number | null;
    name: string;
    key?: string | null;
    path?: string | null;
    children?: MenuApiRow[];
}

@Injectable({ providedIn: 'root' })
export class ManualService {
    private readonly manualMimeTypes = new Set([
        'application/pdf',
        'image/jpeg',
        'image/png',
        'video/mp4',
        'video/webm',
        'video/quicktime',
    ]);

    constructor(
        private http: HttpClient,
        private apiConfig: ApiConfig
    ) {}

    page(opts: {
        draw?: number;
        page?: number;
        perPage?: number;
        search?: string;
        status?: ManualStatus | 'all' | null;
        sortColumn?: ManualSortColumn;
        sortDirection?: ManualSortDirection;
    }): Observable<{
        items: Manual[];
        total: number;
        page: number;
        perPage: number;
        lastPage: number;
    }> {
        const page = opts.page ?? 1;
        const perPage = opts.perPage ?? 10;
        const columns = [
            { data: 'No' },
            { data: 'title' },
            { data: 'original_file_name' },
            { data: 'mappings' },
            { data: 'status' },
            { data: 'updated_at' },
            { data: 'action' },
        ];
        const columnIndex: Record<ManualSortColumn, number> = {
            No: 0,
            title: 1,
            original_file_name: 2,
            status: 4,
            updated_at: 5,
        };
        const sortColumn = opts.sortColumn ?? 'updated_at';
        const sortDirection = opts.sortDirection ?? 'desc';
        const body: any = {
            draw: opts.draw ?? 1,
            start: (page - 1) * perPage,
            length: perPage,
            search: opts.search ? { value: opts.search, regex: false } : {},
            order: [
                {
                    column: columnIndex[sortColumn],
                    dir: sortDirection,
                },
            ],
            columns,
        };

        if (opts.status && opts.status !== 'all') {
            body.status = opts.status;
        }

        return this.http
            .post<
                ApiResponse<LaravelPaginator<Manual>>
            >(this.apiConfig.buildUrl('api/manuals_page'), body)
            .pipe(
                map((res) => {
                    const paginator = res.data;
                    return {
                        items: paginator?.data ?? [],
                        total: paginator?.total ?? 0,
                        page: paginator?.current_page ?? page,
                        perPage: paginator?.per_page ?? perPage,
                        lastPage: paginator?.last_page ?? 1,
                    };
                })
            );
    }

    getByPath(path: string): Observable<Manual[]> {
        const params = new HttpParams().set('path', this.normalizePath(path));

        return this.http
            .get<
                ApiResponse<Manual[] | Manual | null>
            >(this.apiConfig.buildUrl('api/manuals/by-path'), { params })
            .pipe(
                map((res) => {
                    if (!res.status || !res.data) {
                        return [];
                    }

                    return Array.isArray(res.data) ? res.data : [res.data];
                })
            );
    }

    getByPathWithFallback(path: string): Observable<Manual[]> {
        return from(this.buildPathCandidates(path)).pipe(
            concatMap((candidate) =>
                this.getByPath(candidate).pipe(catchError(() => of([])))
            ),
            filter((manuals) => manuals.length > 0),
            take(1),
            defaultIfEmpty([])
        );
    }

    getById(id: number): Observable<Manual | null> {
        return this.http
            .get<
                ApiResponse<Manual>
            >(this.apiConfig.buildUrl(`api/manuals/${id}`))
            .pipe(map((res) => (res.status && res.data ? res.data : null)));
    }

    create(payload: FormData): Observable<Manual> {
        return this.http
            .post<
                ApiResponse<Manual>
            >(this.apiConfig.buildUrl('api/manuals'), payload)
            .pipe(map((res) => res.data));
    }

    update(id: number, payload: FormData): Observable<Manual> {
        return this.http
            .post<
                ApiResponse<Manual>
            >(this.apiConfig.buildUrl(`api/manuals/${id}`), payload)
            .pipe(map((res) => res.data));
    }

    delete(id: number): Observable<void> {
        return this.http
            .delete<
                ApiResponse<void>
            >(this.apiConfig.buildUrl(`api/manuals/${id}`))
            .pipe(map(() => undefined));
    }

    getFileBlob(id: number): Observable<{
        blob: Blob;
        contentType: string | null;
    }> {
        return this.http
            .get(this.apiConfig.buildUrl(`api/manuals/${id}/file`), {
                observe: 'response',
                responseType: 'blob',
            })
            .pipe(
                map((response) => ({
                    blob: response.body ?? new Blob(),
                    contentType: response.headers.get('Content-Type'),
                }))
            );
    }

    getMenuOptions(): Observable<ManualMenuOption[]> {
        return this.http
            .get<
                ApiResponse<MainMenuApiRow[]>
            >(this.apiConfig.buildUrl('api/get_main_menu'))
            .pipe(map((res) => this.flattenMainMenus(res.data ?? [])));
    }

    normalizePath(path: string): string {
        const value = (path || '/').split('?')[0].split('#')[0].trim();
        const withSlash = value.startsWith('/') ? value : `/${value}`;

        if (withSlash.length > 1 && withSlash.endsWith('/')) {
            return withSlash.slice(0, -1);
        }

        return withSlash || '/';
    }

    private buildPathCandidates(path: string): string[] {
        const normalizedPath = this.normalizePath(path);
        const candidates = [normalizedPath];
        const segments = normalizedPath.split('/').filter(Boolean);

        while (segments.length > 1) {
            segments.pop();
            candidates.push(`/${segments.join('/')}`);
        }

        return Array.from(new Set(candidates));
    }

    buildManualFormData(input: {
        title: string;
        description?: string | null;
        status: ManualStatus;
        file?: File | null;
        mappings: ManualPageMapping[];
    }): FormData {
        const formData = new FormData();
        formData.append('title', input.title);
        formData.append('description', input.description ?? '');
        formData.append('status', input.status);
        formData.append(
            'mappings',
            JSON.stringify(
                input.mappings.map((mapping, index) => ({
                    menu_id: mapping.menu_id ?? null,
                    url_path: this.normalizePath(mapping.url_path),
                    match_type: mapping.match_type,
                    display_order: mapping.display_order ?? index + 1,
                    is_active: mapping.is_active ?? 1,
                }))
            )
        );

        if (input.file) {
            formData.append('file', input.file);
        }

        return formData;
    }

    formatFileSize(bytes?: number | null): string {
        if (!bytes) {
            return '-';
        }

        return this.apiConfig.formatFileSize(bytes);
    }

    isAllowedManualFile(file: File): boolean {
        const allowedExtensions = this.apiConfig.manualAllowedFileTypes.map(
            (type) => type.toLowerCase()
        );
        const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
        const mimeType = file.type.toLowerCase();

        return (
            (mimeType && this.manualMimeTypes.has(mimeType)) ||
            allowedExtensions.includes(extension)
        );
    }

    isManualFileSizeValid(fileSize: number): boolean {
        return fileSize <= this.apiConfig.manualMaxFileSize;
    }

    getManualFileSizeExceededMessage(file: File): string {
        return this.apiConfig.getManualFileSizeExceededMessage(file);
    }

    getManualSupportedFileTypesLabel(): string {
        return this.apiConfig.manualAllowedFileTypes
            .map((type) => type.toUpperCase())
            .join(', ');
    }

    getManualMediaType(
        manual: Pick<
            Manual,
            | 'media_type'
            | 'mime_type'
            | 'file_extension'
            | 'original_file_name'
        >
    ): ManualMediaType {
        const explicitType = (manual.media_type ?? '').toLowerCase();
        if (['pdf', 'image', 'video'].includes(explicitType)) {
            return explicitType as ManualMediaType;
        }

        const mimeType = (manual.mime_type ?? '').toLowerCase();
        const extension =
            (manual.file_extension ?? '') ||
            (manual.original_file_name ?? '').split('.').pop() ||
            '';
        const normalizedExtension = extension.toLowerCase();
        const fileName = (manual.original_file_name ?? '').toLowerCase();

        if (mimeType.includes('pdf') || normalizedExtension === 'pdf') {
            return 'pdf';
        }

        if (
            mimeType.startsWith('image/') ||
            ['jpg', 'jpeg', 'png'].includes(normalizedExtension) ||
            fileName.endsWith('.jpg') ||
            fileName.endsWith('.jpeg') ||
            fileName.endsWith('.png')
        ) {
            return 'image';
        }

        if (
            mimeType.startsWith('video/') ||
            ['mp4', 'webm', 'mov'].includes(normalizedExtension) ||
            fileName.endsWith('.mp4') ||
            fileName.endsWith('.webm') ||
            fileName.endsWith('.mov')
        ) {
            return 'video';
        }

        return 'unsupported';
    }

    isManualMediaType(manual: Manual, mediaType: ManualMediaType): boolean {
        return this.getManualMediaType(manual) === mediaType;
    }

    getManualMediaIcon(manual: Manual): string {
        switch (this.getManualMediaType(manual)) {
            case 'pdf':
                return 'heroicons_outline:document-text';
            case 'image':
                return 'heroicons_outline:photo';
            case 'video':
                return 'heroicons_outline:video-camera';
            default:
                return 'heroicons_outline:document';
        }
    }

    private flattenMainMenus(mainMenus: MainMenuApiRow[]): ManualMenuOption[] {
        const options: ManualMenuOption[] = [];

        mainMenus.forEach((mainMenu) => {
            const mainMenuLabel = this.formatMainMenuLabel(mainMenu.name);
            const menus = mainMenu.MenusTree?.length
                ? mainMenu.MenusTree
                : (mainMenu.Menus ?? []);

            menus.forEach((menu) => {
                this.flattenMenuNode(menu, mainMenuLabel, options, 0);
            });
        });

        return options;
    }

    private flattenMenuNode(
        menu: MenuApiRow,
        mainMenuName: string,
        options: ManualMenuOption[],
        depth: number
    ): void {
        const prefix = depth > 0 ? `${'-- '.repeat(depth)}` : '';
        options.push({
            id: menu.id,
            name: menu.name,
            path: menu.path ?? null,
            key: menu.key ?? null,
            label: `${mainMenuName} / ${prefix}${menu.name}`,
        });

        (menu.children ?? []).forEach((child) => {
            this.flattenMenuNode(child, mainMenuName, options, depth + 1);
        });
    }

    private formatMainMenuLabel(name: string): string {
        const trimmedName = (name ?? '').trim();

        if (trimmedName.toLowerCase() === 'acp') {
            return 'ACP';
        }

        return trimmedName;
    }
}
