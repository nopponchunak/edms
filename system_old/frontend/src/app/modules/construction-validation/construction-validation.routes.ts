import { Routes } from '@angular/router';

export const constructionValidationRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./construction-validation-list/construction-validation-list.component').then(m => m.ConstructionValidationListComponent)
  },
  {
    path: 'new',
    loadComponent: () => import('./construction-validation-form/construction-validation-form.component').then(m => m.ConstructionValidationFormComponent)
  },
  {
    path: 'edit/:id',
    loadComponent: () => import('./construction-validation-form/construction-validation-form.component').then(m => m.ConstructionValidationFormComponent)
  },
  {
    path: 'view/:id',
    loadComponent: () => import('./construction-validation-form/construction-validation-form.component').then(m => m.ConstructionValidationFormComponent)
  },
  {
    path: 'action/:id/:type',
    loadComponent: () =>
      import(
        './construction-validation-action/construction-validation-action.component'
      ).then((m) => m.ConstructionValidationActionComponent),
  }
];
