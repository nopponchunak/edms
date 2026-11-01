import { Injectable } from '@angular/core';
import { FuseNavigationItem } from '@fuse/components/navigation';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService } from './api.service';
import { isSystemAdminUser } from 'app/core/utils/system-admin.util';

type PermissionAction =
    | 'create'
    | 'view_own'
    | 'edit_own'
    | 'delete_own'
    | 'view_all'
    | 'edit_all'
    | 'delete_all'
    | 'view'
    | 'edit'
    | 'save'
    | 'delete';

export interface MenuPermission {
    menu_id: number;
    menu: {
        id: number;
        main_menu_id: number;
        parent_id: number | null;
        name: string;
        sort_order: number;
        key: string;
        path: string | null;
        main_menu: {
            id: number;
            name: string;
        };
    };
    create: number;
    view_own: number;
    edit_own: number;
    delete_own: number;
    view_all: number;
    edit_all: number;
    delete_all: number;
    view: number;
    edit: number;
    save: number;
    delete: number;
}

@Injectable({
    providedIn: 'root',
})
export class NavigationPermissionService {
    private permissionsSubject = new BehaviorSubject<MenuPermission[]>([]);
    public permissions$ = this.permissionsSubject.asObservable();

    private readonly menuKeyToNavIdMap: { [key: string]: string } = {
        'mm1.initiation': 'initiation',
        'mm1.initiation.proposal_contract_review': 'proposal-contract-review',
        'mm1.initiation.project_quality_assurance_plan':
            'project-quality-assurance-plan',
        'mm1.initiation.additional_design_fees': 'additional-design-fees',
        'mm1.initiation.fee_sheet': 'fee-sheet',
        'mm1.initiation.fee_sheet.project_fee_sheet': 'project-fee-sheet',
        'mm1.initiation.fee_sheet.facade_project_fee_sheet':
            'project-facade-fee-sheet',
        'mm1.initiation.fee_sheet.transportation_project_fee_sheet':
            'project-transportation-fee-sheet',
        'mm1.design_review': 'design-review',
        'mm1.design_review.concept_design_review': 'concept-design-review',
        'mm1.design_review.schematic_design_review': 'schematic-design-review',
        'mm1.design_review.submission_review': 'submission-review',
        'mm1.design_review.tender_review': 'tender-review',
        'mm1.design_review.tender_csa': 'tender-csa',
        'mm1.design_review.tender_csa_review': 'tender-csa-review',
        'mm1.design_review.tender_csa_verification': 'tender-csa-verification',
        'mm1.design_review.tender_mep': 'tender-mep',
        'mm1.design_review.tender_mep_review': 'tender-mep-review',
        'mm1.design_review.tender_mep_verification': 'tender-mep-verification',
        'mm1.design_review.construction_validation': 'construction-validation',
        'mm1.design_review.design_workflow': 'design-workflow',
        'mm1.design_review.legacy_design_review': 'legacy-design-review',
        'mm1.design_review.legacy_design_review_completed_records':
            'legacy-design-review-completed-records',
        'mm1.design_workflow': 'design-workflow',
        'mm1.engineering_audit_study_review': 'engineering-audit-review',
        'mm1.value_engineering': 'value-engineering',
        'mm1.leed_review': 'leed-review',
        'mm2.allowance_after_10pm': 'allowance-after-10pm',
        'mm2.expenses_claim': 'expenses-claim',
        'mm3.sub_consultant_assessment': 'sub-consultant-assessment',
        'mm3.sub_consultant_evaluation': 'sub-consultant-evaluation',
        'mm4.purchase_requisitions': 'purchase-requisition',
        'mm4.purchase_orders': 'purchase-order',
        'mm4.single_source_price_justification': 'single-source-justification',
        'mm4.supplier_assessment': 'supplier-assessment',
        'mm4.supplier_evaluation': 'supplier-evaluation',
        'mm5.charitable_contribution_requests':
            'request-for-charitable-contributions-sponsorship',
        'mm5.controlled_document_request_change':
            'controlled-document-request-change',
        'mm5.car_corrective_action_request': 'cars',
        'mm5.gift_hospitality_offering_requests':
            'request-for-offering-of-gift-hospitality',
        'mm5.gift_hospitality_requests':
            'request-for-receiving-of-gift-hospitality',
        'mm6.user_settings': 'user-settings',
        'mm6.permission_settings': 'permission-settings',
        'mm6.sub_consultant_settings': 'sub-consultant-settings',
        'mm6.sub_consultant_type_settings': 'sub-consultant-type-settings',
        'mm6.committee_settings': 'committee-settings',
        'mm6.supplier_settings': 'supplier-settings',
        'mm6.supplier_type_settings': 'supplier-type-settings',
        'mm6.main_menu': 'main-menu-settings',
        'mm6.manual_management': 'manual-management',
        'mm6.project_type_settings': 'project-type-settings',
        'mm6.discipline_settings': 'discipline-settings',
        'mm6.project_detail_settings': 'project-detail-settings',
        'mm6.signature_settings': 'signature-settings',
    };

