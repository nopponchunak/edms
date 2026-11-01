import { Route } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () =>
      import('./purchase-order-list').then(
        (m) => m.PurchaseOrderListComponent
      ),
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./purchase-order-form').then(
        (m) => m.PurchaseOrderFormComponent
      ),
  },
  // เส้นทางสำหรับ Edit ต้องมาก่อน :id
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./purchase-order-form').then(
        (m) => m.PurchaseOrderFormComponent
      ),
  },
  // เส้นทางสำหรับ View (หน้าใหม่)
  {
    path: ':id',
    loadComponent: () =>
      import('./purchase-order-view/purchase-order-view.component').then(
        (m) => m.PurchaseOrderViewComponent
      ),
  },
  {
        path: ':id/review',
        loadComponent: () => import('./purchase-order-review/purchase-order-review.component')
            .then(m => m.PurchaseOrderReviewComponent)
    },
    {
        path: 'action/:id/:type',
        loadComponent: () => import('./purchase-order-action').then(m => m.PurchaseOrderActionComponent)
    }
] as Route[];
