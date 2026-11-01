import { Route } from '@angular/router';

export default [
    {
        path: '',
        redirectTo: 'list',
        pathMatch: 'full'
    },
    {
        path: 'list',
        loadComponent: () => import('./cdr-list/cdr-list.component').then(m => m.CdrListComponent)
    },
    {
        path: 'new',
        loadComponent: () => import('./cdr-form/cdr-form.component').then(m => m.CdrFormComponent)
    },
    {
        path: 'edit/:id',
        loadComponent: () => import('./cdr-form/cdr-form.component').then(m => m.CdrFormComponent)
    },
    {
        path: 'view/:id',
        loadComponent: () => import('./cdr-view/cdr-view.component').then(m => m.CdrViewComponent)
    },
    {
        path: 'action/:id/:type',
        loadComponent: () => import('./cdr-action').then(m => m.CdrActionComponent)
    }
] as Route[];


