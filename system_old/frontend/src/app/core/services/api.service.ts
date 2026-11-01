import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, retry, timeout } from 'rxjs/operators';
import { ApiConfig } from '../config/api.config';

/**
 * API Service for backend integration
 * This service provides methods for all API endpoints
 */
@Injectable({
    providedIn: 'root'
})
export class ApiService {
    private readonly defaultHeaders = new HttpHeaders({
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    });

    constructor(
        private http: HttpClient,
        private apiConfig: ApiConfig
    ) {}

    /**
     * Get base API URL
     */
    private get apiUrl(): string {
        return this.apiConfig.apiUrl;
    }

    /**
     * Build full URL from endpoint
     */
    private buildUrl(endpoint: string): string {
        return this.apiConfig.buildUrl(endpoint);
    }

    /**
     * Create HTTP options with timeout and retry
     */
    private createHttpOptions(options: any = {}): any {
        return {
            ...options,
            headers: options.headers || this.defaultHeaders
        };
    }

    private getCurrentActor(): Record<string, any> | null {
        try {
            const rawUser = localStorage.getItem('user_raw_data') || localStorage.getItem('user');
            if (!rawUser) {
                return null;
            }

            const user = JSON.parse(rawUser);
            const actor = {
                id: user?.id ?? user?.user_id ?? null,
                username: user?.username ?? user?.userName ?? null,
                code: user?.code ?? user?.employeeCode ?? user?.employee_code ?? null,
                name: user?.name ?? user?.fullName ?? user?.full_name ?? null,
                email: user?.email ?? null,
            };

            const hasActorValue = Object.values(actor).some((value) => value !== null && value !== undefined && String(value).trim() !== '');
            return hasActorValue ? actor : null;
        } catch (error) {
            if (this.apiConfig.isLoggingEnabled) {
                console.error('Unable to read current actor:', error);
            }
            return null;
        }
    }

    private withCurrentActor<T extends Record<string, any>>(data: T): T {
        if (data?.login_by) {
            return data;
        }

        const actor = this.getCurrentActor();
        return actor ? { ...data, login_by: actor } : data;
    }

    /**
     * Handle HTTP errors
     */
    private handleError(error: any): Observable<never> {
        let errorMessage = 'An unknown error occurred';

        if (error.error instanceof ErrorEvent) {
            // Client-side error
            errorMessage = `Error: ${error.error.message}`;
        } else {
            // Server-side error
            errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
        }

        if (this.apiConfig.isLoggingEnabled) {
            console.error('API Error:', errorMessage, error);
        }

        return throwError(() => error);
    }

    // ===========================================
    // Authentication Endpoints
    // ===========================================

