import { Route } from '@angular/router';

export default [
    {
        path: '',
        redirectTo: 'list',
        pathMatch: 'full'
    },
    {
        path: 'list',
        loadComponent: () => import('./gift-hospitality-list').then(m => m.GiftHospitalityListComponent)
    },
    {
        path: 'new',
        loadComponent: () => import('./gift-hospitality-form').then(m => m.GiftHospitalityFormComponent)
    },
    {
        path: 'edit/:id',
        loadComponent: () => import('./gift-hospitality-form').then(m => m.GiftHospitalityFormComponent)
    },
    {
        path: 'view/:id',
        loadComponent: () => import('./gift-hospitality-view').then(m => m.GiftHospitalityViewComponent)
    },
    {
        path: 'action/:id/:type',
        loadComponent: () => import('./gift-hospitality-action').then(m => m.GiftHospitalityActionComponent)
    }
] as Route[];





