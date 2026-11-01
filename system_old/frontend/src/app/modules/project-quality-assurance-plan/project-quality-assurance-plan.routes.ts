import { Route } from '@angular/router';

export default [
    {
        path: '',
        redirectTo: 'list',
        pathMatch: 'full'
    },
    {
        path: 'list',
        loadComponent: () => import('./project-quality-assurance-plan-list/project-quality-assurance-plan-list.component').then(m => m.ProjectQualityAssurancePlanListComponent)
    },
    {
        path: 'new',
        loadComponent: () => import('./project-quality-assurance-plan-form/project-quality-assurance-plan-form.component').then(m => m.ProjectQualityAssurancePlanFormComponent)
    },
    {
        path: 'edit/:id',
        loadComponent: () => import('./project-quality-assurance-plan-form/project-quality-assurance-plan-form.component').then(m => m.ProjectQualityAssurancePlanFormComponent)
    },
    {
        path: 'view/:id',
        loadComponent: () => import('./project-quality-assurance-plan-view/project-quality-assurance-plan-view.component').then(m => m.ProjectQualityAssurancePlanViewComponent)
    },
    {
    path: 'review/:id',
    loadComponent: () =>
      import('./project-quality-assurance-plan-review/project-quality-assurance-plan-review-view.component')
        .then(m => m.PqapReviewViewComponent) // ชื่อคลาสในไฟล์ .ts
  }
    
] as Route[];

