import { Route } from '@angular/router';

export default [
    {
        path: '',
        redirectTo: 'list',
        pathMatch: 'full'
    },
    {
        path: 'list',
        loadComponent: () => import('./charitable-contribution-list').then(m => m.CharitableContributionListComponent)
    },
    {
        path: 'new',
        loadComponent: () => import('./charitable-contribution-form').then(m => m.CharitableContributionFormComponent)
    },
    {
        path: 'edit/:id',
        loadComponent: () => import('./charitable-contribution-form').then(m => m.CharitableContributionFormComponent)
    },
    {
        path: 'view/:id',
        loadComponent: () => import('./charitable-contribution-view').then(m => m.CharitableContributionViewComponent)
    },
    {
        path: 'action/:id/:type',
        loadComponent: () => import('./charitable-contribution-action').then(m => m.CharitableContributionActionComponent)
    }
] as Route[];
