import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of, shareReplay } from 'rxjs';
import { ApiConfig } from '../config/api.config';
import { resolveEmployeeDisplayInitial } from '../utils/employee-display.util';

export interface Employee {
    id: number;
    code: string;
    firstname: string;
    lastname: string;
    email: string;
    level_name: string;
    title_name: string;
    department_name: string;
    employee_type_name: string;
    is_approver: number;
    active: string;
    initial?: string; // รอ API เพิ่มมา
}

export interface EmployeeApiResponse {
    code: string;
    status: boolean;
    message: string;
    data: Employee[];
}

export interface EmployeeOption {
    id: string; // This will be the code for posting (default)
    employeeId?: number; // Real employee ID from API (for specific forms that need it)
    code: string;
    initial: string;
    name: string;
    firstName: string;
    lastName: string;
    email: string;
    role?: string;
    department?: string;
    titleCode?: string; // title.code from API
    displayLabel: string; // Format: "initial (department_name), firstname lastname" สำหรับแสดงใน dropdown
    levelName?: string; // Level name for filtering
}

@Injectable({
    providedIn: 'root'
})
export class EmployeeService {
    private static readonly DEFAULT_LIST_LIMIT = 200;
    private static readonly MASTER_CACHE_LIMIT = 5000;

    // Keep options found from previous searches to prevent selected values disappearing in mat-select.
    private employeeOptionCache = new Map<string, EmployeeOption>();
    private allEmployeeOptions$?: Observable<EmployeeOption[]>;

    constructor(
        private http: HttpClient,
        private apiConfig: ApiConfig
    ) {}

    /**
     * Get all employees from API
     * @param search - Search term for filtering employees
     * @param limit - Maximum number of employees to return (default: 50, pass null to omit)
     */
    getEmployees(search: string = '', limit: number | null = 50, extraParams?: { [key: string]: string }): Observable<Employee[]> {
        const url = this.apiConfig.buildUrl('api/employees');
        let params = new HttpParams();

        if (search) {
            params = params.set('search', search);
        }
        
        if (limit !== null && limit !== undefined) {
            params = params.set('limit', limit.toString());
        }

        if (extraParams) {
            Object.keys(extraParams).forEach(key => {
                params = params.set(key, extraParams[key]);
            });
        }

        return this.http.get<EmployeeApiResponse>(url, { params }).pipe(
            map((response) => response.data || []),
            catchError((error) => {
                console.error('Error loading employees:', error);
                return of([]);
            })
        );
    }

    /**
     * Get employees as options for dropdowns
     * Returns options with code as id (for posting)
     * @param search - Search term for filtering employees
     * @param limit - Maximum number of employees to return (default: 50)
     */
    getEmployeeOptions(
        search: string = '',
        limit: number = EmployeeService.DEFAULT_LIST_LIMIT,
        extraParams?: { [key: string]: string }
    ): Observable<EmployeeOption[]> {
        const normalizedSearch = (search || '').trim();

        // Bypass cache if raw API params are provided to ensure accurate server-side filtering
        if (extraParams && Object.keys(extraParams).length > 0) {
            return this.getEmployees(normalizedSearch, limit, extraParams).pipe(
                map((employees) => this.mapEmployeesToOptions(employees)),
                catchError(() => of([]))
            );
        }

        if (!normalizedSearch) {
            return this.getAllEmployeeOptions(limit).pipe(
                map((options) => this.limitOptions(options, limit))
            );
        }

        return forkJoin({
            localMatches: this.getAllEmployeeOptions(EmployeeService.MASTER_CACHE_LIMIT).pipe(
                map((options) => this.filterAndRankOptions(normalizedSearch, options, limit)),
                catchError(() => of([]))
            ),
            remoteMatches: this.getEmployees(normalizedSearch, limit).pipe(
                map((employees) => this.mapEmployeesToOptions(employees)),
                catchError(() => of([]))
            )
        }).pipe(
            map(({ localMatches, remoteMatches }) =>
                this.mergeAndRankOptions([...localMatches, ...remoteMatches], normalizedSearch, limit)
            )
        );
    }

