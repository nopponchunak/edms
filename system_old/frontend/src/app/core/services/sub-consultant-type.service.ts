import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ApiConfig } from '../config/api.config';
import { map, Observable } from 'rxjs';

export interface SubConsultantType {
    id: number;
    name: string;
    code?: string;
    detail?: string;
    is_active?: number;
    created_at?: string;
    updated_at?: string;
    No?: number;
}

export interface SubConsultantTypePageRequest {
    draw: number;
    start: number;
    length: number;
    search: { value?: string; regex?: boolean };
    order: Array<{ column: number; dir: 'asc' | 'desc' }>;
    is_active?: number;
}

interface LaravelPaginator<T> {
    current_page: number;
    data: T[];
    last_page: number;
    per_page: number;
    total: number;
}

interface ApiResponse<T> {
    code?: string;
    status: boolean;
    message: string;
    data: T;
}

@Injectable({ providedIn: 'root' })
export class SubConsultantTypeService {
    constructor(
        private http: HttpClient,
        private apiConfig: ApiConfig
    ) {}

    page(opts: {
        draw?: number;
        page?: number;
        perPage?: number;
        search?: string;
        order?: Array<{ column: number; dir: 'asc' | 'desc' }>;
        is_active?: number;
    }): Observable<{
        items: SubConsultantType[];
        total: number;
        page: number;
        perPage: number;
        lastPage: number;
    }> {
        const page = opts.page ?? 1;
        const perPage = opts.perPage ?? 10;
        const body: SubConsultantTypePageRequest = {
            draw: opts.draw ?? 1,
            start: (page - 1) * perPage,
            length: perPage,
            search: opts.search ? { value: opts.search, regex: false } : {},
            order: opts.order ?? [{ column: 1, dir: 'asc' }],
            is_active: opts.is_active ?? 1,
        };

        return this.http
            .post<ApiResponse<LaravelPaginator<SubConsultantType>>>(
                this.apiConfig.buildUrl('api/sub_consultant_types_page'),
                body
            )
            .pipe(
                map((res) => {
                    const p = res.data;
                    return {
                        items: p?.data ?? [],
                        total: p?.total ?? 0,
                        page: p?.current_page ?? page,
                        perPage: p?.per_page ?? perPage,
                        lastPage: p?.last_page ?? 1,
                    };
                })
            );
    }

    getAll(): Observable<SubConsultantType[]> {
        return this.http
            .get<ApiResponse<SubConsultantType[]>>(
                this.apiConfig.buildUrl('api/get_sub_consultant_types')
            )
            .pipe(
                map((res) => (res.status && Array.isArray(res.data) ? res.data : []))
            );
    }

    getById(id: number): Observable<SubConsultantType | null> {
        return this.http
            .get<ApiResponse<SubConsultantType>>(
                this.apiConfig.buildUrl(`api/sub_consultant_types/${id}`)
            )
            .pipe(
                map((res) => (res.status && res.data ? res.data : null))
            );
    }

    create(payload: {
        name: string;
        code?: string;
        detail?: string;
        is_active?: number;
    }): Observable<SubConsultantType> {
        return this.http
            .post<ApiResponse<SubConsultantType>>(
                this.apiConfig.buildUrl('api/sub_consultant_types'),
                payload
            )
            .pipe(map((res) => res.data));
    }

    seedDefaults(): Observable<{
        created: number;
        restored: number;
        existing: number;
        total: number;
    }> {
        return this.http
            .post<ApiResponse<{
                created: number;
                restored: number;
                existing: number;
                total: number;
            }>>(
                this.apiConfig.buildUrl('api/sub_consultant_types/seed-defaults'),
                {}
            )
            .pipe(map((res) => res.data));
    }

    update(
        id: number,
        payload: {
            name: string;
            code?: string;
            detail?: string;
            is_active?: number;
        }
    ): Observable<SubConsultantType> {
        return this.http
            .put<ApiResponse<SubConsultantType>>(
                this.apiConfig.buildUrl(`api/sub_consultant_types/${id}`),
                payload
            )
            .pipe(map((res) => res.data));
    }

    delete(id: number): Observable<void> {
        return this.http
            .delete<ApiResponse<void>>(
                this.apiConfig.buildUrl(`api/sub_consultant_types/${id}`)
            )
            .pipe(map(() => undefined));
    }
}
