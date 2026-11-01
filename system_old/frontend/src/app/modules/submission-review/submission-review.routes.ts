import { Routes } from '@angular/router';

export const submissionReviewRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./submission-review-list/submission-review-list.component').then(m => m.SubmissionReviewListComponent)
  },
  {
    path: 'new',
    loadComponent: () => import('./submission-review-form/submission-review-form.component').then(m => m.SubmissionReviewFormComponent)
  },
  {
    path: 'edit/:id',
    loadComponent: () => import('./submission-review-form/submission-review-form.component').then(m => m.SubmissionReviewFormComponent)
  },
  {
    path: 'view/:id',
    loadComponent: () => import('./submission-review-form/submission-review-form.component').then(m => m.SubmissionReviewFormComponent)
  },
  {
    path: 'action/:id/:type',
    loadComponent: () =>
      import(
        './submission-review-action/submission-review-action.component'
      ).then((m) => m.SubmissionReviewActionComponent),
  }
];
