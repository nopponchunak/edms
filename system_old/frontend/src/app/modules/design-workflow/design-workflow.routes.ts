import { Routes } from '@angular/router';

export const designWorkflowRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./design-workflow/design-workflow.component').then(
        (m) => m.DesignWorkflowComponent
      ),
  },
];
