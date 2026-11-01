import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of, switchMap } from 'rxjs';
import { environment } from 'environments/environment';
import { resolveEmployeeDisplayInitial } from '../utils/employee-display.util';
import { EmployeeOption, EmployeeService } from './employee.service';

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

export interface CommitteesPageRequest {
    draw: number;
    columns: DtColumn[];
    order: DtOrder[];
    start: number;
    length: number;
    search: DtSearch;
}

export interface CommitteeEmployee {
    code: string;
    initial: string | null;
    firstname: string;
    lastname: string;
    email: string;
    department_name: string;
}

export interface CommitteeApiRow {
    id: number;
    name: string;
    create_by: string | null;
    update_by: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    No: number;
    employees: CommitteeEmployee[];
}

export interface CommitteeDetail {
    id: number;
    name: string;
    create_by: string | null;
    update_by: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    employees: CommitteeEmployeeDetail[];
}

export interface CommitteeEmployeeDetail {
    id: number;
    code: string;
    username: string;
    password: string | null;
    firstname: string;
    lastname: string;
    email: string;
    birth_date: string;
    register_date: string;
    pass_probation_date: string;
    sex: string;
    title_id: number;
    title_name: string;
    level_id: number;
    level_name: string;
    department_id: number;
    department_name: string;
    employee_type_id: number;
    employee_type_name: string;
    work_shift_id: number | null;
    work_shift_name: string | null;
    head_id: number;
    head_name: string;
    initial: string;
    is_approver: number;
    next_quota_update: string | null;
    employee_status: string;
    active: string;
    current_start_period: string;
    current_end_period: string;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}

export interface CreateCommitteeRequest {
    committee_name: string;
    employee_codes: string[];
}

export interface UpdateCommitteeRequest {
    committee_name: string;
    employee_codes: string[];
}

interface LaravelPaginator<T> {
    current_page: number;
    data: T[];
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
}

interface ApiResponse<T> {
    code: string;
    status: boolean;
    message: string;
    data: T;
}

export interface CommitteesPageResult {
    items: CommitteeApiRow[];
    total: number;
    page: number;
    perPage: number;
    lastPage: number;
}

@Injectable({ providedIn: 'root' })
export class CommitteesService {
    private readonly base = (environment as any).apiUrl ?? (environment as any).apiBase;
    private readonly apiBase = `${this.base}/api`;

    constructor(
        private http: HttpClient,
        private employeeService: EmployeeService
    ) {}

    /**
     * Get committees list with DataTables pagination
     */
    list(opts: {
        page: number;
        perPage: number;
        search?: string;
        draw?: number;
        orderColumnIndex?: number;
        orderDir?: DtOrderDir;
    }): Observable<CommitteesPageResult> {
        const page = opts.page ?? 1;
        const perPage = opts.perPage ?? 10;
        const keyword = (opts.search ?? '').trim();

        const body: CommitteesPageRequest = {
            draw: opts.draw ?? 1,
            columns: [
                { data: 'No' },
                { data: 'name' },
                { data: 'create_by' },
                { data: 'update_by' },
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
            .post<ApiResponse<LaravelPaginator<CommitteeApiRow>>>(
                `${this.apiBase}/committees_page`,
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

    /**
     * Get committee by ID
     */
    getById(id: number | string): Observable<ApiResponse<CommitteeDetail>> {
        return this.http.get<ApiResponse<CommitteeDetail>>(
            `${this.apiBase}/committees/${id}`
        );
    }

    /**
     * Get employee dropdown options from a committee by exact committee name.
     * Returns [] when the committee is missing or has no employees so callers can
     * fall back to the normal all-employee dropdown.
     */
    getEmployeeOptionsByName(name: string): Observable<EmployeeOption[]> {
        const normalizedName = this.normalizeCommitteeName(name);

        return this.list({ page: 1, perPage: 10, search: name }).pipe(
            switchMap((result) => {
                const committee = (result.items ?? []).find(
                    (item) => this.normalizeCommitteeName(item.name) === normalizedName
                );

                if (!committee) {
                    return of([]);
                }

                if (committee.employees?.length) {
                    return of(this.mapCommitteeEmployeesToOptions(committee.employees));
                }

                return this.getById(committee.id).pipe(
                    map((res) => this.mapCommitteeEmployeesToOptions(res.data?.employees ?? [])),
                    catchError(() => of([]))
                );
            }),
            catchError(() => of([]))
        );
    }

    /**
     * Create a new committee
     */
    create(payload: CreateCommitteeRequest): Observable<ApiResponse<any>> {
        return this.http.post<ApiResponse<any>>(
            `${this.apiBase}/committees`,
            payload
        );
    }

    /**
     * Update an existing committee
     */
    update(
        id: number | string,
        payload: UpdateCommitteeRequest
    ): Observable<ApiResponse<any>> {
        return this.http.put<ApiResponse<any>>(
            `${this.apiBase}/committees/${id}`,
            payload
        );
    }

    /**
     * Delete a committee
     */
    delete(id: number | string): Observable<ApiResponse<any>> {
        return this.http.delete<ApiResponse<any>>(
            `${this.apiBase}/committees/${id}`
        );
    }

    private normalizeCommitteeName(name: string | null | undefined): string {
        return String(name ?? '').trim().toUpperCase();
    }

    private mapCommitteeEmployeesToOptions(
        employees: Array<Partial<CommitteeEmployee & CommitteeEmployeeDetail>>
    ): EmployeeOption[] {
        const options = employees
            .filter((employee) => !!employee?.code)
            .map((employee) => {
                const code = String(employee.code);
                const firstname = employee.firstname || '';
                const lastname = employee.lastname || '';
                const name = [firstname, lastname].filter(Boolean).join(' ').trim();
                const initial = resolveEmployeeDisplayInitial(employee);
                const displayLabel = [
                    initial,
                    name
                ].filter(Boolean).join(', ');

                return {
                    id: code,
                    employeeId: typeof employee.id === 'number' ? employee.id : undefined,
                    code,
                    initial,
                    name,
                    firstName: firstname,
                    lastName: lastname,
                    email: employee.email || '',
                    role: employee.title_name || '',
                    department: employee.department_name || '',
                    titleCode: '',
                    displayLabel,
                    levelName: employee.level_name || ''
                };
            });

        this.employeeService.rememberEmployeeOptions(options);
        return options;
    }
}
