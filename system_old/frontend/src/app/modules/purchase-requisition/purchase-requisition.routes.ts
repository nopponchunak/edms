import { Route } from '@angular/router';

export default [
  {
    path: '',
    redirectTo: 'list',
    pathMatch: 'full',
  },

  // List
  {
    path: 'list',
    loadComponent: () =>
      import('./purchase-requisition-list').then(
        (m) => m.PurchaseRequisitionListComponent
      ),
  },

  // New
  {
    path: 'new',
    loadComponent: () =>
      import('./purchase-requisition-form').then(
        (m) => m.PurchaseRequisitionFormComponent
      ),
  },

  // New document layout
  {
    path: 'new-document',
    loadComponent: () =>
      import('./purchase-requisition-envelope-form').then(
        (m) => m.PurchaseRequisitionEnvelopeFormComponent
      ),
  },

  // Edit
  {
    path: 'edit/:id',
    loadComponent: () =>
      import('./purchase-requisition-form').then(
        (m) => m.PurchaseRequisitionFormComponent
      ),
  },

  // View
  {
    path: 'view/:id',
    loadComponent: () =>
      import('./purchase-requisition-view/purchase-requisition-view.component').then(
        (m) => m.PurchaseRequisitionViewComponent
      ),
  },
  {
    path: 'review/:id',
    loadComponent: () =>
      import('./purchase-requisition-review/purchase-requisition-review.component').then(
        (m) => m.PurchaseRequisitionReviewComponent
      ),
  },
  {
    path: 'action/:id/:type',
    loadComponent: () => import('./purchase-requisition-action').then(m => m.PurchaseRequisitionActionComponent)
  },
] as Route[];
