import { Route } from '@angular/router';
import { GiftHospitalityOfferingListComponent } from './gift-hospitality-offering-list';
import { GiftHospitalityOfferingFormComponent } from './gift-hospitality-offering-form';
import { GiftHospitalityOfferingViewComponent } from './gift-hospitality-offering-view';

export default [
    {
        path: '',
        redirectTo: 'list',
        pathMatch: 'full'
    },
    {
        path: 'list',
        loadComponent: () => import('./gift-hospitality-offering-list').then(m => m.GiftHospitalityOfferingListComponent)
    },
    {
        path: 'new',
        loadComponent: () => import('./gift-hospitality-offering-form').then(m => m.GiftHospitalityOfferingFormComponent)
    },
    {
        path: 'edit/:id',
        loadComponent: () => import('./gift-hospitality-offering-form').then(m => m.GiftHospitalityOfferingFormComponent)
    },
    {
        path: 'view/:id',
        loadComponent: () => import('./gift-hospitality-offering-view').then(m => m.GiftHospitalityOfferingViewComponent)
    },
    {
        path: 'action/:id/:type',
        loadComponent: () => import('./gift-hospitality-offering-action').then(m => m.GiftHospitalityOfferingActionComponent)
    }
] as Route[];





