import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { AppShellComponent } from './layout/app-shell.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { LoginComponent } from './pages/login/login.component';
import { ModulesComponent } from './pages/modules/modules.component';
import { AccessManagementComponent } from './pages/access-management/access-management.component';
import { RolePermissionsComponent } from './pages/role-permissions/role-permissions.component';
import { accessManagementGuard } from './auth/access-management.guard';
import { permissionGuard } from './auth/permission.guard';
import { ExpensesClaimListComponent } from './pages/expenses-claim/expenses-claim-list.component';
import { ExpensesClaimFormComponent } from './pages/expenses-claim/expenses-claim-form.component';
import { AllowanceListComponent } from './pages/allowance-after-10pm/allowance-list.component';
import { AllowanceFormComponent } from './pages/allowance-after-10pm/allowance-form.component';
import { AllowanceViewComponent } from './pages/allowance-after-10pm/allowance-view.component';
import { CharitableContributionListComponent } from './pages/charitable-contribution/charitable-contribution-list.component';
import { CharitableContributionFormComponent } from './pages/charitable-contribution/charitable-contribution-form.component';
import { CharitableContributionViewComponent } from './pages/charitable-contribution/charitable-contribution-view.component';
import { PurchaseRequisitionFormComponent } from './pages/purchase-requisition/purchase-requisition-form.component';
import { PurchaseRequisitionListComponent } from './pages/purchase-requisition/purchase-requisition-list.component';
import { PurchaseRequisitionViewComponent } from './pages/purchase-requisition/purchase-requisition-view.component';
import { GiftOfferingFormComponent } from './pages/gift-hospitality-offering/gift-offering-form.component';
import { GiftOfferingListComponent } from './pages/gift-hospitality-offering/gift-offering-list.component';
import { GiftOfferingViewComponent } from './pages/gift-hospitality-offering/gift-offering-view.component';
import { GiftReceivingFormComponent } from './pages/gift-hospitality-receiving/gift-receiving-form.component';
import { GiftReceivingListComponent } from './pages/gift-hospitality-receiving/gift-receiving-list.component';
import { GiftReceivingViewComponent } from './pages/gift-hospitality-receiving/gift-receiving-view.component';
import { FormPlaceholderComponent } from './pages/anti-corruption/form-placeholder.component';
import { CommitteesComponent } from './pages/committees/committees.component';
import { ExpensesClaimViewComponent } from './pages/expenses-claim/expenses-claim-view.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, title: 'Sign in | Meinhardt EDMS' },
  {
    path: '',
    component: AppShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: DashboardComponent, title: 'Dashboard | Meinhardt EDMS' },
      { path: 'modules', component: ModulesComponent, title: 'Applications | Meinhardt EDMS' },
      { path: 'master-data/committees', component: CommitteesComponent, canActivate: [permissionGuard('committees.manage')], title: 'Committee | Meinhardt EDMS' },
      { path: 'access-management', component: AccessManagementComponent, canActivate: [accessManagementGuard], title: 'User & Access Management | Meinhardt EDMS' },
      { path: 'role-permissions', component: RolePermissionsComponent, canActivate: [accessManagementGuard], title: 'Role Permissions | Meinhardt EDMS' },
      {
        path: 'general/expenses',
        canActivate: [permissionGuard('expenses-claim.view')],
        children: [
          { path: '', component: ExpensesClaimListComponent, title: 'Expenses Claim | Meinhardt EDMS' },
          { path: 'new', component: ExpensesClaimFormComponent, canActivate: [permissionGuard('expenses-claim.create')], title: 'New Expenses Claim | Meinhardt EDMS' },
          { path: ':id', component: ExpensesClaimViewComponent, title: 'Expenses Claim | Meinhardt EDMS' },
          { path: ':id/edit', component: ExpensesClaimFormComponent, canActivate: [permissionGuard('expenses-claim.create')], title: 'Edit Expenses Claim | Meinhardt EDMS' },
        ],
      },
      {
        path: 'general/allowances',
        canActivate: [permissionGuard('allowance-after-10pm.view')],
        children: [
          { path: '', component: AllowanceListComponent, title: 'Allowance After 10 PM | Meinhardt EDMS' },
          { path: 'new', component: AllowanceFormComponent, canActivate: [permissionGuard('allowance-after-10pm.create')], title: 'New Allowance Request | Meinhardt EDMS' },
          { path: ':id', component: AllowanceViewComponent, title: 'Allowance Request | Meinhardt EDMS' },
          { path: ':id/edit', component: AllowanceFormComponent, canActivate: [permissionGuard('allowance-after-10pm.create')], title: 'Edit Allowance Request | Meinhardt EDMS' },
        ],
      },
      {
        path: 'anti-corruption/charitable-contribution',
        canActivate: [permissionGuard('charitable-contribution.view')],
        children: [
          { path: '', component: CharitableContributionListComponent, title: 'Charitable Contribution Requests | Meinhardt EDMS' },
          { path: 'new', component: CharitableContributionFormComponent, canActivate: [permissionGuard('charitable-contribution.create')], title: 'New Charitable Contribution Request | Meinhardt EDMS' },
          { path: ':id', component: CharitableContributionViewComponent, title: 'Charitable Contribution Request | Meinhardt EDMS' },
          { path: ':id/edit', component: CharitableContributionFormComponent, canActivate: [permissionGuard('charitable-contribution.create')], title: 'Edit Charitable Contribution Request | Meinhardt EDMS' },
        ],
      },
      {
        path: 'anti-corruption/gift-hospitality-offering',
        canActivate: [permissionGuard('gift-hospitality-offering.view')],
        children: [
          { path: '', component: GiftOfferingListComponent, title: 'Gift/Hospitality Offering Requests | Meinhardt EDMS' },
          { path: 'new', component: GiftOfferingFormComponent, canActivate: [permissionGuard('gift-hospitality-offering.create')], title: 'New Gift/Hospitality Offering Request | Meinhardt EDMS' },
          { path: ':id', component: GiftOfferingViewComponent, title: 'Gift/Hospitality Offering Request | Meinhardt EDMS' },
          { path: ':id/edit', component: GiftOfferingFormComponent, canActivate: [permissionGuard('gift-hospitality-offering.create')], title: 'Edit Gift/Hospitality Offering Request | Meinhardt EDMS' },
        ],
      },
      {
        path: 'procurement/requisitions',
        canActivate: [permissionGuard('purchase-requisition.view')],
        children: [
          { path: '', component: PurchaseRequisitionListComponent, title: 'Purchase Requisitions | Meinhardt EDMS' },
          { path: 'new', component: PurchaseRequisitionFormComponent, canActivate: [permissionGuard('purchase-requisition.create')], title: 'New Purchase Requisition | Meinhardt EDMS' },
          { path: ':id', component: PurchaseRequisitionViewComponent, title: 'Purchase Requisition | Meinhardt EDMS' },
          { path: ':id/edit', component: PurchaseRequisitionFormComponent, canActivate: [permissionGuard('purchase-requisition.create')], title: 'Edit Purchase Requisition | Meinhardt EDMS' },
        ],
      },
      {
        path: 'anti-corruption/gift-hospitality-receiving',
        canActivate: [permissionGuard('gift-hospitality-receiving.view')],
        children: [
          { path: '', component: GiftReceivingListComponent, title: 'Gift/Hospitality Receiving Requests | Meinhardt EDMS' },
          { path: 'new', component: GiftReceivingFormComponent, canActivate: [permissionGuard('gift-hospitality-receiving.create')], title: 'New Gift/Hospitality Receiving Request | Meinhardt EDMS' },
          { path: ':id', component: GiftReceivingViewComponent, title: 'Gift/Hospitality Receiving Request | Meinhardt EDMS' },
          { path: ':id/edit', component: GiftReceivingFormComponent, canActivate: [permissionGuard('gift-hospitality-receiving.create')], title: 'Edit Gift/Hospitality Receiving Request | Meinhardt EDMS' },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
