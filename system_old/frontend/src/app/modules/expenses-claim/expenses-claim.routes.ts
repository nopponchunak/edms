import { Route } from '@angular/router';

export default [
    {
        path: '',
        redirectTo: 'list',
        pathMatch: 'full'
    },
    {
        path: 'list',
        loadComponent: () => import('./expenses-claim-list/expenses-claim-list.component').then(m => m.ExpensesClaimListComponent)
    },
    {
        path: 'new',
        loadComponent: () => import('./expenses-claim-form/expenses-claim-form.component').then(m => m.ExpensesClaimFormComponent)
    },
    {
        path: 'edit/:id',
        loadComponent: () => import('./expenses-claim-form/expenses-claim-form.component').then(m => m.ExpensesClaimFormComponent)
    },
    {
        path: 'view/:id',
        loadComponent: () => import('./expenses-claim-view/expenses-claim-view.component').then(m => m.ExpensesClaimViewComponent)
    },
    {
        path: 'action/:id/:type',
        loadComponent: () => import('./expenses-claim-action/expenses-claim-action.component').then(m => m.ExpensesClaimActionComponent)
    }
] as Route[];
