import { Route } from '@angular/router';

export default [
    {
        path: '',
        redirectTo: 'list',
        pathMatch: 'full'
    },
    {
        path: 'list',
        loadComponent: () => import('./allowance-after-10pm-list/allowance-after-10pm-list.component').then(m => m.AllowanceAfter10pmListComponent)
    },
    {
        path: 'new',
        loadComponent: () => import('./allowance-after-10pm-form/allowance-after-10pm-form.component').then(m => m.AllowanceAfter10pmFormComponent)
    },
    {
        path: 'edit/:id',
        loadComponent: () => import('./allowance-after-10pm-form/allowance-after-10pm-form.component').then(m => m.AllowanceAfter10pmFormComponent)
    },
    {
        path: 'view/:id',
        loadComponent: () => import('./allowance-after-10pm-view/allowance-after-10pm-view.component').then(m => m.AllowanceAfter10pmViewComponent)
    },
    {
        path: 'action/:id/:type',
        loadComponent: () => import('./allowance-after-10pm-action/allowance-after-10pm-action.component').then(m => m.AllowanceAfter10pmActionComponent)
    }
] as Route[];
