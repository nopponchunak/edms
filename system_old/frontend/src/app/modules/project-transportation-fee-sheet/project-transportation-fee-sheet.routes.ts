import { Route } from '@angular/router';

export default [
    {
        path: '',
        redirectTo: 'list',
        pathMatch: 'full'
    },
    {
        path: 'list',
        loadComponent: () =>
            import('./project-transportation-fee-sheet-list/project-transportation-fee-sheet-list.component')
                .then(m => m.ProjectTransportationFeeSheetListComponent)
    },
    {
        path: 'new',
        loadComponent: () =>
            import('./project-transportation-fee-sheet-form/project-transportation-fee-sheet-form.component')
                .then(m => m.ProjectTransportationFeeSheetFormComponent)
    },
    {
        path: 'edit/:id',
        loadComponent: () =>
            import('./project-transportation-fee-sheet-form/project-transportation-fee-sheet-form.component')
                .then(m => m.ProjectTransportationFeeSheetFormComponent)
    },
    {
        path: 'view/:id',
        loadComponent: () =>
            import('./project-transportation-fee-sheet-view/project-transportation-fee-sheet-view.component')
                .then(m => m.ProjectTransportationFeeSheetViewComponent)
    },

    {
        path: 'action/:id/:type',
        loadComponent: () =>
            import('../project-fee-sheet/project-fee-sheet-review-view/project-fee-sheet-review-view.component')
                .then(m => m.ProjectFeeSheetReviewViewComponent),
        data: {
            feeSheetType: 'transportation',
            documentLabel: 'Project Transportation Fee Sheet',
            listPath: '/project-transportation-fee-sheet/list',
            viewPath: '/project-transportation-fee-sheet/view',
        },
    },
    {
        path: 'review/:id',
        loadComponent: () =>
            import('../project-fee-sheet/project-fee-sheet-review-view/project-fee-sheet-review-view.component')
                .then(m => m.ProjectFeeSheetReviewViewComponent),
        data: {
            feeSheetType: 'transportation',
            documentLabel: 'Project Transportation Fee Sheet',
            listPath: '/project-transportation-fee-sheet/list',
            viewPath: '/project-transportation-fee-sheet/view',
        },
    }
] as Route[];
