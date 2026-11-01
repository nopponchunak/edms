import { Route } from '@angular/router';

export const designChangesNotificationRoutes: Route[] = [
    {
        path: '',
        loadComponent: () => import('./design-changes-notification-list/design-changes-notification-list.component').then(m => m.DesignChangesNotificationListComponent)
    },
    {
        path: 'new',
        loadComponent: () => import('./design-changes-notification-form/design-changes-notification-form.component').then(m => m.DesignChangesNotificationFormComponent)
    },
    {
        path: 'edit/:id',
        loadComponent: () => import('./design-changes-notification-form/design-changes-notification-form.component').then(m => m.DesignChangesNotificationFormComponent)
    },
    {
        path: 'view/:id',
        loadComponent: () => import('./design-changes-notification-form/design-changes-notification-form.component').then(m => m.DesignChangesNotificationFormComponent)
    }
];
