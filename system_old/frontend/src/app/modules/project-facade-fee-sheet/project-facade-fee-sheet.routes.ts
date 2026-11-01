import { Route } from '@angular/router';

export default [
  {
    path: '',
    redirectTo: 'list',
    pathMatch: 'full',
  },
  {
    path: 'list',
    loadComponent: () =>
      import('./project-facade-fee-sheet-list/project-facade-fee-sheet-list.component').then(
        (m) => m.ProjectFacadeFeeSheetListComponent
      ),
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./project-facade-fee-sheet-form/project-facade-fee-sheet-form.component').then(
        (m) => m.ProjectFacadeFeeSheetDocumentFormComponent
      ),
  },
  {
    path: 'edit/:id',
    loadComponent: () =>
      import('./project-facade-fee-sheet-form/project-facade-fee-sheet-form.component').then(
        (m) => m.ProjectFacadeFeeSheetDocumentFormComponent
      ),
  },
  {
    path: 'view/:id',
    loadComponent: () =>
      import('./project-facade-fee-sheet-view/project-facade-fee-sheet-view.component').then(
        (m) => m.ProjectFacadeFeeSheetViewComponent
      ),
  },
  {
    path: 'action/:id/:type',
    loadComponent: () =>
      import('../project-fee-sheet/project-fee-sheet-review-view/project-fee-sheet-review-view.component').then(
        (m) => m.ProjectFeeSheetReviewViewComponent
      ),
    data: {
      feeSheetType: 'facade',
      documentLabel: 'Project Facade Fee Sheet',
      listPath: '/project-facade-fee-sheet/list',
      viewPath: '/project-facade-fee-sheet/view',
    },
  },
  {
    path: 'review/:id',
    loadComponent: () =>
      import('../project-fee-sheet/project-fee-sheet-review-view/project-fee-sheet-review-view.component').then(
        (m) => m.ProjectFeeSheetReviewViewComponent
      ),
    data: {
      feeSheetType: 'facade',
      documentLabel: 'Project Facade Fee Sheet',
      listPath: '/project-facade-fee-sheet/list',
      viewPath: '/project-facade-fee-sheet/view',
    },
  },
] as Route[];
