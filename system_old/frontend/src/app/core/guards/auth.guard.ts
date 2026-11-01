import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { catchError, map, of } from 'rxjs';

export const authGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return authService.checkLogin().pipe(
        map((isAuthenticated) => {
            if (isAuthenticated) {
                return true;
            }

            return router.createUrlTree(['/sign-in'], { queryParams: { returnUrl: state.url } });
        }),
        catchError(() => of(router.createUrlTree(['/sign-in'], { queryParams: { returnUrl: state.url } })))
    );
};





