import { Routes } from '@angular/router';

export const tenderReviewRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./tender-review-category/tender-review-category.component').then(
        (m) => m.TenderReviewCategoryComponent
      ),
  },
];
