import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { isSystemAdminUser } from 'app/core/utils/system-admin.util';

export const systemAdminGuard: CanActivateFn = () => {
    if (isSystemAdminUser()) {
        return true;
    }

    return inject(Router).parseUrl('/dashboard');
};