    /**
     * Get employee options from the API directly.
     * This bypasses the local master-cache merge used by getEmployeeOptions().
     */
    getEmployeeOptionsFromApi(
        search: string = '',
        limit: number | null = 50,
        extraParams?: { [key: string]: string }
    ): Observable<EmployeeOption[]> {
        return this.getEmployees(search, limit, extraParams).pipe(
            map((employees) => this.mapEmployeesToOptions(employees)),
            catchError(() => of([]))
        );
    }

    /**
     * Search employees by code, name, or initial
     */
    searchEmployees(searchTerm: string, employees: EmployeeOption[]): EmployeeOption[] {
        if (!searchTerm || typeof searchTerm !== 'string') {
            return employees;
        }
        const term = searchTerm.trim().toLowerCase();
        if (!term) {
            return employees;
        }
        return employees.filter(
            (emp) => {
                if (!emp || !emp.code) {
                    return false;
                }
                const codeLower = emp.code.toLowerCase();
                const initialLower = (emp.initial || '').toLowerCase();
                const nameLower = (emp.name || '').toLowerCase();
                const firstNameLower = (emp.firstName || '').toLowerCase();
                const lastNameLower = (emp.lastName || '').toLowerCase();

                // Search by code, initial, name, firstname, lastname, or combined format "code - initial"
                return codeLower.includes(term) ||
                       initialLower.includes(term) ||
                       nameLower.includes(term) ||
                       firstNameLower.includes(term) ||
                       lastNameLower.includes(term) ||
                       `${codeLower} - ${initialLower}`.includes(term);
            }
        );
    }

    private getAllEmployeeOptions(limit: number): Observable<EmployeeOption[]> {
        if (!this.allEmployeeOptions$) {
            this.allEmployeeOptions$ = this.getEmployees('', EmployeeService.MASTER_CACHE_LIMIT).pipe(
                map((employees) => this.mapEmployeesToOptions(employees)),
                shareReplay(1)
            );
        }

        return this.allEmployeeOptions$.pipe(
            map((options) => this.limitOptions(this.mergeWithCachedOptions(options), limit))
        );
    }

    private mapEmployeesToOptions(employees: Employee[]): EmployeeOption[] {
        const options = employees.map((e) => {
            const initial = resolveEmployeeDisplayInitial(e);
            const department = e.department_name || '';
            const firstname = e.firstname || '';
            const lastname = e.lastname || '';
            const displayLabel = [
                initial,
                [firstname, lastname].filter(Boolean).join(' ')
            ].filter(Boolean).join(', ');

            return {
                id: e.code,
                employeeId: e.id,
                code: e.code,
                initial,
                name: `${firstname} ${lastname}`.trim(),
                firstName: firstname,
                lastName: lastname,
                email: e.email,
                role: e.title_name || '',
                department,
                titleCode: '',
                displayLabel,
                levelName: e.level_name || ''
            };
        });

        this.rememberEmployeeOptions(options);

        return options;
    }

    private mergeWithCachedOptions(options: EmployeeOption[]): EmployeeOption[] {
        const merged: EmployeeOption[] = [];
        const seen = new Set<string>();
        const addOption = (option: EmployeeOption) => {
            if (!option?.code || seen.has(option.code)) {
                return;
            }

            seen.add(option.code);
            merged.push(option);
        };

        options.forEach(addOption);
        this.employeeOptionCache.forEach((option) => addOption(option));

        return merged;
    }

    private mergeAndRankOptions(
        options: EmployeeOption[],
        searchTerm: string,
        limit: number
    ): EmployeeOption[] {
        const ranked = this.filterAndRankOptions(searchTerm, this.mergeWithCachedOptions(options), limit);
        return this.limitOptions(ranked, limit);
    }

