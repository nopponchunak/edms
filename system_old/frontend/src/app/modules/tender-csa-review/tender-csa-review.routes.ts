import { Routes } from '@angular/router';

export const tenderCsaReviewRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./tender-csa-review-list/tender-csa-review-list.component').then(m => m.TenderCsaReviewListComponent)
  },
  {
    path: 'new',
    loadComponent: () => import('./tender-csa-review-form/tender-csa-review-form.component').then(m => m.TenderCsaReviewFormComponent)
  },
  {
    path: 'edit/:id',
    loadComponent: () => import('./tender-csa-review-form/tender-csa-review-form.component').then(m => m.TenderCsaReviewFormComponent)
  },
  {
    path: 'view/:id',
    loadComponent: () => import('./tender-csa-review-form/tender-csa-review-form.component').then(m => m.TenderCsaReviewFormComponent)
  },
  {
    path: 'action/:id/:type',
    loadComponent: () =>
      import(
        './tender-csa-review-action/tender-csa-review-action.component'
      ).then((m) => m.TenderCsaReviewActionComponent),
  }
];
