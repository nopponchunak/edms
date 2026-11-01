import { Route } from '@angular/router';

export default [

    /** DEFAULT */
    {
        path: '',
        redirectTo: 'list',
        pathMatch: 'full'
    },

    /** LIST */
    {
        path: 'list',
        loadComponent: () =>
            import('./project-lighting-fee-sheet-list/project-lighting-fee-sheet-list.component')
                .then(m => m.ProjectLightingFeeSheetListComponent)
    },

    /** NEW */
    {
        path: 'new',
        loadComponent: () =>
            import('./project-lighting-fee-sheet-form/project-lighting-fee-sheet-form.component')
                .then(m => m.ProjectLightingFeeSheetFormComponent)
    },

    /** EDIT */
    {
        path: 'edit/:id',
        loadComponent: () =>
            import('./project-lighting-fee-sheet-form/project-lighting-fee-sheet-form.component')
                .then(m => m.ProjectLightingFeeSheetFormComponent)
    },

    /** VIEW */
    {
        path: 'view/:id',
        loadComponent: () =>
            import('./project-lighting-fee-sheet-view/project-lighting-fee-sheet-view.component')
                .then(m => m.ProjectLightingFeeSheetViewComponent)
    },

    /** ⭐ REVIEW (ถูกต้องแน่นอน) */
    {
        path: 'review/:id',
        loadComponent: () =>
            import('./project-lighting-fee-sheet-review/project-lighting-fee-sheet-review.component')
                .then(m => m.ProjectLightingFeeSheetReviewComponent)
    }

] as Route[];