    private filterAndRankOptions(
        searchTerm: string,
        options: EmployeeOption[],
        limit: number
    ): EmployeeOption[] {
        const normalizedTerm = this.normalizeSearchTerm(searchTerm);
        const searchTokens = normalizedTerm.split(' ').filter(Boolean);

        return options
            .filter((option) => this.matchesSearch(option, searchTokens))
            .sort((a, b) => {
                const scoreDiff = this.getSearchScore(b, normalizedTerm) - this.getSearchScore(a, normalizedTerm);
                if (scoreDiff !== 0) {
                    return scoreDiff;
                }

                return a.displayLabel.localeCompare(b.displayLabel);
            })
            .slice(0, limit);
    }

    private matchesSearch(option: EmployeeOption, tokens: string[]): boolean {
        if (!tokens.length) {
            return true;
        }

        const haystack = this.normalizeSearchTerm([
            option.code,
            option.initial,
            option.name,
            option.firstName,
            option.lastName,
            option.email,
            option.role,
            option.department,
            option.displayLabel
        ].filter(Boolean).join(' '));

        return tokens.every((token) => haystack.includes(token));
    }

    private getSearchScore(option: EmployeeOption, term: string): number {
        const code = this.normalizeSearchTerm(option.code);
        const initial = this.normalizeSearchTerm(option.initial);
        const name = this.normalizeSearchTerm(option.name);
        const firstName = this.normalizeSearchTerm(option.firstName);
        const lastName = this.normalizeSearchTerm(option.lastName);
        const displayLabel = this.normalizeSearchTerm(option.displayLabel);
        const department = this.normalizeSearchTerm(option.department || '');
        const role = this.normalizeSearchTerm(option.role || '');

        let score = 0;

        if (code === term || initial === term || name === term || displayLabel === term) score += 1000;
        if (code.startsWith(term)) score += 700;
        if (initial.startsWith(term)) score += 600;
        if (firstName.startsWith(term) || lastName.startsWith(term)) score += 500;
        if (name.startsWith(term) || displayLabel.startsWith(term)) score += 450;
        if (department.startsWith(term) || role.startsWith(term)) score += 250;
        if (code.includes(term)) score += 120;
        if (initial.includes(term)) score += 110;
        if (name.includes(term) || displayLabel.includes(term)) score += 100;
        if (department.includes(term) || role.includes(term)) score += 60;

        return score;
    }

