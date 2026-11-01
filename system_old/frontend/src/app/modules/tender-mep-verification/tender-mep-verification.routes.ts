import { Routes } from '@angular/router';

export const tenderMepVerificationRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./tender-mep-verification-list/tender-mep-verification-list.component').then(m => m.TenderMepVerificationListComponent)
  },
  {
    path: 'new',
    loadComponent: () => import('./tender-mep-verification-form/tender-mep-verification-form.component').then(m => m.TenderMepVerificationFormComponent)
  },
  {
    path: 'edit/:id',
    loadComponent: () => import('./tender-mep-verification-form/tender-mep-verification-form.component').then(m => m.TenderMepVerificationFormComponent)
  },
  {
    path: 'view/:id',
    loadComponent: () => import('./tender-mep-verification-form/tender-mep-verification-form.component').then(m => m.TenderMepVerificationFormComponent)
  },
  {
    path: 'action/:id/:type',
    loadComponent: () =>
      import(
        './tender-mep-verification-action/tender-mep-verification-action.component'
      ).then((m) => m.TenderMepVerificationActionComponent),
  }
];
