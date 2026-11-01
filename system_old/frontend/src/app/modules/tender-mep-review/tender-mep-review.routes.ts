import { Routes } from '@angular/router';

export const tenderMepReviewRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./tender-mep-review-list/tender-mep-review-list.component').then(m => m.TenderMepReviewListComponent)
  },
  {
    path: 'new',
    loadComponent: () => import('./tender-mep-review-form/tender-mep-review-form.component').then(m => m.TenderMepReviewFormComponent)
  },
  {
    path: 'edit/:id',
    loadComponent: () => import('./tender-mep-review-form/tender-mep-review-form.component').then(m => m.TenderMepReviewFormComponent)
  },
  {
    path: 'view/:id',
    loadComponent: () => import('./tender-mep-review-form/tender-mep-review-form.component').then(m => m.TenderMepReviewFormComponent)
  },
  {
    path: 'action/:id/:type',
    loadComponent: () =>
      import(
        './tender-mep-review-action/tender-mep-review-action.component'
      ).then((m) => m.TenderMepReviewActionComponent),
  }
];
