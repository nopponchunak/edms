import { Routes } from '@angular/router';

export const legacyDesignReviewRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./legacy-design-review-summary/legacy-design-review-summary.component').then(
        (m) => m.LegacyDesignReviewSummaryComponent
      ),
  },
  {
    path: 'completed-records',
    loadComponent: () =>
      import('./legacy-design-review-completed-records/legacy-design-review-completed-records.component').then(
        (m) => m.LegacyDesignReviewCompletedRecordsComponent
      ),
  },
  {
    path: ':stage/:id',
    loadComponent: () =>
      import('./legacy-peer-review-detail/legacy-peer-review-detail.component').then(
        (m) => m.LegacyPeerReviewDetailComponent
      ),
  },
];
