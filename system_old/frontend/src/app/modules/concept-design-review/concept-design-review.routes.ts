import { Routes } from '@angular/router';

export const conceptDesignReviewRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./concept-design-review-list/concept-design-review-list.component').then(m => m.ConceptDesignReviewListComponent)
  },
  {
    path: 'new',
    loadComponent: () => import('./concept-design-review-form/concept-design-review-form.component').then(m => m.ConceptDesignReviewFormComponent)
  },
  {
    path: 'edit/:id',
    loadComponent: () => import('./concept-design-review-form/concept-design-review-form.component').then(m => m.ConceptDesignReviewFormComponent)
  },
  {
    path: 'view/:id',
    loadComponent: () => import('./concept-design-review-form/concept-design-review-form.component').then(m => m.ConceptDesignReviewFormComponent)
  },
  {
    path: 'action/:id/:type',
    loadComponent: () => import('./concept-design-review-action/concept-design-review-action.component').then(m => m.ConceptDesignReviewActionComponent)
  }
];
