import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, delay, map, catchError } from 'rxjs';
import { ApiConfig } from '../config/api.config';

export interface ProjectDetail {
    id: number;
    name: string;
    code?: string;
    detail?: string;
    is_active?: number;
    created_at?: string;
    updated_at?: string;
}

interface GetProjectDetailsResponse {
    status: boolean;
    message: string;
    data: ProjectDetail[];
}

/** Response from GET /api/project_details/:id */
interface GetProjectDetailByIdResponse {
    status: boolean;
    message: string;
    data: ProjectDetail;
}

/** Request body for POST /api/project_details_page */
export interface ProjectDetailsPageRequest {
    draw: number;
    start: number;
    length: number;
    search: Record<string, unknown>;
    order: { column: number; dir: 'asc' | 'desc' }[];
    is_active: number;
}

/** Response from POST /api/project_details_page (Laravel paginator shape) */
interface ProjectDetailsPageApiResponse {
    code?: string;
    status: boolean;
    message: string;
    data: {
        current_page: number;
        data: ProjectDetail[];
        last_page: number;
        per_page: number;
        total: number;
        [key: string]: unknown;
    };
}

/** Normalized result for the list component */
export interface ProjectDetailsPageResponse {
    draw: number;
    recordsTotal: number;
    recordsFiltered: number;
    data: ProjectDetail[];
}

/** Project Detail service - fetches from API or falls back to in-memory store */
@Injectable({ providedIn: 'root' })
export class ProjectDetailService {
    constructor(
        private http: HttpClient,
        private apiConfig: ApiConfig
    ) {}
    private store: ProjectDetail[] = [
        { id: 1, name: 'Concept Design', code: 'CD', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 2, name: 'Schematic Design', code: 'SD', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 3, name: 'Design Development', code: 'DD', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ];
    private nextId = 4;

    /**
     * Fetch project details from GET /api/get_project_details
     */
    getProjectDetails(): Observable<ProjectDetail[]> {
        return this.http
            .get<GetProjectDetailsResponse>(this.apiConfig.buildUrl('api/get_project_details'))
            .pipe(
                map((res) => (res?.status && res?.data ? res.data : [])),
                catchError(() => of(this.store))
            );
    }

    list(): Observable<{ items: ProjectDetail[]; total: number }> {
        const items = [...this.store];
        return of({ items, total: items.length }).pipe(delay(300));
    }

    /**
     * Fetch project details page from POST /api/project_details_page (DataTables-style)
     */
    listPage(params: {
        draw: number;
        start: number;
        length: number;
        search?: Record<string, unknown>;
        order?: { column: number; dir: 'asc' | 'desc' }[];
        is_active?: number;
    }): Observable<ProjectDetailsPageResponse> {
        const body: ProjectDetailsPageRequest = {
            draw: params.draw,
            start: params.start,
            length: params.length,
            search: params.search ?? {},
            order: params.order ?? [{ column: 1, dir: 'asc' }],
            is_active: params.is_active ?? 1,
        };
        return this.http
            .post<ProjectDetailsPageApiResponse>(
                this.apiConfig.buildUrl('api/project_details_page'),
                body
            )
            .pipe(
                map((res) => {
                    const p = res?.data;
                    const items = p?.data ?? [];
                    const total = p?.total ?? 0;
                    return {
                        draw: params.draw,
                        recordsTotal: total,
                        recordsFiltered: total,
                        data: items,
                    } as ProjectDetailsPageResponse;
                }),
                catchError(() =>
                    of({
                        draw: params.draw,
                        recordsTotal: 0,
                        recordsFiltered: 0,
                        data: [],
                    })
                )
            );
    }

    /**
     * Fetch a single project detail from GET /api/project_details/:id
     */
    getById(id: number): Observable<ProjectDetail | null> {
        return this.http
            .get<GetProjectDetailByIdResponse>(
                this.apiConfig.buildUrl(`api/project_details/${id}`)
            )
            .pipe(
                map((res) => (res?.status && res?.data ? res.data : null)),
                catchError(() => of(null))
            );
    }

    /**
     * Create a project detail via POST /api/project_details
     * Body: { code, name, detail, is_active }
     */
    create(payload: {
        code?: string;
        name: string;
        detail?: string;
        is_active?: number;
    }): Observable<ProjectDetail | null> {
        const body = {
            code: payload.code ?? '',
            name: payload.name,
            detail: payload.detail ?? '',
            is_active: payload.is_active ?? 1,
        };
        return this.http
            .post<GetProjectDetailByIdResponse>(
                this.apiConfig.buildUrl('api/project_details'),
                body
            )
            .pipe(
                map((res) => (res?.status && res?.data ? res.data : null)),
                catchError(() => of(null))
            );
    }

    /**
     * Update a project detail via PUT /api/project_details/:id
     * Body: { code, name, detail, is_active }
     */
    update(
        id: number,
        payload: { code?: string; name: string; detail?: string; is_active?: number }
    ): Observable<ProjectDetail | null> {
        const body = {
            code: payload.code ?? '',
            name: payload.name,
            detail: payload.detail ?? '',
            is_active: payload.is_active ?? 1,
        };
        return this.http
            .put<GetProjectDetailByIdResponse>(
                this.apiConfig.buildUrl(`api/project_details/${id}`),
                body
            )
            .pipe(
                map((res) => (res?.status && res?.data ? res.data : null)),
                catchError(() => of(null))
            );
    }

    /**
     * Delete a project detail via DELETE /api/project_details/:id
     */
    delete(id: number): Observable<void> {
        return this.http
            .delete(this.apiConfig.buildUrl(`api/project_details/${id}`))
            .pipe(map(() => undefined));
    }
}