    /**
     * Login user
     */
    login(credentials: { username: string; password: string }): Observable<any> {
        // Convert to x-www-form-urlencoded format
        const body = new HttpParams()
            .set('username', credentials.username)
            .set('password', credentials.password);

        const headers = new HttpHeaders({
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
        });

        return this.http.post(
            this.buildUrl('api/login'),
            body.toString(),
            {
                headers: headers
            }
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            retry(this.apiConfig.apiRetryAttempts),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Login user via LDAP
     */
    loginLdap(credentials: { username: string; password: string }): Observable<any> {
        const body = {
            username: credentials.username,
            password: credentials.password
        };

        return this.http.post(
            this.buildUrl('api/login_ldap'),
            body,
            {
                headers: this.defaultHeaders
            }
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            retry(this.apiConfig.apiRetryAttempts),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Check current login token against backend token lifetime
     */
    checkLogin(token: string): Observable<any> {
        const headers = new HttpHeaders({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`
        });

        return this.http.post(
            this.buildUrl('api/check_login'),
            {},
            {
                headers: headers
            }
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Register user
     */
    register(userData: any): Observable<any> {
        return this.http.post(
            this.buildUrl('auth/register'),
            userData,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            retry(this.apiConfig.apiRetryAttempts),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get user profile
     */
    getProfile(): Observable<any> {
        return this.http.get(
            this.buildUrl('auth/profile'),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Logout user
     */
    logout(): Observable<any> {
        return this.http.post(
            this.buildUrl('auth/logout'),
            {},
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Refresh token
     */
    refreshToken(): Observable<any> {
        return this.http.post(
            this.buildUrl('auth/refresh'),
            {},
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            retry(this.apiConfig.apiRetryAttempts),
            catchError(this.handleError.bind(this))
        );
    }

    // ===========================================
    // User Management Endpoints
    // ===========================================

    /**
     * Get all users
     */
    getUsers(params?: any): Observable<any> {
        const httpParams = params ? new HttpParams({ fromObject: params }) : undefined;
        return this.http.get(
            this.buildUrl('users'),
            this.createHttpOptions({ params: httpParams })
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get user by ID
     */
    getUserById(id: string): Observable<any> {
        return this.http.get(
            this.buildUrl(`users/${id}`),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Update user
     */
    updateUser(id: string, userData: any): Observable<any> {
        return this.http.put(
            this.buildUrl(`users/${id}`),
            userData,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Delete user
     */
    deleteUser(id: string): Observable<any> {
        return this.http.delete(
            this.buildUrl(`users/${id}`),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    // ===========================================
    // Form Management Endpoints
    // ===========================================

    /**
     * Get all forms
     */
    getForms(params?: any): Observable<any> {
        const httpParams = params ? new HttpParams({ fromObject: params }) : undefined;
        return this.http.get(
            this.buildUrl('forms'),
            this.createHttpOptions({ params: httpParams })
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get form by ID
     */
    getFormById(id: string): Observable<any> {
        return this.http.get(
            this.buildUrl(`forms/${id}`),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Create new form
     */
    createForm(formData: any): Observable<any> {
        return this.http.post(
            this.buildUrl('forms'),
            formData,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Update form
     */
    updateForm(id: string, formData: any): Observable<any> {
        return this.http.put(
            this.buildUrl(`forms/${id}`),
            formData,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Delete form
     */
    deleteForm(id: string): Observable<any> {
        return this.http.delete(
            this.buildUrl(`forms/${id}`),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Submit form response
     */
    submitFormResponse(formId: string, responseData: any): Observable<any> {
        return this.http.post(
            this.buildUrl(`forms/${formId}/responses`),
            responseData,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get form responses
     */
    getFormResponses(formId: string, params?: any): Observable<any> {
        const httpParams = params ? new HttpParams({ fromObject: params }) : undefined;
        return this.http.get(
            this.buildUrl(`forms/${formId}/responses`),
            this.createHttpOptions({ params: httpParams })
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    // ===========================================
    // File Management Endpoints
    // ===========================================

    /**
     * Upload file
     */
    uploadFile(file: File, additionalData?: Record<string, any>): Observable<any> {
        // Validate file size
        if (!this.apiConfig.isFileSizeValid(file.size)) {
            return throwError(() => new Error(this.apiConfig.getFileSizeExceededMessage(file)));
        }

        // Validate file type
        if (!this.apiConfig.isFileTypeAllowed(file.name)) {
            return throwError(() => new Error(`File type not allowed. Allowed types: ${this.apiConfig.allowedFileTypes.join(', ')}`));
        }

        const formData = new FormData();
        formData.append('file', file);

        // Add additional data if provided
        if (additionalData) {
            Object.keys(additionalData).forEach(key => {
                formData.append(key, additionalData[key]);
            });
        }

        const headers = new HttpHeaders();
        // Don't set Content-Type for FormData, let browser set it with boundary

        return this.http.post(
            this.buildUrl('files/upload'),
            formData,
            { headers }
        ).pipe(
            timeout(this.apiConfig.apiTimeout * 2), // Longer timeout for file uploads
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Upload multiple files to /api/upload_multiple_files endpoint
     * Sends form-data with files[], path, original (Y = use original name, N = system assigns name)
     */
    uploadMultipleFilesToApi(
        files: File[],
        path: string = 'uploads/files/',
        useOriginalName: 'Y' | 'N' = 'Y',
        allowedExtensions: string[] = []
    ): Observable<any> {
        const oversizedFiles = this.apiConfig.getOversizedFiles(files);
        if (oversizedFiles.length > 0) {
            return throwError(() => new Error(this.apiConfig.getFileSizeExceededMessage(oversizedFiles)));
        }

        const formData = new FormData();
        files.forEach(file => formData.append('files[]', file));
        formData.append('path', path);
        formData.append('original', useOriginalName);
        allowedExtensions.forEach(extension => formData.append('allowed_extensions[]', extension));

        const headers = new HttpHeaders();

        return this.http.post(
            this.buildUrl('api/upload_multiple_files'),
            formData,
            { headers }
        ).pipe(
            timeout(this.apiConfig.apiTimeout * 2),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get file by ID
     */
    getFileById(id: string): Observable<any> {
        return this.http.get(
            this.buildUrl(`files/${id}`),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Delete file
     */
    deleteFile(id: string): Observable<any> {
        return this.http.delete(
            this.buildUrl(`files/${id}`),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    // ===========================================
    // Dashboard & Analytics Endpoints
    // ===========================================

    /**
     * Get dashboard data
     */
    getDashboardData(): Observable<any> {
        return this.http.get(
            this.buildUrl('dashboard'),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get analytics data
     */
    getAnalyticsData(period?: string): Observable<any> {
        const params = period ? new HttpParams().set('period', period) : undefined;
        return this.http.get(
            this.buildUrl('analytics'),
            this.createHttpOptions({ params })
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get form statistics
     */
    getFormStatistics(formId?: string): Observable<any> {
        const endpoint = formId ? `statistics/forms/${formId}` : 'statistics/forms';
        return this.http.get(
            this.buildUrl(endpoint),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    // ===========================================
    // Settings & Configuration Endpoints
    // ===========================================

    /**
     * Get system settings
     */
    getSettings(): Observable<any> {
        return this.http.get(
            this.buildUrl('settings'),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Update system settings
     */
    updateSettings(settings: any): Observable<any> {
        return this.http.put(
            this.buildUrl('settings'),
            settings,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get user preferences
     */
    getUserPreferences(): Observable<any> {
        return this.http.get(
            this.buildUrl('user/preferences'),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Update user preferences
     */
    updateUserPreferences(preferences: any): Observable<any> {
        return this.http.put(
            this.buildUrl('user/preferences'),
            preferences,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    // ===========================================
    // Notification Endpoints
    // ===========================================

    /**
     * Get notifications
     */
    getNotifications(params?: any): Observable<any> {
        const httpParams = params ? new HttpParams({ fromObject: params }) : undefined;
        return this.http.get(
            this.buildUrl('notifications'),
            this.createHttpOptions({ params: httpParams })
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Mark notification as read
     */
    markNotificationAsRead(id: string): Observable<any> {
        return this.http.put(
            this.buildUrl(`notifications/${id}/read`),
            {},
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Mark all notifications as read
     */
    markAllNotificationsAsRead(): Observable<any> {
        return this.http.put(
            this.buildUrl('notifications/read-all'),
            {},
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    // ===========================================
    // Audit Log Endpoints
    // ===========================================

    /**
     * Get audit logs
     */
    getAuditLogs(filters?: any): Observable<any> {
        const httpParams = filters ? new HttpParams({ fromObject: filters }) : undefined;
        return this.http.get(
            this.buildUrl('audit-logs'),
            this.createHttpOptions({ params: httpParams })
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get audit log by ID
     */
    getAuditLogById(id: string): Observable<any> {
        return this.http.get(
            this.buildUrl(`audit-logs/${id}`),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    // ===========================================
    // Single Source Justification Endpoints
    // ===========================================

    /**
     * Get single source justification page with DataTables format
     */
    getSingleSourceJustificationPage(params: {
        draw: number;
        type: string;
        columns: Array<{ data: string }>;
        order: Array<{ column: number; dir: string }>;
        start: number;
        length: number;
        search: { value: string; regex: boolean };
    }): Observable<any> {
        return this.http.post(
            this.buildUrl('api/single_source_justification_page'),
            params,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    // ===========================================
    // Sub-Consultant Assessment Endpoints
    // ===========================================

    /**
     * Get sub-consultant assessment page with DataTables format
     * POST /api/sub_consultant_assessments_page
     */
    getSubConsultantAssessmentPage(params: {
        draw: number;
        type: string;
        columns: Array<{ data: string }>;
        order: Array<{ column: number; dir: string }>;
        start: number;
        length: number;
        search: { value: string; regex: boolean };
    }): Observable<any> {
        return this.http.post(
            this.buildUrl('api/sub_consultant_assessments_page'),
            params,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get proposal contract review page with DataTables format
     * POST /api/proposal_contract_reviews_page
     */
    getProposalContractReviewsPage(params: {
        draw: number;
        type: string;
        columns: Array<{ data: string }>;
        order: Array<{ column: number; dir: string }>;
        start: number;
        length: number;
        search: { value: string; regex: boolean };
    }): Observable<any> {
        return this.http.post(
            this.buildUrl('api/proposal_contract_reviews_page'),
            params,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Create sub-consultant assessment
     * POST /api/sub_consultant_assessments
     */
    createSubConsultantAssessment(data: any): Observable<any> {
        return this.http.post(
            this.buildUrl('api/sub_consultant_assessments'),
            data,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get sub-consultant assessment by ID
     * GET /api/sub_consultant_assessments/{id}
     */
    getSubConsultantAssessment(id: string | number): Observable<any> {
        return this.http.get(
            this.buildUrl(`api/sub_consultant_assessments/${id}`),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Update sub-consultant assessment
     * PUT /api/sub_consultant_assessments/{id}
     */
    updateSubConsultantAssessment(id: string | number, data: any): Observable<any> {
        return this.http.put(
            this.buildUrl(`api/sub_consultant_assessments/${id}`),
            data,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Delete sub-consultant assessment
     * DELETE /api/sub_consultant_assessments/{id}
     */
    deleteSubConsultantAssessment(id: string | number): Observable<any> {
        return this.http.delete(
            this.buildUrl(`api/sub_consultant_assessments/${id}`),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    // ===========================================
    // Expenses Claim Endpoints
    // ===========================================

    /**
     * Get expenses claim page with DataTables format
     * POST /api/expenses_claims_page
     */
    getExpensesClaimPage(params: {
        draw: number;
        type?: string;
        columns: Array<{ data: string }>;
        order: Array<{ column: number; dir: string }>;
        start: number;
        length: number;
        search: { value: string; regex: boolean };
        status?: string | null;
        approved_month?: string | null;
        tab?: string;
    }): Observable<any> {
        return this.http.post(
            this.buildUrl('api/expenses_claims_page'),
            params,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Create expenses claim
     * POST /api/expenses_claims
     */
    createExpensesClaim(data: any): Observable<any> {
        return this.http.post(
            this.buildUrl('api/expenses_claims'),
            data,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get new expenses claim form data
     * GET /api/expenses_claims/create
     */
    getExpensesClaimCreate(): Observable<any> {
        return this.http.get(
            this.buildUrl('api/expenses_claims/create'),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get current user's expenses claim draft
     * GET /api/expenses_claims_draft
     */
    getExpensesClaimDraft(): Observable<any> {
        return this.http.get(
            this.buildUrl('api/expenses_claims_draft'),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get expenses claim by ID
     * GET /api/expenses_claims/{id}
     */
    getExpensesClaim(id: string | number): Observable<any> {
        return this.http.get(
            this.buildUrl(`api/expenses_claims/${id}`),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    getExpensesClaimCombinedPdfUrl(id: string | number): string {
        return this.buildUrl(`api/expenses_claims/${encodeURIComponent(String(id))}/combined-pdf`);
    }

    getExpensesClaimPrintPdfUrl(id: string | number): string {
        return this.buildUrl(`api/expenses_claims/${encodeURIComponent(String(id))}/print`);
    }

    /**
     * Update expenses claim
     * PUT /api/expenses_claims/{id}
     */
    updateExpensesClaim(id: string | number, data: any): Observable<any> {
        return this.http.put(
            this.buildUrl(`api/expenses_claims/${id}`),
            data,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Delete expenses claim
     * DELETE /api/expenses_claims/{id}
     */
    deleteExpensesClaim(id: string | number): Observable<any> {
        return this.http.delete(
            this.buildUrl(`api/expenses_claims/${id}`),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    // ===========================================
    // Allowance After 10.00 PM Endpoints
    // ===========================================

    /**
     * Get allowance after 10.00 PM page with DataTables format
     * POST /api/allowance_after_10pm_page
     */
    getAllowanceAfter10pmPage(params: {
        draw: number;
        type?: string;
        columns: Array<{ data: string }>;
        order: Array<{ column: number; dir: string }>;
        start: number;
        length: number;
        search: { value: string; regex: boolean };
        status?: string | null;
        discipline?: string | null;
        approved_month?: string | null;
        tab?: string;
    }): Observable<any> {
        return this.http.post(
            this.buildUrl('api/allowance_after_10pm_page'),
            params,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Create allowance after 10.00 PM form
     * POST /api/allowance_after_10pm
     */
    createAllowanceAfter10pm(data: any): Observable<any> {
        return this.http.post(
            this.buildUrl('api/allowance_after_10pm'),
            data,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get new allowance after 10pm form data
     * GET /api/allowance_after_10pm/create
     */
    getAllowanceAfter10pmCreate(): Observable<any> {
        return this.http.get(
            this.buildUrl('api/allowance_after_10pm/create'),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get current user's allowance after 10.00 PM draft
     * GET /api/allowance_after_10pm_draft
     */
    getAllowanceAfter10pmDraft(): Observable<any> {
        return this.http.get(
            this.buildUrl('api/allowance_after_10pm_draft'),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get allowance after 10.00 PM form by ID
     * GET /api/allowance_after_10pm/{id}
     */
    getAllowanceAfter10pm(id: string | number): Observable<any> {
        return this.http.get(
            this.buildUrl(`api/allowance_after_10pm/${id}`),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    getAllowanceAfter10pmCombinedPdfUrl(id: string | number): string {
        return this.buildUrl(`api/allowance_after_10pm/${encodeURIComponent(String(id))}/combined-pdf`);
    }

    getAllowanceAfter10pmPrintPdfUrl(id: string | number): string {
        return this.buildUrl(`api/allowance_after_10pm/${encodeURIComponent(String(id))}/print`);
    }

    /**
     * Get allowance after 10.00 PM attachment as data URL
     * GET /api/allowance_after_10pm_attachment_data_url
     */
    getAllowanceAfter10pmAttachmentDataUrl(path: string): Observable<any> {
        const params = new HttpParams().set('path', path);
        return this.http.get(
            this.buildUrl('api/allowance_after_10pm_attachment_data_url'),
            this.createHttpOptions({ params })
        ).pipe(
            timeout(this.apiConfig.apiTimeout * 2),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Update allowance after 10.00 PM form
     * PUT /api/allowance_after_10pm/{id}
     */
    updateAllowanceAfter10pm(id: string | number, data: any): Observable<any> {
        return this.http.put(
            this.buildUrl(`api/allowance_after_10pm/${id}`),
            data,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Delete allowance after 10.00 PM form
     * DELETE /api/allowance_after_10pm/{id}
     */
    deleteAllowanceAfter10pm(id: string | number): Observable<any> {
        return this.http.delete(
            this.buildUrl(`api/allowance_after_10pm/${id}`),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    // ===========================================
    // User Settings / User Page Endpoints
    // ===========================================

    /**
     * Get user page data with DataTables-style pagination
     * Matches backend endpoint: POST api/user_page
     */
    getUserPage(params: {
        draw: number;
        order: Array<{ column: number; dir: 'asc' | 'desc' }>;
        start: number;
        length: number;
        search: { value: string; regex: boolean };
        type?: string;
        employee_type_name?: string;
        title_name?: string;
        level_name?: string;
        department_name?: string;
    }): Observable<any> {
        return this.http.post(
            this.buildUrl('api/user_page'),
            params,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get Active Directory user filter options from employee profile fields
     * Matches backend endpoint: GET /api/user/sync-ad/filter-options
     */
    getSyncAdUserFilterOptions(): Observable<any> {
        return this.http.get(
            this.buildUrl('api/user/sync-ad/filter-options'),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Sync employee profiles from HRM into employees and sync_ad users
     * Matches backend endpoint: POST /api/sync/employees
     */
    syncEmployees(data: { last_sync?: string } = {}): Observable<any> {
        return this.http.post(
            this.buildUrl('api/sync/employees'),
            data,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout * 3),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get user detail by ID (settings page)
     * Matches backend endpoint: GET /api/user/{id}
     */
    getUserDetail(id: string | number): Observable<any> {
        return this.http.get(
            this.buildUrl(`api/user/${id}`),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get users assigned to a permission
     * Matches backend endpoint: GET /api/get_users_by_permission_id/{id}
     */
    getUsersByPermissionId(id: string | number): Observable<any> {
        return this.http.get(
            this.buildUrl(`api/get_users_by_permission_id/${id}`),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Create user (settings page)
     * Matches backend endpoint: POST /api/user
     */
    createUser(data: {
        permission_id: number;
        code: string;
        username: string;
        name: string;
        email: string;
        password: string;
        phone: string;
        image?: string | null;
        type?: string;
    }): Observable<any> {
        return this.http.post(
            this.buildUrl('api/user'),
            this.withCurrentActor(data),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Update user (settings page)
     * Matches backend endpoint: PUT /api/user/{id}
     */
    updateUserDetail(id: string | number, data: any): Observable<any> {
        return this.http.put(
            this.buildUrl(`api/user/${id}`),
            this.withCurrentActor(data),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Update user status (settings page)
     * Matches backend endpoint: PUT /api/user/{id}/status
     */
    updateUserStatus(id: string | number, data: { status: string }): Observable<any> {
        return this.http.put(
            this.buildUrl(`api/user/${id}/status`),
            this.withCurrentActor(data),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Set all Active Directory users status to Yes
     * Matches backend endpoint: PUT /api/user/sync-ad/status/yes-all
     */
    updateAllSyncAdStatusYes(): Observable<any> {
        return this.http.put(
            this.buildUrl('api/user/sync-ad/status/yes-all'),
            this.withCurrentActor({}),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Update user permission only (settings page)
     * Matches backend endpoint: PUT /api/user/{id}/permission
     */
    updateUserPermission(id: string | number, data: { permission_id: number }): Observable<any> {
        return this.http.put(
            this.buildUrl(`api/user/${id}/permission`),
            this.withCurrentActor(data),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    // ===========================================
    // Audit Log Endpoints
    // ===========================================

    /**
     * Get audit log page data with DataTables-style pagination
     * Matches backend endpoint: POST /api/audit_logs_page
     */
    getAuditLogPage(params: {
        draw: number;
        order: Array<{ column: number; dir: 'asc' | 'desc' }>;
        start: number;
        length: number;
        search: { value: string; regex: boolean };
        type?: string;
        date_from?: string;
        date_to?: string;
    }): Observable<any> {
        return this.http.post(
            this.buildUrl('api/audit_logs_page'),
            this.withCurrentActor(params),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get audit log type options
     * Matches backend endpoint: GET /api/audit_logs/types
     */
    getAuditLogTypes(): Observable<any> {
        return this.http.get(
            this.buildUrl('api/audit_logs/types'),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get single source justification by ID
     */
    getSingleSourceJustification(id: string | number): Observable<any> {
        return this.http.get(
            this.buildUrl(`api/single_source_justification/${id}`),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Create single source justification
     */
    createSingleSourceJustification(data: any): Observable<any> {
        return this.http.post(
            this.buildUrl('api/single_source_justification'),
            data,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Update single source justification
     */
    updateSingleSourceJustification(id: string | number, data: any): Observable<any> {
        return this.http.put(
            this.buildUrl(`api/single_source_justification/${id}`),
            data,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Delete single source justification
     */
    deleteSingleSourceJustification(id: string | number): Observable<any> {
        return this.http.delete(
            this.buildUrl(`api/single_source_justification/${id}`),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Update status for any table (generic endpoint)
     */
    updateStatus(id: string | number, updateStatusDto: { table: string; field: string; status: string }): Observable<any> {
        return this.http.put(
            this.buildUrl(`api/update_status/${id}`),
            this.withCurrentActor(updateStatusDto),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    // ===========================================
    // Project Quality Assurance Plan Endpoints
    // ===========================================

    /**
     * Get project quality assurance plan page with DataTables format
     * POST /api/project_quality_assurance_plans_page
     */
    getProjectQualityAssurancePlanPage(params: {
        draw: number;
        type: string;
        columns: Array<{ data: string }>;
        order: Array<{ column: number; dir: string }>;
        start: number;
        length: number;
        search: { value: string; regex: boolean };
    }): Observable<any> {
        return this.http.post(
            this.buildUrl('api/project_quality_assurance_plans_page'),
            params,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get project quality assurance plan by ID
     * GET /api/project_quality_assurance_plans/{id}
     */
    getProjectQualityAssurancePlan(id: string | number): Observable<any> {
        return this.http.get(
            this.buildUrl(`api/project_quality_assurance_plans/${id}`),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Create project quality assurance plan
     * POST /api/project_quality_assurance_plans
     */
    createProjectQualityAssurancePlan(data: any): Observable<any> {
        return this.http.post(
            this.buildUrl('api/project_quality_assurance_plans'),
            data,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Update project quality assurance plan
     * PUT /api/project_quality_assurance_plans/{id}
     */
    updateProjectQualityAssurancePlan(id: string | number, data: any): Observable<any> {
        return this.http.put(
            this.buildUrl(`api/project_quality_assurance_plans/${id}`),
            data,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Delete project quality assurance plan
     * DELETE /api/project_quality_assurance_plans/{id}
     */
    deleteProjectQualityAssurancePlan(id: string | number): Observable<any> {
        return this.http.delete(
            this.buildUrl(`api/project_quality_assurance_plans/${id}`),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    // ===========================================
    // Permission Endpoints
    // ===========================================

    /**
     * Get permission page data with pagination (DataTables format)
     * POST /api/permission_page
     */
    getPermissionPage(params: {
        draw: number;
        columns: Array<{ data: string }>;
        order: Array<{ column: number; dir: 'asc' | 'desc' }>;
        start: number;
        length: number;
        search: { value: string; regex: boolean };
    }): Observable<any> {
        return this.http.post(
            this.buildUrl('api/permission_page'),
            params,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get main menu with menus tree
     * GET /api/get_main_menu
     */
    getMainMenu(): Observable<any> {
        return this.http.get(
            this.buildUrl('api/get_main_menu'),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get permission menu data
     * POST /api/get_permisson_menu
     */
    getPermissionMenu(permissionId: number): Observable<any> {
        return this.http.post(
            this.buildUrl('api/get_permisson_menu'),
            { permission_id: permissionId },
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get permission by ID
     * GET /api/permission/{id}
     */
    getPermission(id: string | number): Observable<any> {
        return this.http.get(
            this.buildUrl(`api/permission/${id}`),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get permissions list
     * GET /api/get_permission
     */
    getPermissionsList(): Observable<any> {
        return this.http.get(
            this.buildUrl('api/get_permission'),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Create permission
     * POST /api/permission
     */
    createPermission(data: {
        name: string;
        menu: Array<{
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
        }>;
    }): Observable<any> {
        return this.http.post(
            this.buildUrl('api/permission'),
            data,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Update permission
     * PUT /api/permission/{id}
     */
    updatePermission(id: string | number, data: {
        name: string;
        menu: Array<{
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
        }>;
    }): Observable<any> {
        return this.http.put(
            this.buildUrl(`api/permission/${id}`),
            data,
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    // ===========================================
    // Project Types Endpoints
    // ===========================================

    /**
     * Get project types for dropdowns
     * GET /api/get_project_types
     */
    getProjectTypes(): Observable<any> {
        return this.http.get(
            this.buildUrl('api/get_project_types'),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Get project details for dropdowns (code = Project No., name = Project Name)
     * GET /api/get_project_details
     */
    getProjectDetails(): Observable<{ status: boolean; message: string; data: Array<{ id: number; code: string; name: string; detail?: string; is_active?: number }> }> {
        return this.http.get(
            this.buildUrl('api/get_project_details'),
            this.createHttpOptions()
        ).pipe(
            timeout(this.apiConfig.apiTimeout),
            catchError(this.handleError.bind(this))
        );
    }
}
