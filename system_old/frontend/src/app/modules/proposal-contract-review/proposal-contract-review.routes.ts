import { Route } from '@angular/router';

export default [
    {
        path: '',
        redirectTo: 'list',
        pathMatch: 'full'
    },
    {
        path: 'list',
        loadComponent: () => import('./proposal-contract-review-list/proposal-contract-review-list.component').then(m => m.ProposalContractReviewListComponent)
    },
    {
        path: 'new',
        loadComponent: () => import('./proposal-contract-review-form/proposal-contract-review-form.component').then(m => m.ProposalContractReviewFormComponent)
    },
    {
        path: 'edit/:id',
        loadComponent: () => import('./proposal-contract-review-form/proposal-contract-review-form.component').then(m => m.ProposalContractReviewFormComponent)
    },
    {
        path: 'stage-2/:id',
        loadComponent: () => import('./proposal-contract-review-form/proposal-contract-review-form.component').then(m => m.ProposalContractReviewFormComponent)
    },
    {
        path: 'view/:id',
        loadComponent: () => import('./proposal-contract-review-view/proposal-contract-review-view.component').then(m => m.ProposalContractReviewViewComponent)
    },
    {
        path: 'projects/:id',
        loadComponent: () => import('./proposal-contract-review-projects/proposal-contract-review-projects.component').then(m => m.ProposalContractReviewProjectsComponent)
    },
    {
        path: 'review/:id',
        loadComponent: () => import('./proposal-contract-review-view/proposal-contract-review-view.component').then(m => m.ProposalContractReviewViewComponent)
    },
    {
        path: 'import-current-projects',
        loadComponent: () => import('./proposal-contract-review-import/proposal-contract-review-import.component').then(m => m.ProposalContractReviewImportComponent)
    }
] as Route[];
