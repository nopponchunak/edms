import { Routes } from '@angular/router';

export const designVerificationValidationRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./design-verification-validation-list/design-verification-validation-list.component').then(m => m.DesignVerificationValidationListComponent)
  },
  {
    path: 'new',
    loadComponent: () => import('./design-verification-validation-form/design-verification-validation-form.component').then(m => m.DesignVerificationValidationFormComponent)
  },
  {
    path: 'edit/:id',
    loadComponent: () => import('./design-verification-validation-form/design-verification-validation-form.component').then(m => m.DesignVerificationValidationFormComponent)
  },
  {
    path: 'view/:id',
    loadComponent: () => import('./design-verification-validation-form/design-verification-validation-form.component').then(m => m.DesignVerificationValidationFormComponent)
  }
];
