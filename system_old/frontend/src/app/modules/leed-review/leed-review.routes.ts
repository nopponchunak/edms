import { Routes } from '@angular/router';

export const leedReviewRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./leed-review-list').then(m => m.LeedReviewListComponent)
  },
  {
    path: 'new',
    loadComponent: () => import('./leed-review-form').then(m => m.LeedReviewFormComponent)
  },
  {
    path: 'edit/:id',
    loadComponent: () => import('./leed-review-form').then(m => m.LeedReviewFormComponent)
  },
  {
    path: 'view/:id',
    loadComponent: () => import('./leed-review-form').then(m => m.LeedReviewFormComponent)
  },
  {
    path: 'action/:id/:type',
    loadComponent: () => import('./leed-review-action').then(m => m.LeedReviewActionComponent)
  }
];
