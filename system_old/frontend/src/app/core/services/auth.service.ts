import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, of, throwError, delay, map, catchError } from 'rxjs';
import { Router } from '@angular/router';
import { User, LoginRequest, RegisterRequest, AuthResponse, UserRole } from '../models/user.model';
import { ApiService } from './api.service';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private currentUserSubject = new BehaviorSubject<User | null>(null);
    public currentUser$ = this.currentUserSubject.asObservable();

    // Mock admin user
    private mockAdminUser: User = {
        id: 'admin-001',
        email: 'admin@admin.com',
        firstName: 'Admin',
        lastName: 'User',
        role: UserRole.ADMIN,
        isActive: true,
        status: 'online',
        createdAt: new Date(),
        updatedAt: new Date()
    };

    constructor(
        private router: Router,
        private apiService: ApiService
    ) {
        this.loadUserFromStorage();
    }

    /**
     * Register new user (Mock implementation)
     */
    register(data: RegisterRequest): Observable<AuthResponse> {
        // Simulate API delay
        return of({
            access_token: this.generateMockToken(),
            user: {
                id: 'user-' + Date.now(),
                email: data.email,
                firstName: data.firstName,
                lastName: data.lastName,
                phoneNumber: data.phoneNumber,
                role: data.role || UserRole.USER,
                isActive: true,
                status: 'online' as const,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        }).pipe(delay(1000));
    }

    /**
     * Login user
     */
    login(data: LoginRequest): Observable<AuthResponse> {
        // Call API service with username (using email field as username)
        return this.apiService.login({
            username: data.email,
            password: data.password
        }).pipe(
            map((apiResponse: any) => {
                // Map API response to AuthResponse format
                // API response: { code, status, message, data: {...}, token }
                if (apiResponse.status && apiResponse.token && apiResponse.data) {
                    const userData = apiResponse.data;

                    // Map user data from API response (supporting new format)
                    const user: User = {
                        id: String(userData.id),
                        email: userData.email || userData.username || data.email,
                        firstName: userData.firstname || userData.name?.split(' ')[0] || userData.name || 'User',
                        lastName: userData.lastname || userData.name?.split(' ').slice(1).join(' ') || '',
                        phoneNumber: userData.phone || undefined,
                        role: (userData.is_approver === 1 || userData.permission_id === 1) ? UserRole.ADMIN : UserRole.USER,
                        isActive: userData.active === 'PER' || userData.status === 'Yes' || true,
                        status: 'online',
                        createdAt: userData.created_at ? new Date(userData.created_at) : new Date(),
                        updatedAt: userData.updated_at ? new Date(userData.updated_at) : new Date()
                    };

                    const response: AuthResponse = {
                        access_token: apiResponse.token,
                        user: user
                    };

                    // Store token and user data in localStorage
                    this.handleAuthResponse(response);

                    // Store raw API response data in localStorage for future use
                    localStorage.setItem('user_raw_data', JSON.stringify(userData));
                    localStorage.setItem('token', apiResponse.token);
                    this.storeUserState(userData);
                    
                    // Store permission_id if available (for menu permissions)
                    if (userData.permission_id) {
                        localStorage.setItem('permission_id', String(userData.permission_id));
                    }

                    return response;
                } else {
                    throw new Error(apiResponse.message || 'Login failed');
                }
            }),
            catchError((error) => {
                // Handle error and return user-friendly message
                const errorMessage = error.error?.message || error.message || 'Invalid username or password. Please try again.';
                return throwError(() => new Error(errorMessage));
            })
        );
    }

    /**
     * Login user via LDAP
     */
    loginLdap(data: { username: string; password: string }): Observable<AuthResponse> {
        // Call API service LDAP login endpoint
        return this.apiService.loginLdap({
            username: data.username,
            password: data.password
        }).pipe(
            map((apiResponse: any) => {
                // Map API response to AuthResponse format
                // API response: { code, status, message, data: {...}, token }
                if (apiResponse.status && apiResponse.token && apiResponse.data) {
                    const userData = apiResponse.data;

                    // Map user data from API response
                    const user: User = {
                        id: String(userData.id),
                        email: userData.email || userData.username || data.username,
                        firstName: userData.firstname || '',
                        lastName: userData.lastname || '',
                        phoneNumber: undefined,
                        role: userData.is_approver === 1 ? UserRole.ADMIN : UserRole.USER,
                        isActive: userData.active === 'PER' || userData.active === 'Yes',
                        status: 'online',
                        createdAt: userData.created_at ? new Date(userData.created_at) : new Date(),
                        updatedAt: userData.updated_at ? new Date(userData.updated_at) : new Date()
                    };

                    const response: AuthResponse = {
                        access_token: apiResponse.token,
                        user: user
                    };

                    // Store token and user data in localStorage
                    this.handleAuthResponse(response);

                    // Store raw API response data in localStorage for future use
                    localStorage.setItem('user_raw_data', JSON.stringify(userData));
                    localStorage.setItem('token', apiResponse.token);
                    this.storeUserState(userData);
                    
                    // Store permission_id if available (for menu permissions)
                    if (userData.permission_id) {
                        localStorage.setItem('permission_id', String(userData.permission_id));
                    }

                    return response;
                } else {
                    throw new Error(apiResponse.message || 'LDAP login failed');
                }
            }),
            catchError((error) => {
                // Handle error and return user-friendly message
                const errorMessage = error.error?.message || error.message || 'Invalid username or password. Please try again.';
                return throwError(() => new Error(errorMessage));
            })
        );
    }

    /**
     * Logout user
     */
    logout(): void {
        this.clearAuthStorage();
        this.router.navigate(['/sign-in']);
    }

    /**
     * Get current user profile (Mock implementation)
     */
    getProfile(): Observable<User> {
        const user = this.currentUserSubject.value;
        if (user) {
            return of(user).pipe(delay(500));
        }
        return throwError(() => new Error('User not found'));
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated(): boolean {
        return !!this.getToken();
    }

    /**
     * Check current token with backend. This is the source of truth for token lifetime.
     */
    checkLogin(): Observable<boolean> {
        const token = this.getToken();

        if (!token) {
            this.clearAuthStorage();
            return of(false);
        }

        return this.apiService.checkLogin(token).pipe(
            map((apiResponse: any) => {
                if (apiResponse?.status && apiResponse?.token) {
                    this.storeToken(apiResponse.token);

                    if (apiResponse.data) {
                        localStorage.setItem('token_status', JSON.stringify(apiResponse.data));
                    }

                    return true;
                }

                this.clearAuthStorage();
                return false;
            }),
            catchError(() => {
                this.clearAuthStorage();
                return of(false);
            })
        );
    }

    /**
     * Get access token
     */
    getToken(): string | null {
        return localStorage.getItem('access_token') || localStorage.getItem('token');
    }

    /**
     * Get current user value
     */
    get currentUserValue(): User | null {
        return this.currentUserSubject.value;
    }

    /**
     * Handle authentication response
     */
    private handleAuthResponse(response: AuthResponse): void {
        if (response.access_token) {
            this.storeToken(response.access_token);
            localStorage.setItem('user', JSON.stringify(response.user));
            this.currentUserSubject.next(response.user);
        }
    }

    private storeToken(token: string): void {
        localStorage.setItem('access_token', token);
        localStorage.setItem('accessToken', token);
        localStorage.setItem('token', token);
    }

    private clearAuthStorage(): void {
        localStorage.removeItem('access_token');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('token');
        localStorage.removeItem('token_status');
        localStorage.removeItem('user');
        localStorage.removeItem('user_raw_data');
        localStorage.removeItem('state');
        localStorage.removeItem('permission_id');
        localStorage.removeItem('menu_permissions');
        this.currentUserSubject.next(null);
    }

    private storeUserState(userData: any): void {
        const code = this.getUserCode(userData);
        const state = this.extractLettersFromCode(code);

        if (state) {
            localStorage.setItem('state', state);
            return;
        }

        localStorage.removeItem('state');
    }

    private getUserCode(userData: any): string | null {
        const raw =
            userData?.code ??
            userData?.employeeCode ??
            userData?.employee_code ??
            userData?.user_code ??
            userData?.username ??
            userData?.userName ??
            null;

        if (raw === null || raw === undefined) {
            return null;
        }

        const code = String(raw).trim();
        return code !== '' ? code : null;
    }

    private extractLettersFromCode(code: string | null): string | null {
        const state = String(code || '')
            .match(/[A-Za-z]/g)
            ?.join('')
            .toUpperCase() || '';

        return state || null;
    }

    /**
     * Load user from local storage on service initialization
     */
    private loadUserFromStorage(): void {
        const token = this.getToken();
        const userStr = localStorage.getItem('user');

        if (token && userStr) {
            try {
                const user = JSON.parse(userStr);
                this.currentUserSubject.next(user);
            } catch (error) {
                console.error('Error parsing user data:', error);
                this.logout();
            }
        }
    }

    /**
     * Generate mock JWT token
     */
    private generateMockToken(): string {
        const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
        const payload = btoa(JSON.stringify({
            sub: 'mock-user',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
        }));
        const signature = 'mock-signature';
        return `${header}.${payload}.${signature}`;
    }

    // ===========================================
    // Future API Integration Methods
    // ===========================================
    // These methods are prepared for future API integration
    // Uncomment and modify when real API is available

    /*
    private apiUrl = 'http://localhost:3000/api';

    registerWithAPI(data: RegisterRequest): Observable<AuthResponse> {
        return this.http.post<AuthResponse>(`${this.apiUrl}/auth/register`, data).pipe(
            tap(response => this.handleAuthResponse(response))
        );
    }

    loginWithAPI(data: LoginRequest): Observable<AuthResponse> {
        return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, data).pipe(
            tap(response => this.handleAuthResponse(response))
        );
    }

    getProfileFromAPI(): Observable<User> {
        return this.http.get<User>(`${this.apiUrl}/auth/profile`).pipe(
            tap(user => {
                this.currentUserSubject.next(user);
                localStorage.setItem('user', JSON.stringify(user));
            })
        );
    }
    */
}
