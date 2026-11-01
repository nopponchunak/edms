import { Route } from '@angular/router';
import { ProjectTransportationFeeSheetViewComponent } 
  from './project-transportation-fee-sheet-review.component';

export const projectTransportationFeeSheetReviewRoutes: Route[] = [
  {
    path: ':id',
    component: ProjectTransportationFeeSheetViewComponent
  }
];
