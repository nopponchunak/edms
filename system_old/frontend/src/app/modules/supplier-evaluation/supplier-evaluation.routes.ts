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
      import('./supplier-evaluation-list/supplier-evaluation-list.component')
        .then(m => m.SupplierEvaluationListComponent)
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./supplier-evaluation-form/supplier-evaluation-form.component')
        .then(m => m.SupplierEvaluationFormComponent)
  },
  {
    path: 'edit/:id',
    loadComponent: () =>
      import('./supplier-evaluation-form/supplier-evaluation-form.component')
        .then(m => m.SupplierEvaluationFormComponent)
  },
  {
    path: 'view/:id',
    loadComponent: () =>
      import('./supplier-evaluation-view/supplier-evaluation-view.component')
        .then(m => m.SupplierEvaluationViewComponent)
  },
  {
    path: 'review/:id',
    loadComponent: () =>
      import('./supplier-evaluation-review.component')
        .then(m => m.SupplierEvaluationReviewComponent)
  },
  {
    path: 'action/:id/:type',
    loadComponent: () => import('./supplier-evaluation-action').then(m => m.SupplierEvaluationActionComponent)
  }
] as Route[];
