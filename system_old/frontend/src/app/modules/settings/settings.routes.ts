import { Route } from '@angular/router';
import { systemAdminGuard } from 'app/core/guards/system-admin.guard';

export default [
    {
        path: '',
        redirectTo: 'users/local',
        pathMatch: 'full',
    },
    {
        path: 'users',
        redirectTo: 'users/local',
        pathMatch: 'full',
    },
    {
        path: 'users/new',
        loadComponent: () =>
            import('./user-settings-form/user-settings-form.component').then(
                (m) => m.UserSettingsFormComponent
            ),
    },
    {
        path: 'users/edit/:id',
        loadComponent: () =>
            import('./user-settings-form/user-settings-form.component').then(
                (m) => m.UserSettingsFormComponent
            ),
    },
    {
        path: 'users/view/:id',
        loadComponent: () =>
            import('./user-settings-view/user-settings-view.component').then(
                (m) => m.UserSettingsViewComponent
            ),
    },
    {
        path: 'users/:type',
        loadComponent: () =>
            import('./user-settings-list/user-settings-list.component').then(
                (m) => m.UserSettingsListComponent
            ),
    },
    {
        path: 'sub-consultants',
        loadComponent: () =>
            import(
                './sub-consultant-settings-list/sub-consultant-settings-list.component'
            ).then((m) => m.SubConsultantSettingsListComponent),
    },
    {
        path: 'sub-consultants/new',
        loadComponent: () =>
            import(
                './sub-consultant-settings-form/sub-consultant-settings-form.component'
            ).then((m) => m.SubConsultantSettingsFormComponent),
    },
    {
        path: 'sub-consultants/edit/:id',
        loadComponent: () =>
            import(
                './sub-consultant-settings-form/sub-consultant-settings-form.component'
            ).then((m) => m.SubConsultantSettingsFormComponent),
    },
    {
        path: 'sub-consultant-types',
        loadComponent: () =>
            import(
                './sub-consultant-type-settings-list/sub-consultant-type-settings-list.component'
            ).then((m) => m.SubConsultantTypeSettingsListComponent),
    },
    {
        path: 'sub-consultant-types/new',
        loadComponent: () =>
            import(
                './sub-consultant-type-settings-form/sub-consultant-type-settings-form.component'
            ).then((m) => m.SubConsultantTypeSettingsFormComponent),
    },
    {
        path: 'sub-consultant-types/edit/:id',
        loadComponent: () =>
            import(
                './sub-consultant-type-settings-form/sub-consultant-type-settings-form.component'
            ).then((m) => m.SubConsultantTypeSettingsFormComponent),
    },
    {
        path: 'committees',
        loadComponent: () =>
            import(
                './committee-settings-list/committee-settings-list.component'
            ).then((m) => m.CommitteeSettingsListComponent),
    },
    {
        path: 'committees/new',
        loadComponent: () =>
            import(
                './committee-settings-form/committee-settings-form.component'
            ).then((m) => m.CommitteeSettingsFormComponent),
    },
    {
        path: 'committees/edit/:id',
        loadComponent: () =>
            import(
                './committee-settings-form/committee-settings-form.component'
            ).then((m) => m.CommitteeSettingsFormComponent),
    },
    {
        path: 'suppliers',
        loadComponent: () =>
            import(
                './supplier-settings-list/supplier-settings-list.component'
            ).then((m) => m.SupplierSettingsListComponent),
    },
    {
        path: 'suppliers/new',
        loadComponent: () =>
            import(
                './supplier-settings-form/supplier-settings-form.component'
            ).then((m) => m.SupplierSettingsFormComponent),
    },
    {
        path: 'suppliers/edit/:id',
        loadComponent: () =>
            import(
                './supplier-settings-form/supplier-settings-form.component'
            ).then((m) => m.SupplierSettingsFormComponent),
    },
    {
        path: 'main-menus',
        loadComponent: () =>
            import(
                './main-menu-settings-list/main-menu-settings-list.component'
            ).then((m) => m.MainMenuSettingsListComponent),
    },
    {
        path: 'main-menus/:id',
        loadComponent: () =>
            import(
                './main-menu-settings-detail/main-menu-settings-detail.component'
            ).then((m) => m.MainMenuSettingsDetailComponent),
    },
    {
        path: 'manual-management',
        loadComponent: () =>
            import('./manual-management/manual-management.component').then(
                (m) => m.ManualManagementComponent
            ),
    },
    {
        path: 'audit-logs',
        canActivate: [systemAdminGuard],
        loadComponent: () =>
            import('./audit-log-list/audit-log-list.component').then(
                (m) => m.AuditLogListComponent
            ),
    },
    {
        path: 'permissions',
        loadComponent: () =>
            import(
                './permission-settings-list/permission-settings-list.component'
            ).then((m) => m.PermissionSettingsListComponent),
    },
    {
        path: 'permissions/new',
        loadComponent: () =>
            import(
                './permission-settings-form/permission-settings-form.component'
            ).then((m) => m.PermissionSettingsFormComponent),
    },
    {
        path: 'permissions/view/:id',
        loadComponent: () =>
            import(
                './permission-settings-view/permission-settings-view.component'
            ).then((m) => m.PermissionSettingsViewComponent),
    },
    {
        path: 'permissions/edit/:id',
        loadComponent: () =>
            import(
                './permission-settings-form/permission-settings-form.component'
            ).then((m) => m.PermissionSettingsFormComponent),
    },
    {
        path: 'project-types',
        loadComponent: () =>
            import(
                './project-type-settings-list/project-type-settings-list.component'
            ).then((m) => m.ProjectTypeSettingsListComponent),
    },
    {
        path: 'supplier-types',
        loadComponent: () =>
            import(
                './supplier-type-settings-list/supplier-type-settings-list.component'
            ).then((m) => m.SupplierTypeSettingsListComponent),
    },
    {
        path: 'supplier-types/new',
        loadComponent: () =>
            import(
                './supplier-type-settings-form/supplier-type-settings-form.component'
            ).then((m) => m.SupplierTypeSettingsFormComponent),
    },
    {
        path: 'supplier-types/edit/:id',
        loadComponent: () =>
            import(
                './supplier-type-settings-form/supplier-type-settings-form.component'
            ).then((m) => m.SupplierTypeSettingsFormComponent),
    },
    {
        path: 'project-types/new',
        loadComponent: () =>
            import(
                './project-type-settings-form/project-type-settings-form.component'
            ).then((m) => m.ProjectTypeSettingsFormComponent),
    },
    {
        path: 'project-types/edit/:id',
        loadComponent: () =>
            import(
                './project-type-settings-form/project-type-settings-form.component'
            ).then((m) => m.ProjectTypeSettingsFormComponent),
    },
    {
        path: 'disciplines',
        loadComponent: () =>
            import(
                './discipline-settings-list/discipline-settings-list.component'
            ).then((m) => m.DisciplineSettingsListComponent),
    },
    {
        path: 'disciplines/new',
        loadComponent: () =>
            import(
                './discipline-settings-form/discipline-settings-form.component'
            ).then((m) => m.DisciplineSettingsFormComponent),
    },
    {
        path: 'disciplines/edit/:id',
        loadComponent: () =>
            import(
                './discipline-settings-form/discipline-settings-form.component'
            ).then((m) => m.DisciplineSettingsFormComponent),
    },
    {
        path: 'signatures/new',
        loadComponent: () =>
            import(
                './signature-settings-form/signature-settings-form.component'
            ).then((m) => m.SignatureSettingsFormComponent),
    },
    {
        path: 'signatures/edit/:id',
        loadComponent: () =>
            import(
                './signature-settings-form/signature-settings-form.component'
            ).then((m) => m.SignatureSettingsFormComponent),
    },
    {
        path: 'signatures',
        loadComponent: () =>
            import(
                './signature-settings-list/signature-settings-list.component'
            ).then((m) => m.SignatureSettingsListComponent),
    },
    {
        path: 'project-details',
        loadComponent: () =>
            import(
                './project-detail-settings-list/project-detail-settings-list.component'
            ).then((m) => m.ProjectDetailSettingsListComponent),
    },
    {
        path: 'project-details/new',
        loadComponent: () =>
            import(
                './project-detail-settings-form/project-detail-settings-form.component'
            ).then((m) => m.ProjectDetailSettingsFormComponent),
    },
    {
        path: 'project-details/edit/:id',
        loadComponent: () =>
            import(
                './project-detail-settings-form/project-detail-settings-form.component'
            ).then((m) => m.ProjectDetailSettingsFormComponent),
    },
] as Route[];