    private readonly navIdToMenuKeyAliasMap: { [navId: string]: string } = {
        tender: 'mm1.design_review.tender_review',
        'tender-csa': 'mm1.design_review.tender_review',
        'tender-csa-review': 'mm1.design_review.tender_review',
        'tender-csa-verification': 'mm1.design_review.tender_review',
        'tender-mep': 'mm1.design_review.tender_review',
        'tender-mep-review': 'mm1.design_review.tender_review',
        'tender-mep-verification': 'mm1.design_review.tender_review',
        'legacy-design-review': 'mm1.design_review.design_workflow',
        'legacy-design-review-completed-records':
            'mm1.design_review.design_workflow',
    };

    constructor(private apiService: ApiService) {
        this.loadPermissionsFromStorage();
    }

    loadPermissions(permissionId?: number): Observable<MenuPermission[]> {
        if (!permissionId) {
            const storedPermissionId = localStorage.getItem('permission_id');
            if (!storedPermissionId) {
                return of([]);
            }
            permissionId = parseInt(storedPermissionId, 10);
        }

        if (!permissionId || isNaN(permissionId)) {
            return of([]);
        }

        return this.apiService.getPermissionMenu(permissionId).pipe(
            map((response: any) => {
                if (response.status && Array.isArray(response.data)) {
                    const permissions = response.data as MenuPermission[];
                    this.permissionsSubject.next(permissions);
                    localStorage.setItem(
                        'menu_permissions',
                        JSON.stringify(permissions)
                    );
                    return permissions;
                }

                return [];
            }),
            catchError((error) => {
                console.error('Error loading permissions:', error);
                return of([]);
            })
        );
    }

    hasViewPermission(menuKey: string): boolean {
        if (menuKey === 'mm6.audit_log_settings') {
            return isSystemAdminUser();
        }

        const permission = this.permissionsSubject.value.find(
            (p) => p.menu?.key === menuKey
        );
        return permission
            ? this.hasAny(permission, ['view_own', 'view_all', 'view'])
            : false;
    }

    hasViewPermissionByNavId(navId: string): boolean {
        return this.hasActionPermissionByNavId(
            navId,
            ['view_own', 'view_all', 'view'],
            true
        );
    }

    hasCreatePermissionByNavId(navId: string): boolean {
        return this.hasActionPermissionByNavId(navId, ['create', 'save']);
    }

    hasViewOwnPermissionByNavId(navId: string): boolean {
        return this.hasActionPermissionByNavId(navId, ['view_own', 'view']);
    }

    hasViewAllPermissionByNavId(navId: string): boolean {
        return this.hasActionPermissionByNavId(navId, ['view_all']);
    }

    hasEditOwnPermissionByNavId(navId: string): boolean {
        return this.hasActionPermissionByNavId(navId, ['edit_own', 'edit']);
    }

    hasEditAllPermissionByNavId(navId: string): boolean {
        return this.hasActionPermissionByNavId(navId, ['edit_all', 'edit']);
    }

    hasDeleteOwnPermissionByNavId(navId: string): boolean {
        return this.hasActionPermissionByNavId(navId, ['delete_own', 'delete']);
    }

    hasDeleteAllPermissionByNavId(navId: string): boolean {
        return this.hasActionPermissionByNavId(navId, ['delete_all', 'delete']);
    }

    hasEditPermissionByNavId(navId: string): boolean {
        return this.hasActionPermissionByNavId(navId, [
            'edit_own',
            'edit_all',
            'edit',
        ]);
    }

    hasDeletePermissionByNavId(navId: string): boolean {
        return this.hasActionPermissionByNavId(navId, [
            'delete_own',
            'delete_all',
            'delete',
        ]);
    }

    hasSavePermissionByNavId(navId: string): boolean {
        return this.hasActionPermissionByNavId(navId, [
            'create',
            'edit_own',
            'edit_all',
            'save',
        ]);
    }

    hasViewPermissionByMenuId(menuId: number): boolean {
        const permission = this.permissionsSubject.value.find(
            (p) => p.menu_id === menuId
        );
        return permission
            ? this.hasAny(permission, ['view_own', 'view_all', 'view'])
            : false;
    }

    filterNavigationItems(items: FuseNavigationItem[]): FuseNavigationItem[] {
        if (!items || items.length === 0) {
            return [];
        }

        return items
            .map((item) => {
                if (!this.shouldShowMenuItem(item)) {
                    return null;
                }

                if (item.children && item.children.length > 0) {
                    const filteredChildren = this.filterNavigationItems(
                        item.children
                    );
                    if (filteredChildren.length === 0) {
                        return null;
                    }

                    return {
                        ...item,
                        children: filteredChildren,
                    };
                }

                return item;
            })
            .filter((item): item is FuseNavigationItem => item !== null);
    }

    clearPermissions(): void {
        this.permissionsSubject.next([]);
        localStorage.removeItem('menu_permissions');
    }

