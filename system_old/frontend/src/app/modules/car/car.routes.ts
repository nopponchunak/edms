import { Route } from '@angular/router';

export default [
    {
        path: '',
        redirectTo: 'list',
        pathMatch: 'full'
    },
    {
        path: 'list',
        loadComponent: () => import('./car-list').then(m => m.CarListComponent)
    },
    {
        path: 'new',
        loadComponent: () => import('./car-form').then(m => m.CarFormComponent)
    },
    {
        path: 'edit/:id',
        loadComponent: () => import('./car-form').then(m => m.CarFormComponent)
    },
    {
        path: 'view/:id',
        loadComponent: () => import('./car-view').then(m => m.CarViewComponent)
    },
    {
        path: 'action/:id/:type',
        loadComponent: () => import('./car-action').then(m => m.CarActionComponent)
    }
] as Route[];





