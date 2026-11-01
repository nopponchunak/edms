import { Route } from '@angular/router';
import { initialDataResolver } from 'app/app.resolvers';
import { AuthGuard } from 'app/core/auth/guards/auth.guard';
import { NoAuthGuard } from 'app/core/auth/guards/noAuth.guard';
import { authGuard } from 'app/core/guards/auth.guard';
import { noAuthGuard } from 'app/core/guards/no-auth.guard';
import { LayoutComponent } from 'app/layout/layout.component';


// @formatter:off
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
export const appRoutes: Route[] = [

    // Redirect empty path to '/dashboard' (protected route)
    {path: '', pathMatch : 'full', redirectTo: 'dashboard'},

    // Redirect signed-in user to the '/dashboard'
    //
    // After the user signs in, the sign-in page will redirect the user to the 'signed-in-redirect'
    // path. Below is another redirection for that path to redirect the user to the desired
    // location. This is a small convenience to keep all main routes together here on this file.
    {path: 'signed-in-redirect', pathMatch : 'full', redirectTo: 'dashboard'},

    // Auth routes for guests (not logged in users)
    {
        path: '',
        canActivate: [noAuthGuard],
        canActivateChild: [noAuthGuard],
        component: LayoutComponent,
        data: {
            layout: 'empty'
        },
        children: [
            {path: 'confirmation-required', loadChildren: () => import('app/modules/auth/confirmation-required/confirmation-required.routes')},
            {path: 'forgot-password', loadChildren: () => import('app/modules/auth/forgot-password/forgot-password.routes')},
            {path: 'reset-password', loadChildren: () => import('app/modules/auth/reset-password/reset-password.routes')},
            {path: 'sign-in', loadChildren: () => import('app/modules/auth/sign-in/sign-in.routes')},
            {path: 'sign-up', loadChildren: () => import('app/modules/auth/sign-up/sign-up.routes')},
            {path: 'login-admin', loadChildren: () => import('app/modules/auth/login-admin/login-admin.routes')}
        ]
    },

    // Auth routes for authenticated users
    {
        path: '',
        canActivate: [authGuard],
        canActivateChild: [authGuard],
        component: LayoutComponent,
        data: {
            layout: 'empty'
        },
        children: [
            {path: 'sign-out', loadChildren: () => import('app/modules/auth/sign-out/sign-out.routes')},
            {path: 'unlock-session', loadChildren: () => import('app/modules/auth/unlock-session/unlock-session.routes')}
        ]
    },

    // Landing routes
    {
        path: '',
        component: LayoutComponent,
        data: {
            layout: 'empty'
        },
        children: [
            {path: 'home', loadChildren: () => import('app/modules/landing/home/home.routes')},
        ]
    },

    // Public print-render routes used by the backend PDF combiner.
    {
        path: 'print',
        component: LayoutComponent,
        data: {
            layout: 'empty'
        },
        children: [
            {
                path: 'purchase-order/:id',
                data: { printDocument: true },
                loadComponent: () => import('app/modules/purchase-order/purchase-order-view/purchase-order-view.component').then(m => m.PurchaseOrderViewComponent)
            },
            {
                path: 'purchase-requisition/:id',
                data: { printDocument: true },
                loadComponent: () => import('app/modules/purchase-requisition/purchase-requisition-view/purchase-requisition-view.component').then(m => m.PurchaseRequisitionViewComponent)
            },
            {
                path: 'expenses-claim/:id',
                data: { printDocument: true },
                loadComponent: () => import('app/modules/expenses-claim/expenses-claim-view/expenses-claim-view.component').then(m => m.ExpensesClaimViewComponent)
            },
            {
                path: 'allowance-after-10pm/:id',
                data: { printDocument: true },
                loadComponent: () => import('app/modules/allowance-after-10pm/allowance-after-10pm-view/allowance-after-10pm-view.component').then(m => m.AllowanceAfter10pmViewComponent)
            }
        ]
    },

    // Protected routes (requires authentication)
    {
        path: '',
        canActivate: [authGuard],
        canActivateChild: [authGuard],
        component: LayoutComponent,
        resolve: {
            initialData: initialDataResolver
        },
        children: [
            {path: 'dashboard', loadChildren: () => import('app/modules/dashboard/personal-dashboard.routes')},
            {path: 'charitable-contributions', loadChildren: () => import('app/modules/charitable-contribution/charitable-contribution.routes')},
            {path: 'cars', loadChildren: () => import('app/modules/car/car.routes')},
            {path: 'gift-hospitality', loadChildren: () => import('app/modules/gift-hospitality/gift-hospitality.routes')},
            {path: 'gift-hospitality-offering', loadChildren: () => import('app/modules/gift-hospitality-offering/gift-hospitality-offering.routes')},
            {path: 'purchase-order', loadChildren: () => import('app/modules/purchase-order/purchase-order.routes')},
            {path: 'purchase-requisition', loadChildren: () => import('app/modules/purchase-requisition/purchase-requisition.routes')},
            {path: 'supplier-assessment', loadChildren: () => import('app/modules/supplier-assessment/supplier-assessment.routes')},
            {path: 'supplier-evaluation', loadChildren: () => import('app/modules/supplier-evaluation/supplier-evaluation.routes')},
            {path: 'proposal-contract-review', loadChildren: () => import('app/modules/proposal-contract-review/proposal-contract-review.routes')},
            {path: 'proposal-contract-review-approve', loadChildren: () => import('app/modules/proposal-contract-review-approve/proposal-contract-review-approve.routes')},
            {path: 'controlled-document-request', loadChildren: () => import('app/modules/controlled-document-request/controlled-document-request.routes')},
            {path: 'project-quality-assurance-plan', loadChildren: () => import('app/modules/project-quality-assurance-plan/project-quality-assurance-plan.routes')},
            {path: 'sub-consultant-assessment', loadChildren: () => import('app/modules/sub-consultant-assessment/sub-consultant-assessment.routes')},
            {path: 'expenses-claim', loadChildren: () => import('app/modules/expenses-claim/expenses-claim.routes')},
            {path: 'allowance-after-10pm', loadChildren: () => import('app/modules/allowance-after-10pm/allowance-after-10pm.routes')},
            {path: 'project-fee-sheet', loadChildren: () => import('app/modules/project-fee-sheet/project-fee-sheet.routes')},
            {path: 'project-facade-fee-sheet', loadChildren: () => import('app/modules/project-facade-fee-sheet/project-facade-fee-sheet.routes')},
            // {path: 'project-lighting-fee-sheet', loadChildren: () => import('app/modules/project-lighting-fee-sheet/project-lighting-fee-sheet.routes')},
            {path: 'project-transportation-fee-sheet', loadChildren: () => import('app/modules/project-transportation-fee-sheet/project-transportation-fee-sheet.routes')},
            {path: 'single-source-justification', loadChildren: () => import('app/modules/single-source-justification/single-source-justification.routes').then(m => m.singleSourceJustificationRoutes)},
            {path: 'additional-design-fees', loadChildren: () => import('app/modules/additional-design-fees/additional-design-fees.routes').then(m => m.additionalDesignFeesRoutes)},
            {path: 'design-changes-notification', loadChildren: () => import('app/modules/design-changes-notification/design-changes-notification.routes').then(m => m.designChangesNotificationRoutes)},
            {path: 'engineering-audit-review', loadChildren: () => import('app/modules/engineering-audit-review/engineering-audit-review.routes').then(m => m.engineeringAuditReviewRoutes)},
            {path: 'value-engineering', loadChildren: () => import('app/modules/value-engineering/value-engineering.routes').then(m => m.valueEngineeringRoutes)},
            {path: 'leed-review', loadChildren: () => import('app/modules/leed-review/leed-review.routes').then(m => m.leedReviewRoutes)},
            {path: 'conceptual-peer-review', loadChildren: () => import('app/modules/conceptual-peer-review/conceptual-peer-review.routes').then(m => m.conceptualPeerReviewRoutes)},
            {path: 'design-verification-validation', loadChildren: () => import('app/modules/design-verification-validation/design-verification-validation.routes').then(m => m.designVerificationValidationRoutes)},
            {path: 'concept-design-review', loadChildren: () => import('app/modules/concept-design-review/concept-design-review.routes').then(m => m.conceptDesignReviewRoutes)},
            {path: 'schematic-design-review', loadChildren: () => import('app/modules/schematic-design-review/schematic-design-review.routes').then(m => m.schematicDesignReviewRoutes)},
            {path: 'design-workflow', loadChildren: () => import('app/modules/design-workflow/design-workflow.routes').then(m => m.designWorkflowRoutes)},
            {path: 'legacy-design-review', loadChildren: () => import('app/modules/legacy-design-review/legacy-design-review.routes').then(m => m.legacyDesignReviewRoutes)},
            {path: 'submission-review', loadChildren: () => import('app/modules/submission-review/submission-review.routes').then(m => m.submissionReviewRoutes)},
            {path: 'tender-review', loadChildren: () => import('app/modules/tender-review/tender-review.routes').then(m => m.tenderReviewRoutes)},
            {path: 'tender-csa-review', pathMatch: 'full', redirectTo: 'tender/csa/review'},
            {path: 'tender-csa-verification', pathMatch: 'full', redirectTo: 'tender/csa/verification'},
            {path: 'tender-mep-review', pathMatch: 'full', redirectTo: 'tender/mep/review'},
            {path: 'tender-mep-verification', pathMatch: 'full', redirectTo: 'tender/mep/verification'},
            {path: 'tender/csa/review', loadChildren: () => import('app/modules/tender-csa-review/tender-csa-review.routes').then(m => m.tenderCsaReviewRoutes)},
            {path: 'tender/csa/verification', loadChildren: () => import('app/modules/tender-csa-verification/tender-csa-verification.routes').then(m => m.tenderCsaVerificationRoutes)},
            {path: 'tender/mep/review', loadChildren: () => import('app/modules/tender-mep-review/tender-mep-review.routes').then(m => m.tenderMepReviewRoutes)},
            {path: 'tender/mep/verification', loadChildren: () => import('app/modules/tender-mep-verification/tender-mep-verification.routes').then(m => m.tenderMepVerificationRoutes)},
            {path: 'construction-validation', loadChildren: () => import('app/modules/construction-validation/construction-validation.routes').then(m => m.constructionValidationRoutes)},
            {path: 'sub-consultant-evaluation', loadChildren: () => import('app/modules/sub-consultant-evaluation/sub-consultant-evaluation.routes')},
            {path: 'profile', loadChildren: () => import('app/modules/profile/profile.routes').then(m => m.profileRoutes)},
            {path: 'settings', loadChildren: () => import('app/modules/settings/settings.routes')},
        ]
    }
];
