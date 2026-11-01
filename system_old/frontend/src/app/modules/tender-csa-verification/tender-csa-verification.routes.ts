import { Routes } from '@angular/router';

export const tenderCsaVerificationRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./tender-csa-verification-list/tender-csa-verification-list.component').then(m => m.TenderCsaVerificationListComponent)
  },
  {
    path: 'new',
    loadComponent: () => import('./tender-csa-verification-form/tender-csa-verification-form.component').then(m => m.TenderCsaVerificationFormComponent)
  },
  {
    path: 'edit/:id',
    loadComponent: () => import('./tender-csa-verification-form/tender-csa-verification-form.component').then(m => m.TenderCsaVerificationFormComponent)
  },
  {
    path: 'view/:id',
    loadComponent: () => import('./tender-csa-verification-form/tender-csa-verification-form.component').then(m => m.TenderCsaVerificationFormComponent)
  },
  {
    path: 'action/:id/:type',
    loadComponent: () =>
      import(
        './tender-csa-verification-action/tender-csa-verification-action.component'
      ).then((m) => m.TenderCsaVerificationActionComponent),
  }
];
