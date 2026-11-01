import { Route } from '@angular/router';

export default [
    {
        path: '',
        redirectTo: 'list',
        pathMatch: 'full'
    },
    {
        path: 'list',
        loadComponent: () => import('./proposal-contract-review-approve-list/proposal-contract-review-approve-list.component').then(m => m.ProposalContractReviewApproveListComponent)
    },
    {
        path: 'view/:id',
        loadComponent: () => import('./proposal-contract-review-approve-view/proposal-contract-review-approve-view.component').then(m => m.ProposalContractReviewApproveViewComponent)
    }
] as Route[];

