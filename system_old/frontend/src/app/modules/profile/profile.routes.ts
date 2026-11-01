import { Routes } from '@angular/router';

export const profileRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./profile-view/profile-view.component').then(m => m.ProfileViewComponent)
  },
  {
    path: 'edit/:id',
    loadComponent: () => import('./profile-form/profile-form.component').then(m => m.ProfileFormComponent)
  },
  {
    path: 'new',
    loadComponent: () => import('./profile-form/profile-form.component').then(m => m.ProfileFormComponent)
  }
];
