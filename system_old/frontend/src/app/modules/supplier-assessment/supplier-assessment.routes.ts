import { Route } from '@angular/router';

export default [
    {
        path: '',
        redirectTo: 'list',
        pathMatch: 'full'
    },
    {
        path: 'list',
        loadComponent: () => import('./supplier-assessment-list/supplier-assessment-list.component').then(m => m.SupplierAssessmentListComponent)
    },
    {
        path: 'new',
        loadComponent: () => import('./supplier-assessment-form/supplier-assessment-form.component').then(m => m.SupplierAssessmentFormComponent)
    },
    {
        path: 'edit/:id',
        loadComponent: () => import('./supplier-assessment-form/supplier-assessment-form.component').then(m => m.SupplierAssessmentFormComponent)
    },
    {
        path: 'view/:id',
        loadComponent: () => import('./supplier-assessment-view/supplier-assessment-view.component').then(m => m.SupplierAssessmentViewComponent)
    },
    {
        path: 'review/:id',
        loadComponent: () =>
            import('./supplier-assessment-view/supplier-assessment-approve-view/supplier-assessment-approve-view.component')
                .then(m => m.SupplierAssessmentApproveViewComponent),
    },
    {
        path: 'action/:id/:type',
        loadComponent: () => import('./supplier-assessment-action').then(m => m.SupplierAssessmentActionComponent)
    },
] as Route[];