import { Routes } from '@angular/router';

export const schematicDesignReviewRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./schematic-design-review-list/schematic-design-review-list.component').then(m => m.SchematicDesignReviewListComponent)
  },
  {
    path: 'new',
    loadComponent: () => import('./schematic-design-review-form/schematic-design-review-form.component').then(m => m.SchematicDesignReviewFormComponent)
  },
  {
    path: 'edit/:id',
    loadComponent: () => import('./schematic-design-review-form/schematic-design-review-form.component').then(m => m.SchematicDesignReviewFormComponent)
  },
  {
    path: 'view/:id',
    loadComponent: () => import('./schematic-design-review-form/schematic-design-review-form.component').then(m => m.SchematicDesignReviewFormComponent)
  },
  {
    path: 'action/:id/:type',
    loadComponent: () => import('./schematic-design-review-action/schematic-design-review-action.component').then(m => m.SchematicDesignReviewActionComponent)
  }
];
