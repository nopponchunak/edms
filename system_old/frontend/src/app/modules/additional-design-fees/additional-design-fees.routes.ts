import { Route } from '@angular/router';

export const additionalDesignFeesRoutes: Route[] = [
    {
        path: '',
        loadComponent: () => import('./additional-design-fees-list/additional-design-fees-list.component').then(m => m.AdditionalDesignFeesListComponent)
    },
    {
        path: 'new',
        loadComponent: () => import('./additional-design-fees-form/additional-design-fees-form.component').then(m => m.AdditionalDesignFeesFormComponent)
    },
    {
        path: 'edit/:id',
        loadComponent: () => import('./additional-design-fees-form/additional-design-fees-form.component').then(m => m.AdditionalDesignFeesFormComponent)
    },
    {
        path: 'view/:id',
        loadComponent: () => import('./additional-design-fees-form/additional-design-fees-form.component').then(m => m.AdditionalDesignFeesFormComponent)
    }
];