    private normalizeSearchTerm(value: string): string {
        return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    private limitOptions(options: EmployeeOption[], limit: number): EmployeeOption[] {
        if (!limit || limit < 1) {
            return options;
        }

        return options.slice(0, limit);
    }

    getEmployeeLookupMap(limit: number = EmployeeService.MASTER_CACHE_LIMIT): Observable<Map<string, string>> {
        return this.getAllEmployeeOptions(limit).pipe(
            map((options) => {
                const lookup = new Map<string, string>();

                options.forEach((option) => {
                    const label = this.getEmployeeDisplayName(option);
                    if (!label) {
                        return;
                    }

                    if (option.code) {
                        lookup.set(String(option.code).trim(), label);
                    }

                    if (option.employeeId !== undefined && option.employeeId !== null) {
                        lookup.set(String(option.employeeId).trim(), label);
                    }

                    if (option.id) {
                        lookup.set(String(option.id).trim(), label);
                    }
                });

                return lookup;
            })
        );
    }

    getEmployeeLookupMapWithTitle(limit: number = EmployeeService.MASTER_CACHE_LIMIT): Observable<Map<string, string>> {
        return this.getAllEmployeeOptions(limit).pipe(
            map((options) => {
                const lookup = new Map<string, string>();

                options.forEach((option) => {
                    let fullName = [option.firstName, option.lastName].filter(Boolean).join(' ').trim()
                        || option.name?.trim()
                        || option.displayLabel?.trim();
                        
                    if (option.initial) {
                        const init = option.initial.trim().replace(/\.$/, '');
                        fullName = `${init}, ${fullName}`;
                    }
                        
                    const role = option.role?.trim();
                    
                    let label = fullName;
                    if (role) {
                        label = `${fullName}|${role}`;
                    }

                    if (!label) {
                        return;
                    }

                    if (option.code) {
                        lookup.set(String(option.code).trim(), label);
                    }

                    if (option.employeeId !== undefined && option.employeeId !== null) {
                        lookup.set(String(option.employeeId).trim(), label);
                    }

                    if (option.id) {
                        lookup.set(String(option.id).trim(), label);
                    }
                });

                return lookup;
            })
        );
    }

    formatEmployeeReference(
        ref: string | number | null | undefined,
        lookup: Map<string, string>,
        fallback: string = '-'
    ): string {
        if (ref === null || ref === undefined) {
            return fallback;
        }

        const normalizedRef = String(ref).trim();
        if (!normalizedRef) {
            return fallback;
        }

        return lookup.get(normalizedRef) ?? normalizedRef;
    }

    getCachedEmployeeOptionByReference(
        ref: string | number | null | undefined
    ): EmployeeOption | null {
        if (ref === null || ref === undefined) {
            return null;
        }

        const normalizedRef = String(ref).trim();
        if (!normalizedRef) {
            return null;
        }

        return this.employeeOptionCache.get(normalizedRef) ?? null;
    }

    getEmployeeOptionByReference(ref: string | number | null | undefined): Observable<EmployeeOption | null> {
        if (ref === null || ref === undefined) {
            return of(null);
        }

        const normalizedRef = String(ref).trim();
        if (!normalizedRef) {
            return of(null);
        }

        const cached = this.getCachedEmployeeOptionByReference(normalizedRef);
        if (cached) {
            return of(cached);
        }

        const target = normalizedRef.toLowerCase();

        return this.getEmployeeOptions(normalizedRef, 10).pipe(
            map((options) => {
                const exact = options.find((option) => {
                    const candidates = [
                        option.code,
                        option.id,
                        option.employeeId !== undefined && option.employeeId !== null ? String(option.employeeId) : '',
                        option.email
                    ];

                    return candidates.some((candidate) => String(candidate || '').trim().toLowerCase() === target);
                });

                return exact ?? options[0] ?? null;
            }),
            catchError(() => of(null))
        );
    }

    rememberEmployeeOptions(options: EmployeeOption[]): void {
        options.forEach((option) => {
            if (option?.code) {
                this.employeeOptionCache.set(option.code, option);
            }
            if (option?.id) {
                this.employeeOptionCache.set(String(option.id), option);
            }
            if (option?.employeeId !== undefined && option.employeeId !== null) {
                this.employeeOptionCache.set(String(option.employeeId), option);
            }
        });
    }

    private getEmployeeDisplayName(option: EmployeeOption): string {
        const fullName = [option.firstName, option.lastName].filter(Boolean).join(' ').trim()
            || option.name?.trim()
            || option.displayLabel?.trim();
            
        let displayName = fullName;
        if (option.initial) {
            const init = option.initial.trim().replace(/\.$/, '');
            displayName = `${init}, ${fullName}`;
        }
            
        return displayName || option.code?.trim() || '';
    }

    /**
     * Ensure all provided employee codes/IDs are resolved in the lookup map.
     * If any are missing, it will fetch them from the API.
     */
    ensureEmployeesInLookup(lookup: Map<string, string>, codes: (string | number | undefined | null)[]): Observable<Map<string, string>> {
        const uniqueCodes = [...new Set(codes)]
            .filter((code): code is string | number => code !== null && code !== undefined)
            .map(code => String(code).trim())
            .filter(code => code && !lookup.has(code));

        if (uniqueCodes.length === 0) {
            return of(lookup);
        }

        const requests = uniqueCodes.map(code => 
            this.getEmployees(code, null).pipe(
                map(employees => employees[0] ? this.mapEmployeesToOptions(employees)[0] : null)
            )
        );

        return forkJoin(requests).pipe(
            map(options => {
                options.filter((opt): opt is EmployeeOption => !!opt).forEach(option => {
                    const label = this.getEmployeeDisplayName(option);
                    if (option.code) lookup.set(String(option.code).trim(), label);
                    if (option.employeeId) lookup.set(String(option.employeeId).trim(), label);
                });
                return lookup;
            }),
            catchError((error) => {
                console.error('Error ensuring employees in lookup:', error);
                return of(lookup);
            })
        );
    }
}
