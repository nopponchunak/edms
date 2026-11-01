import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ApiConfig } from '../config/api.config';
import { map, Observable } from 'rxjs';

export interface SignatureSetting {
    id: number;
    employee_code: string;
    is_active: number;
    create_by?: string | null;
    update_by?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    No?: number;
    employee_id?: number | null;
    initial?: string | null;
    firstname?: string | null;
    lastname?: string | null;
    email?: string | null;
    level_name?: string | null;
    title_name?: string | null;
    department_name?: string | null;
    employee_type_name?: string | null;
    employee_active?: string | null;
    employee?: {
        id: number;
        code: string;
        initial?: string | null;
        firstname?: string | null;
        lastname?: string | null;
        email?: string | null;
        level_name?: string | null;
        title_name?: string | null;
        department_name?: string | null;
        employee_type_name?: string | null;
        active?: string | null;
    };
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

export interface SignatureSettingPageRequest {
    draw: number;
    start: number;
    length: number;
    search: { value?: string; regex?: boolean };
    order: Array<{ column: number; dir: 'asc' | 'desc' }>;
    is_active?: number;
}

@Injectable({ providedIn: 'root' })
export class SignatureSettingService {
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
        is_active?: number | null;
    }): Observable<{
        items: SignatureSetting[];
        total: number;
        page: number;
        perPage: number;
        lastPage: number;
    }> {
        const page = opts.page ?? 1;
        const perPage = opts.perPage ?? 10;
        const body: SignatureSettingPageRequest = {
            draw: opts.draw ?? 1,
            start: (page - 1) * perPage,
            length: perPage,
            search: opts.search ? { value: opts.search, regex: false } : {},
            order: opts.order ?? [{ column: 5, dir: 'desc' }],
        };

        if (opts.is_active !== null && opts.is_active !== undefined) {
            body.is_active = opts.is_active;
        }

        return this.http
            .post<ApiResponse<LaravelPaginator<SignatureSetting>>>(
                this.apiConfig.buildUrl('api/signature_settings_page'),
                body
            )
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

    getActiveByCodes(codes: Array<string | number | null | undefined>): Observable<SignatureSetting[]> {
        const normalizedCodes = Array.from(
            new Set(
                codes
                    .map((code) => String(code ?? '').trim())
                    .filter(Boolean)
            )
        );

        let params = new HttpParams().set('active', '1');
        normalizedCodes.forEach((code) => {
            params = params.append('codes[]', code);
        });

        return this.http
            .get<ApiResponse<SignatureSetting[]>>(
                this.apiConfig.buildUrl('api/get_signature_settings'),
                { params }
            )
            .pipe(map((res) => (Array.isArray(res.data) ? res.data : [])));
    }

    getActiveMapByCodes(codes: Array<string | number | null | undefined>): Observable<Map<string, SignatureSetting>> {
        return this.getActiveByCodes(codes).pipe(
            map((items) => {
                const lookup = new Map<string, SignatureSetting>();
                items.forEach((item) => {
                    [
                        item.employee_code,
                        item.employee_code?.replace(/-/g, ''),
                        item.initial,
                        item.employee?.code,
                        item.employee?.code?.replace(/-/g, ''),
                        item.employee?.initial,
                    ].forEach((key) => {
                        const normalizedKey = String(key ?? '').trim();
                        if (normalizedKey) {
                            lookup.set(normalizedKey, item);
                            lookup.set(normalizedKey.toUpperCase(), item);
                        }
                    });
                });
                return lookup;
            })
        );
    }

    getById(id: number): Observable<SignatureSetting | null> {
        return this.http
            .get<ApiResponse<SignatureSetting>>(
                this.apiConfig.buildUrl(`api/signature_settings/${id}`)
            )
            .pipe(map((res) => (res.status && res.data ? res.data : null)));
    }

    create(payload: {
        employee_code: string;
        is_active: number;
    }): Observable<SignatureSetting> {
        return this.http
            .post<ApiResponse<SignatureSetting>>(
                this.apiConfig.buildUrl('api/signature_settings'),
                payload
            )
            .pipe(map((res) => res.data));
    }

    update(
        id: number,
        payload: {
            employee_code: string;
            is_active: number;
        }
    ): Observable<SignatureSetting> {
        return this.http
            .put<ApiResponse<SignatureSetting>>(
                this.apiConfig.buildUrl(`api/signature_settings/${id}`),
                payload
            )
            .pipe(map((res) => res.data));
    }

    delete(id: number): Observable<void> {
        return this.http
            .delete<ApiResponse<void>>(
                this.apiConfig.buildUrl(`api/signature_settings/${id}`)
            )
            .pipe(map(() => undefined));
    }
}
