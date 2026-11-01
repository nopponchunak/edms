import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { catchError, map, of } from 'rxjs';

export const noAuthGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return authService.checkLogin().pipe(
        map((isAuthenticated) => {
            if (isAuthenticated) {
                return router.createUrlTree(['/dashboard']);
            }

            return true;
        }),
        catchError(() => of(true))
    );
};