    private hasActionPermissionByNavId(
        navId: string,
        actions: PermissionAction[],
        allowChildFallback = false
    ): boolean {
        if (navId === 'audit-log-settings') {
            return isSystemAdminUser();
        }

        const permissions = this.permissionsSubject.value;
        if (permissions.length === 0) {
            return true;
        }

        const permission = this.findPermissionByNavId(navId);
        if (permission) {
            return (
                this.hasAny(permission, actions) ||
                (allowChildFallback && this.hasAnyChildPermission(navId))
            );
        }

        return allowChildFallback ? this.hasAnyChildPermission(navId) : false;
    }

    private findPermissionByNavId(navId: string): MenuPermission | null {
        const permissions = this.permissionsSubject.value;
        const exactMenuKeys = Object.keys(this.menuKeyToNavIdMap).filter(
            (key) => this.menuKeyToNavIdMap[key] === navId
        );
        const aliasMenuKey = this.navIdToMenuKeyAliasMap[navId];
        const menuKeys = aliasMenuKey
            ? [...exactMenuKeys, aliasMenuKey]
            : exactMenuKeys;

        if (menuKeys.length === 0) {
            return null;
        }

        for (const menuKey of menuKeys) {
            const permission = permissions.find((p) => p.menu?.key === menuKey);
            if (permission) {
                return permission;
            }
        }

        return null;
    }

    private hasAny(
        permission: MenuPermission,
        actions: PermissionAction[]
    ): boolean {
        return actions.some((action) => Number(permission[action] ?? 0) === 1);
    }

    private hasAnyChildPermission(parentNavId: string): boolean {
        const mainMenuChildren: { [key: string]: string[] } = {
            projects: ['initiation', 'form-mtqp', 'design-review'],
            'general-forms': ['allowance-after-10pm', 'expenses-claim'],
            'admin-forms': [
                'sub-consultant-assessment',
                'sub-consultant-evaluation',
            ],
            'purchase-forms': [
                'purchase-requisition',
                'purchase-order',
                'single-source-justification',
                'supplier-assessment',
                'supplier-evaluation',
            ],
            'ims-forms': [
                'projects',
                'form-mtcd',
                'form-mtsc',
                'form-mtpc',
                'form-mtnc',
            ],
            acp: [
                'request-for-charitable-contributions-sponsorship',
                'request-for-offering-of-gift-hospitality',
                'request-for-receiving-of-gift-hospitality',
            ],
            settings: [
                'user-settings',
                'permission-settings',
                'master-data',
                'main-menu-settings',
                'manual-management',
                'audit-log-settings',
                'signature-settings',
            ],
        };

        const children =
            mainMenuChildren[parentNavId] ?? this.subMenuChildren(parentNavId);
        return children.some((childId) =>
            this.hasViewPermissionByNavId(childId)
        );
    }

    private subMenuChildren(parentNavId: string): string[] {
        const subMenuChildren: { [key: string]: string[] } = {
            initiation: [
                'proposal-contract-review',
                'project-fee-sheet',
                'project-facade-fee-sheet',
                'project-transportation-fee-sheet',
            ],
            'form-mtqp': ['project-quality-assurance-plan'],
            'fee-sheet': [
                'project-fee-sheet',
                'project-facade-fee-sheet',
                'project-transportation-fee-sheet',
            ],
            'design-review': [
                'design-workflow',
                'legacy-design-review-completed-records',
                'concept-design-review',
                'schematic-design-review',
                'submission-review',
                'tender',
                'tender-review',
                'construction-validation',
                'engineering-audit-review',
                'value-engineering',
                'leed-review',
            ],
            tender: ['tender-review', 'tender-csa', 'tender-mep'],
            'tender-csa': ['tender-csa-review', 'tender-csa-verification'],
            'tender-mep': ['tender-mep-review', 'tender-mep-verification'],
            'form-mtcd': ['controlled-document-request-change'],
            'form-mtsc': [
                'sub-consultant-assessment',
                'sub-consultant-evaluation',
            ],
            'form-mtpc': [
                'supplier-assessment',
                'purchase-requisition',
                'purchase-order',
                'supplier-evaluation',
                'single-source-justification',
            ],
            'form-mtnc': ['cars'],
            'master-data': [
                'sub-consultant-settings',
                'sub-consultant-type-settings',
                'committee-settings',
                'supplier-settings',
                'supplier-type-settings',
                'project-type-settings',
                'discipline-settings',
                'project-detail-settings',
            ],
        };

        return subMenuChildren[parentNavId] ?? [];
    }

    private shouldShowMenuItem(item: FuseNavigationItem): boolean {
        if (!item.id) {
            return true;
        }

        if (item.id === 'dashboard') {
            return true;
        }

        if (item.id === 'audit-log-settings') {
            return isSystemAdminUser();
        }

        if (this.permissionsSubject.value.length === 0) {
            return true;
        }

        return this.hasViewPermissionByNavId(item.id);
    }

    private loadPermissionsFromStorage(): void {
        const stored = localStorage.getItem('menu_permissions');
        if (!stored) {
            return;
        }

        try {
            this.permissionsSubject.next(
                JSON.parse(stored) as MenuPermission[]
            );
        } catch (error) {
            console.error('Error parsing stored permissions:', error);
            localStorage.removeItem('menu_permissions');
        }
    }
}
