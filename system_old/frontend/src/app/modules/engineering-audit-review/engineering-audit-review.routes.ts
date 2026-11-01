import { Route } from '@angular/router';

export const engineeringAuditReviewRoutes: Route[] = [
    {
        path: '',
        loadComponent: () => import('./engineering-audit-review-list/engineering-audit-review-list.component').then(m => m.EngineeringAuditReviewListComponent)
    },
    {
        path: 'new',
        loadComponent: () => import('./engineering-audit-review-form/engineering-audit-review-form.component').then(m => m.EngineeringAuditReviewFormComponent)
    },
    {
        path: 'edit/:id',
        loadComponent: () => import('./engineering-audit-review-form/engineering-audit-review-form.component').then(m => m.EngineeringAuditReviewFormComponent)
    },
    {
        path: 'view/:id',
        loadComponent: () => import('./engineering-audit-review-form/engineering-audit-review-form.component').then(m => m.EngineeringAuditReviewFormComponent)
    },
    {
        path: 'action/:id/:type',
        loadComponent: () => import('./engineering-audit-review-action/engineering-audit-review-action.component').then(m => m.EngineeringAuditReviewActionComponent)
    }
];
