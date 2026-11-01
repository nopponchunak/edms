import { Routes } from '@angular/router';

export const valueEngineeringRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./value-engineering-list').then(m => m.ValueEngineeringListComponent)
  },
  {
    path: 'new',
    loadComponent: () => import('./value-engineering-form').then(m => m.ValueEngineeringFormComponent)
  },
  {
    path: 'edit/:id',
    loadComponent: () => import('./value-engineering-form').then(m => m.ValueEngineeringFormComponent)
  },
  {
    path: 'view/:id',
    loadComponent: () => import('./value-engineering-form').then(m => m.ValueEngineeringFormComponent)
  },
  {
    path: 'action/:id/:type',
    loadComponent: () => import('./value-engineering-action').then(m => m.ValueEngineeringActionComponent)
  }
];
