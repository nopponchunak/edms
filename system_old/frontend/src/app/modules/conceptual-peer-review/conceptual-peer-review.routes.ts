import { Routes } from '@angular/router';

export const conceptualPeerReviewRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./conceptual-peer-review-list').then(m => m.ConceptualPeerReviewListComponent)
  },
  {
    path: 'new',
    loadComponent: () => import('./conceptual-peer-review-form').then(m => m.ConceptualPeerReviewFormComponent)
  },
  {
    path: 'edit/:id',
    loadComponent: () => import('./conceptual-peer-review-form').then(m => m.ConceptualPeerReviewFormComponent)
  },
  {
    path: 'view/:id',
    loadComponent: () => import('./conceptual-peer-review-form').then(m => m.ConceptualPeerReviewFormComponent)
  }
];
