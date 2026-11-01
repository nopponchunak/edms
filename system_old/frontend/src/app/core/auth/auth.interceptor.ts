import {
    HttpErrorResponse,
    HttpEvent,
    HttpHandlerFn,
    HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from 'app/core/auth/auth.service';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { Observable, catchError, throwError } from 'rxjs';

/**
 * Intercept
 *
 * @param req
 * @param next
 */
export const authInterceptor = (
    req: HttpRequest<unknown>,
    next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
    const authService = inject(AuthService);
    const accessToken = authService.accessToken;
    const isCheckLoginRequest = req.url.includes('/api/check_login');

    // Clone the request object
    let newReq = req.clone();

    // Request
    //
    // If the access token didn't expire, add the Authorization header.
    // We won't add the Authorization header if the access token expired.
    // This will force the server to return a "401 Unauthorized" response
    // for the protected API routes which our response interceptor will
    // catch and delete the access token from the local storage while logging
    // the user out from the app.
    if (accessToken && shouldAttachToken(accessToken)) {
        newReq = req.clone({
            headers: req.headers.set(
                'Authorization',
                'Bearer ' + accessToken
            ),
        });
    }

    // Response
    return next(newReq).pipe(
        catchError((error) => {
            // Catch "401 Unauthorized" responses
            if (error instanceof HttpErrorResponse && error.status === 401) {
                // Sign out
                authService.signOut();

                // Reload the app
                if (!isCheckLoginRequest) {
                    location.reload();
                }
            }

            return throwError(error);
        })
    );
};

const shouldAttachToken = (token: string): boolean => {
    if (token.split('.').length !== 3) {
        return true;
    }

    try {
        return !AuthUtils.isTokenExpired(token);
    } catch {
        return true;
    }
};
