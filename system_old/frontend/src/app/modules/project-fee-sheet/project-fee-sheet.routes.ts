import { Route } from '@angular/router';

export default [
    {
        path: '',
        redirectTo: 'list',
        pathMatch: 'full'
    },
    {
        path: 'list',
        loadComponent: () => import('./project-fee-sheet-list/project-fee-sheet-list.component').then(m => m.ProjectFeeSheetListComponent)
    },
    {
        path: 'new',
        loadComponent: () => import('./project-fee-sheet-form/project-fee-sheet-form.component').then(m => m.ProjectFeeSheetFormComponent)
    },
    {
        path: 'edit/:id',
        loadComponent: () => import('./project-fee-sheet-form/project-fee-sheet-form.component').then(m => m.ProjectFeeSheetFormComponent)
    },
    {
        path: 'view/:id',
        loadComponent: () => import('./project-fee-sheet-view/project-fee-sheet-view.component').then(m => m.ProjectFeeSheetViewComponent)
    },
    {
        path: 'action/:id/:type',
        loadComponent: () =>
            import('./project-fee-sheet-review-view/project-fee-sheet-review-view.component')
                .then(m => m.ProjectFeeSheetReviewViewComponent),
        data: {
            feeSheetType: 'project',
            documentLabel: 'Project Fee Sheet',
            listPath: '/project-fee-sheet/list',
            viewPath: '/project-fee-sheet/view',
        },
    },
    {
        path: 'review/:id',
        loadComponent: () =>
            import('./project-fee-sheet-review-view/project-fee-sheet-review-view.component')
                .then(m => m.ProjectFeeSheetReviewViewComponent),
        data: {
            feeSheetType: 'project',
            documentLabel: 'Project Fee Sheet',
            listPath: '/project-fee-sheet/list',
            viewPath: '/project-fee-sheet/view',
        },
    },
] as Route[];
