import { Route } from '@angular/router';

export default [
    { path: '', redirectTo: 'list', pathMatch: 'full' },
    { path: 'list', loadComponent: () => import('./sce-list/sce-list.component').then(m => m.SceListComponent) },
    { path: 'new', loadComponent: () => import('./sce-form/sce-form.component').then(m => m.SceFormComponent) },
    { path: 'edit/:id', loadComponent: () => import('./sce-form/sce-form.component').then(m => m.SceFormComponent) },
    { path: 'view/:id', loadComponent: () => import('./sce-view/sce-view.component').then(m => m.SceViewComponent) },
    { path: 'action/:id/:type', loadComponent: () => import('./sce-action/sce-action.component').then(m => m.SceActionComponent) },
] as Route[];


