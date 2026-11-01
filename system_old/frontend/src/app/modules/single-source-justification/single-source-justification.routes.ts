import { Route } from '@angular/router';

export const singleSourceJustificationRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./single-source-justification-list/single-source-justification-list.component').then(
        (m) => m.SingleSourceJustificationListComponent
      ),
  },
  {
    path: 'create',
    loadComponent: () =>
      import('./single-source-justification-form/single-source-justification-form.component').then(
        (m) => m.SingleSourceJustificationFormComponent
      ),
  },
  {
    path: 'view/:id',
    loadComponent: () =>
      import('./single-source-justification-view/single-source-justification-view.component').then(
        (m) => m.SingleSourceJustificationViewComponent
      ),
  },
  {
    path: 'edit/:id',
    loadComponent: () =>
      import('./single-source-justification-form/single-source-justification-form.component').then(
        (m) => m.SingleSourceJustificationFormComponent
      ),
  },
  {
    path: 'review/:id',
    loadComponent: () =>
      import('./single-source-justification-review/single-source-justification-review.component').then(
        (m) => m.SingleSourceJustificationReviewComponent
      ),
  },
  {
    path: 'action/:id/:type',
    loadComponent: () => import('./single-source-justification-action').then(m => m.SingleSourceJustificationActionComponent)
  },
];
