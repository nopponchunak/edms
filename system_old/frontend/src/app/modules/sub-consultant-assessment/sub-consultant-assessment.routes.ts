import { Route } from '@angular/router';

export default [
    {
        path: '',
        redirectTo: 'list',
        pathMatch: 'full'
    },
    {
        path: 'list',
        loadComponent: () => import('./sub-consultant-assessment-list/sub-consultant-assessment-list.component').then(m => m.SubConsultantAssessmentListComponent)
    },
    {
        path: 'new',
        loadComponent: () => import('./sub-consultant-assessment-form/sub-consultant-assessment-form.component').then(m => m.SubConsultantAssessmentFormComponent)
    },
    {
        path: 'edit/:id',
        loadComponent: () => import('./sub-consultant-assessment-form/sub-consultant-assessment-form.component').then(m => m.SubConsultantAssessmentFormComponent)
    },
    {
        path: 'view/:id',
        loadComponent: () => import('./sub-consultant-assessment-view/sub-consultant-assessment-view.component').then(m => m.SubConsultantAssessmentViewComponent)
    },
    {
        path: 'action/:id/:type',
        loadComponent: () => import('./sub-consultant-assessment-action').then(m => m.SubConsultantAssessmentActionComponent)
    }
] as Route[];


