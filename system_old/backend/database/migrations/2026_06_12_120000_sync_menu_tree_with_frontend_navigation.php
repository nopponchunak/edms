<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SyncMenuTreeWithFrontendNavigation extends Migration
{
    private $permissionColumns = [
        'view',
        'edit',
        'save',
        'delete',
        'create',
        'view_own',
        'edit_own',
        'delete_own',
        'view_all',
        'edit_all',
        'delete_all',
    ];

    public function up()
    {
        if (!Schema::hasTable('main_menus') || !Schema::hasTable('menus')) {
            return;
        }

        DB::transaction(function () {
            $imsMainMenuId = $this->ensureMainMenu(['IMS FORMS', 'IMS Forms'], 'IMS FORMS', 1);
            $acpMainMenuId = $this->ensureMainMenu([
                'ANTI-CORRUPTION FORMS',
                'Anti-Corruption Forms',
                'Anti-Corruption Form',
                'Acp',
            ], 'ANTI-CORRUPTION FORMS', 2);
            $generalMainMenuId = $this->ensureMainMenu(['GENERAL FORMS', 'General Forms'], 'GENERAL FORMS', 3);
            $settingMainMenuId = $this->ensureMainMenu(['SETTING', 'Setting', 'Settings'], 'SETTING', 4);

            $desiredMenuIds = [];
            $parentKeys = [];

            $projectMenuId = $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'PROJECT',
                'key' => 'frontend.ims.project',
                'path' => null,
                'sort_order' => 1,
            ], null));
            $parentKeys[] = 'frontend.ims.project';

            $initiationMenuId = $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => '18 - FORM MTPR',
                'key' => 'mm1.initiation',
                'path' => null,
                'sort_order' => 1,
            ], $projectMenuId));
            $parentKeys[] = 'mm1.initiation';

            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Proposal & Contract Review',
                'key' => 'mm1.initiation.proposal_contract_review',
                'path' => '/proposal-contract-review',
                'sort_order' => 1,
            ], $initiationMenuId));
            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Project Fee Sheet',
                'key' => 'mm1.initiation.fee_sheet.project_fee_sheet',
                'path' => '/project-fee-sheet',
                'sort_order' => 2,
            ], $initiationMenuId));
            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Project Fee Sheet (Facade)',
                'key' => 'mm1.initiation.fee_sheet.facade_project_fee_sheet',
                'path' => '/project-facade-fee-sheet',
                'sort_order' => 3,
            ], $initiationMenuId));
            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Project Fee Sheet (Transportation)',
                'key' => 'mm1.initiation.fee_sheet.transportation_project_fee_sheet',
                'path' => '/project-transportation-fee-sheet',
                'sort_order' => 4,
            ], $initiationMenuId));

            $formMtqpMenuId = $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => '19 - FORM MTQP',
                'key' => 'frontend.ims.form_mtqp',
                'path' => null,
                'sort_order' => 2,
            ], $projectMenuId));
            $parentKeys[] = 'frontend.ims.form_mtqp';

            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Project Quality Assurance Plan',
                'key' => 'mm1.initiation.project_quality_assurance_plan',
                'path' => '/project-quality-assurance-plan',
                'sort_order' => 1,
            ], $formMtqpMenuId));

            $designReviewMenuId = $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => '20 - FORM MTDD',
                'key' => 'mm1.design_review',
                'path' => null,
                'sort_order' => 3,
            ], $projectMenuId));
            $parentKeys[] = 'mm1.design_review';

            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Design Review Overview',
                'key' => 'mm1.design_review.design_workflow',
                'path' => '/design-workflow',
                'sort_order' => 1,
            ], $designReviewMenuId));
            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Concept Design Review',
                'key' => 'mm1.design_review.concept_design_review',
                'path' => '/concept-design-review',
                'sort_order' => 2,
            ], $designReviewMenuId));
            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Schematic Design Review',
                'key' => 'mm1.design_review.schematic_design_review',
                'path' => '/schematic-design-review',
                'sort_order' => 3,
            ], $designReviewMenuId));
            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Submission Review',
                'key' => 'mm1.design_review.submission_review',
                'path' => '/submission-review',
                'sort_order' => 4,
            ], $designReviewMenuId));

            $tenderMenuId = $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => '21-FORM-MTDD',
                'key' => 'frontend.ims.tender',
                'path' => null,
                'sort_order' => 5,
            ], $designReviewMenuId));
            $parentKeys[] = 'frontend.ims.tender';

            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Tender Review',
                'key' => 'mm1.design_review.tender_review',
                'path' => '/tender-review',
                'sort_order' => 1,
            ], $tenderMenuId));

            $tenderCsaMenuId = $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'CSA',
                'key' => 'mm1.design_review.tender_csa',
                'path' => null,
                'sort_order' => 2,
            ], $tenderMenuId));
            $parentKeys[] = 'mm1.design_review.tender_csa';

            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Tender Review',
                'key' => 'mm1.design_review.tender_csa_review',
                'path' => '/tender/csa/review',
                'sort_order' => 1,
            ], $tenderCsaMenuId));
            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Tender Verification',
                'key' => 'mm1.design_review.tender_csa_verification',
                'path' => '/tender/csa/verification',
                'sort_order' => 2,
            ], $tenderCsaMenuId));

            $tenderMepMenuId = $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'MEP',
                'key' => 'mm1.design_review.tender_mep',
                'path' => null,
                'sort_order' => 3,
            ], $tenderMenuId));
            $parentKeys[] = 'mm1.design_review.tender_mep';

            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Tender Review',
                'key' => 'mm1.design_review.tender_mep_review',
                'path' => '/tender/mep/review',
                'sort_order' => 1,
            ], $tenderMepMenuId));
            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Tender Verification',
                'key' => 'mm1.design_review.tender_mep_verification',
                'path' => '/tender/mep/verification',
                'sort_order' => 2,
            ], $tenderMepMenuId));

            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Construction Validation',
                'key' => 'mm1.design_review.construction_validation',
                'path' => '/construction-validation',
                'sort_order' => 6,
            ], $designReviewMenuId));
            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Engineering Audit/Study Review',
                'key' => 'mm1.engineering_audit_study_review',
                'path' => '/engineering-audit-review',
                'sort_order' => 7,
            ], $designReviewMenuId));
            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Value Engineering Exercise Review',
                'key' => 'mm1.value_engineering',
                'path' => '/value-engineering',
                'sort_order' => 8,
            ], $designReviewMenuId));
            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'LEED Review',
                'key' => 'mm1.leed_review',
                'path' => '/leed-review',
                'sort_order' => 9,
            ], $designReviewMenuId));

            $formMtcdMenuId = $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => '6 - FORM MTCD',
                'key' => 'frontend.ims.form_mtcd',
                'path' => null,
                'sort_order' => 2,
            ], null));
            $parentKeys[] = 'frontend.ims.form_mtcd';
            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Controlled Document Request',
                'key' => 'mm5.controlled_document_request_change',
                'path' => '/controlled-document-request',
                'sort_order' => 1,
            ], $formMtcdMenuId));

            $formMtscMenuId = $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => '10 - FORM MTSC',
                'key' => 'frontend.ims.form_mtsc',
                'path' => null,
                'sort_order' => 3,
            ], null));
            $parentKeys[] = 'frontend.ims.form_mtsc';
            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Sub-consultant Assessment',
                'key' => 'mm3.sub_consultant_assessment',
                'path' => '/sub-consultant-assessment',
                'sort_order' => 1,
            ], $formMtscMenuId));
            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Sub-consultant Evaluation',
                'key' => 'mm3.sub_consultant_evaluation',
                'path' => '/sub-consultant-evaluation',
                'sort_order' => 2,
            ], $formMtscMenuId));

            $formMtpcMenuId = $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => '27 - FORM MTPC',
                'key' => 'frontend.ims.form_mtpc',
                'path' => null,
                'sort_order' => 4,
            ], null));
            $parentKeys[] = 'frontend.ims.form_mtpc';
            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Supplier Assessment',
                'key' => 'mm4.supplier_assessment',
                'path' => '/supplier-assessment',
                'sort_order' => 1,
            ], $formMtpcMenuId));
            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Purchase Requisition',
                'key' => 'mm4.purchase_requisitions',
                'path' => '/purchase-requisition',
                'sort_order' => 2,
            ], $formMtpcMenuId));
            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Purchase Order',
                'key' => 'mm4.purchase_orders',
                'path' => '/purchase-order',
                'sort_order' => 3,
            ], $formMtpcMenuId));
            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Supplier Evaluation',
                'key' => 'mm4.supplier_evaluation',
                'path' => '/supplier-evaluation',
                'sort_order' => 4,
            ], $formMtpcMenuId));
            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Single Source / Price Justification',
                'key' => 'mm4.single_source_price_justification',
                'path' => '/single-source-justification',
                'sort_order' => 5,
            ], $formMtpcMenuId));

            $formMtncMenuId = $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => '32 - FORM MTNC',
                'key' => 'frontend.ims.form_mtnc',
                'path' => null,
                'sort_order' => 5,
            ], null));
            $parentKeys[] = 'frontend.ims.form_mtnc';
            $this->keep($desiredMenuIds, $this->upsertMenu($imsMainMenuId, [
                'name' => 'Corrective Action Request (CAR)',
                'key' => 'mm5.car_corrective_action_request',
                'path' => '/cars',
                'sort_order' => 1,
            ], $formMtncMenuId));

            $this->keep($desiredMenuIds, $this->upsertMenu($acpMainMenuId, [
                'name' => 'Charitable Contribution Requests',
                'key' => 'mm5.charitable_contribution_requests',
                'path' => '/charitable-contributions',
                'sort_order' => 1,
            ], null));
            $this->keep($desiredMenuIds, $this->upsertMenu($acpMainMenuId, [
                'name' => 'Gift/Hospitality Offering Requests',
                'key' => 'mm5.gift_hospitality_offering_requests',
                'path' => '/gift-hospitality-offering',
                'sort_order' => 2,
            ], null));
            $this->keep($desiredMenuIds, $this->upsertMenu($acpMainMenuId, [
                'name' => 'Gift/Hospitality Receiving Requests',
                'key' => 'mm5.gift_hospitality_requests',
                'path' => '/gift-hospitality',
                'sort_order' => 3,
            ], null));

            $this->keep($desiredMenuIds, $this->upsertMenu($generalMainMenuId, [
                'name' => 'Allowance for Working after 10 PM',
                'key' => 'mm2.allowance_after_10pm',
                'path' => '/allowance-after-10pm',
                'sort_order' => 1,
            ], null));
            $this->keep($desiredMenuIds, $this->upsertMenu($generalMainMenuId, [
                'name' => 'Expenses Claim',
                'key' => 'mm2.expenses_claim',
                'path' => '/expenses-claim',
                'sort_order' => 2,
            ], null));

            $this->syncSettingMenus($settingMainMenuId, $desiredMenuIds, $parentKeys, true);

            $this->softDeleteMenusByKeys(['mm1.initiation.fee_sheet']);
            $this->softDeleteMenusNotInDesired($this->affectedMainMenuIds([
                $imsMainMenuId,
                $acpMainMenuId,
                $generalMainMenuId,
                $settingMainMenuId,
            ]), $desiredMenuIds);
            $this->softDeleteMainMenusByNames(['Projects', 'Admin Forms', 'Purchase Forms']);

            $this->syncParentPermissionRowsByKeys($parentKeys);
        });
    }

    public function down()
    {
        if (!Schema::hasTable('main_menus') || !Schema::hasTable('menus')) {
            return;
        }

        DB::transaction(function () {
            $projectsMainMenuId = $this->ensureMainMenu(['Projects'], 'Projects', 1);
            $generalMainMenuId = $this->ensureMainMenu(['GENERAL FORMS', 'General Forms'], 'General Forms', 2);
            $adminMainMenuId = $this->ensureMainMenu(['Admin Forms'], 'Admin Forms', 3);
            $purchaseMainMenuId = $this->ensureMainMenu(['Purchase Forms'], 'Purchase Forms', 4);
            $imsMainMenuId = $this->ensureMainMenu(['IMS FORMS', 'IMS Forms'], 'IMS Forms', 5);
            $acpMainMenuId = $this->ensureMainMenu([
                'ANTI-CORRUPTION FORMS',
                'Anti-Corruption Forms',
                'Anti-Corruption Form',
                'Acp',
            ], 'Anti-Corruption Forms', 6);
            $settingMainMenuId = $this->ensureMainMenu(['SETTING', 'Setting', 'Settings'], 'Setting', 7);

            $parentKeys = [];

            $initiationMenuId = $this->upsertMenu($projectsMainMenuId, [
                'name' => 'Initiation',
                'key' => 'mm1.initiation',
                'path' => null,
                'sort_order' => 1,
            ], null);
            $parentKeys[] = 'mm1.initiation';
            $this->upsertMenu($projectsMainMenuId, [
                'name' => 'Proposal & Contact Review',
                'key' => 'mm1.initiation.proposal_contract_review',
                'path' => '/proposal-contract-review',
                'sort_order' => 1,
            ], $initiationMenuId);
            $this->upsertMenu($projectsMainMenuId, [
                'name' => 'Project Quality Assurance Plan',
                'key' => 'mm1.initiation.project_quality_assurance_plan',
                'path' => '/project-quality-assurance-plan',
                'sort_order' => 2,
            ], $initiationMenuId);

            $feeSheetMenuId = $this->upsertMenu($projectsMainMenuId, [
                'name' => 'Fee Sheet',
                'key' => 'mm1.initiation.fee_sheet',
                'path' => null,
                'sort_order' => 3,
            ], $initiationMenuId);
            $parentKeys[] = 'mm1.initiation.fee_sheet';
            $this->upsertMenu($projectsMainMenuId, [
                'name' => 'C&S-M&E Project Fee Sheet',
                'key' => 'mm1.initiation.fee_sheet.project_fee_sheet',
                'path' => '/project-fee-sheet',
                'sort_order' => 1,
            ], $feeSheetMenuId);
            $this->upsertMenu($projectsMainMenuId, [
                'name' => 'Facade Project Fee Sheet',
                'key' => 'mm1.initiation.fee_sheet.facade_project_fee_sheet',
                'path' => '/project-facade-fee-sheet',
                'sort_order' => 2,
            ], $feeSheetMenuId);
            $this->upsertMenu($projectsMainMenuId, [
                'name' => 'Transportation Project Fee Seet',
                'key' => 'mm1.initiation.fee_sheet.transportation_project_fee_sheet',
                'path' => '/project-transportation-fee-sheet',
                'sort_order' => 3,
            ], $feeSheetMenuId);

            $designReviewMenuId = $this->upsertMenu($projectsMainMenuId, [
                'name' => 'Design Review',
                'key' => 'mm1.design_review',
                'path' => null,
                'sort_order' => 2,
            ], null);
            $parentKeys[] = 'mm1.design_review';
            $this->upsertMenu($projectsMainMenuId, [
                'name' => 'Concept Design Review',
                'key' => 'mm1.design_review.concept_design_review',
                'path' => '/concept-design-review',
                'sort_order' => 1,
            ], $designReviewMenuId);
            $this->upsertMenu($projectsMainMenuId, [
                'name' => 'Schematic Design Review',
                'key' => 'mm1.design_review.schematic_design_review',
                'path' => '/schematic-design-review',
                'sort_order' => 2,
            ], $designReviewMenuId);
            $this->upsertMenu($projectsMainMenuId, [
                'name' => 'Submission Review',
                'key' => 'mm1.design_review.submission_review',
                'path' => '/submission-review',
                'sort_order' => 3,
            ], $designReviewMenuId);

            $tenderReviewMenuId = $this->upsertMenu($projectsMainMenuId, [
                'name' => 'Tender Review',
                'key' => 'mm1.design_review.tender_review',
                'path' => '/tender-review',
                'sort_order' => 4,
            ], $designReviewMenuId);
            $parentKeys[] = 'mm1.design_review.tender_review';
            $tenderCsaMenuId = $this->upsertMenu($projectsMainMenuId, [
                'name' => 'Tender CSA',
                'key' => 'mm1.design_review.tender_csa',
                'path' => null,
                'sort_order' => 1,
            ], $tenderReviewMenuId);
            $parentKeys[] = 'mm1.design_review.tender_csa';
            $this->upsertMenu($projectsMainMenuId, [
                'name' => 'Tender CSA Review',
                'key' => 'mm1.design_review.tender_csa_review',
                'path' => '/tender/csa/review',
                'sort_order' => 1,
            ], $tenderCsaMenuId);
            $this->upsertMenu($projectsMainMenuId, [
                'name' => 'Tender CSA Verification',
                'key' => 'mm1.design_review.tender_csa_verification',
                'path' => '/tender/csa/verification',
                'sort_order' => 2,
            ], $tenderCsaMenuId);
            $tenderMepMenuId = $this->upsertMenu($projectsMainMenuId, [
                'name' => 'Tender MEP',
                'key' => 'mm1.design_review.tender_mep',
                'path' => null,
                'sort_order' => 2,
            ], $tenderReviewMenuId);
            $parentKeys[] = 'mm1.design_review.tender_mep';
            $this->upsertMenu($projectsMainMenuId, [
                'name' => 'Tender MEP Review',
                'key' => 'mm1.design_review.tender_mep_review',
                'path' => '/tender/mep/review',
                'sort_order' => 1,
            ], $tenderMepMenuId);
            $this->upsertMenu($projectsMainMenuId, [
                'name' => 'Tender MEP Verification',
                'key' => 'mm1.design_review.tender_mep_verification',
                'path' => '/tender/mep/verification',
                'sort_order' => 2,
            ], $tenderMepMenuId);
            $this->upsertMenu($projectsMainMenuId, [
                'name' => 'Construction Validation',
                'key' => 'mm1.design_review.construction_validation',
                'path' => '/construction-validation',
                'sort_order' => 5,
            ], $designReviewMenuId);
            $this->upsertMenu($projectsMainMenuId, [
                'name' => 'Design Workflow',
                'key' => 'mm1.design_review.design_workflow',
                'path' => '/design-workflow',
                'sort_order' => 6,
            ], $designReviewMenuId);
            $this->upsertMenu($projectsMainMenuId, [
                'name' => 'Engineering Audit/Study Review',
                'key' => 'mm1.engineering_audit_study_review',
                'path' => '/engineering-audit-review',
                'sort_order' => 3,
            ], null);
            $this->upsertMenu($projectsMainMenuId, [
                'name' => 'Value Engineering',
                'key' => 'mm1.value_engineering',
                'path' => '/value-engineering',
                'sort_order' => 4,
            ], null);
            $this->upsertMenu($projectsMainMenuId, [
                'name' => 'LEED Review',
                'key' => 'mm1.leed_review',
                'path' => '/leed-review',
                'sort_order' => 5,
            ], null);

            $this->upsertMenu($generalMainMenuId, [
                'name' => 'Allowance for Working after 10 PM',
                'key' => 'mm2.allowance_after_10pm',
                'path' => '/allowance-after-10pm',
                'sort_order' => 1,
            ], null);
            $this->upsertMenu($generalMainMenuId, [
                'name' => 'Expenses Claim',
                'key' => 'mm2.expenses_claim',
                'path' => '/expenses-claim',
                'sort_order' => 2,
            ], null);
            $this->upsertMenu($adminMainMenuId, [
                'name' => 'Sub-Consultant Assessment',
                'key' => 'mm3.sub_consultant_assessment',
                'path' => '/sub-consultant-assessment',
                'sort_order' => 1,
            ], null);
            $this->upsertMenu($adminMainMenuId, [
                'name' => 'Sub-Consultant Evaluation',
                'key' => 'mm3.sub_consultant_evaluation',
                'path' => '/sub-consultant-evaluation',
                'sort_order' => 2,
            ], null);
            $this->upsertMenu($purchaseMainMenuId, [
                'name' => 'Purchase Requisitions (PR)',
                'key' => 'mm4.purchase_requisitions',
                'path' => '/purchase-requisition',
                'sort_order' => 1,
            ], null);
            $this->upsertMenu($purchaseMainMenuId, [
                'name' => 'Purchase Orders (PO)',
                'key' => 'mm4.purchase_orders',
                'path' => '/purchase-order',
                'sort_order' => 2,
            ], null);
            $this->upsertMenu($purchaseMainMenuId, [
                'name' => 'Single Source / Price Justification',
                'key' => 'mm4.single_source_price_justification',
                'path' => '/single-source-justification',
                'sort_order' => 3,
            ], null);
            $this->upsertMenu($purchaseMainMenuId, [
                'name' => 'Supplier Assessment',
                'key' => 'mm4.supplier_assessment',
                'path' => '/supplier-assessment',
                'sort_order' => 4,
            ], null);
            $this->upsertMenu($purchaseMainMenuId, [
                'name' => 'Supplier Evaluation',
                'key' => 'mm4.supplier_evaluation',
                'path' => '/supplier-evaluation',
                'sort_order' => 5,
            ], null);
            $this->upsertMenu($imsMainMenuId, [
                'name' => 'Controlled Document Request / Change',
                'key' => 'mm5.controlled_document_request_change',
                'path' => '/controlled-document-request',
                'sort_order' => 1,
            ], null);
            $this->upsertMenu($imsMainMenuId, [
                'name' => 'Corrective Action Request (CAR)',
                'key' => 'mm5.car_corrective_action_request',
                'path' => '/cars',
                'sort_order' => 2,
            ], null);
            $this->upsertMenu($acpMainMenuId, [
                'name' => 'Charitable Contribution Requests',
                'key' => 'mm5.charitable_contribution_requests',
                'path' => '/charitable-contributions',
                'sort_order' => 1,
            ], null);
            $this->upsertMenu($acpMainMenuId, [
                'name' => 'Gift/Hospitality Offering Requests',
                'key' => 'mm5.gift_hospitality_offering_requests',
                'path' => '/gift-hospitality-offering',
                'sort_order' => 2,
            ], null);
            $this->upsertMenu($acpMainMenuId, [
                'name' => 'Gift/Hospitality Requests',
                'key' => 'mm5.gift_hospitality_requests',
                'path' => '/gift-hospitality',
                'sort_order' => 3,
            ], null);

            $desiredMenuIds = [];
            $this->syncSettingMenus($settingMainMenuId, $desiredMenuIds, $parentKeys, false);

            $this->softDeleteMenusByKeys([
                'frontend.ims.project',
                'frontend.ims.form_mtqp',
                'frontend.ims.tender',
                'frontend.ims.form_mtcd',
                'frontend.ims.form_mtsc',
                'frontend.ims.form_mtpc',
                'frontend.ims.form_mtnc',
            ]);

            $this->syncParentPermissionRowsByKeys($parentKeys);
        });
    }

    private function syncSettingMenus(int $settingMainMenuId, array &$desiredMenuIds, array &$parentKeys, bool $frontendNames): void
    {
        $rootMenus = [
            ['name' => 'User Setting', 'key' => 'mm6.user_settings', 'path' => '/settings/users', 'sort_order' => 1],
            ['name' => 'Permission', 'key' => 'mm6.permission_settings', 'path' => '/settings/permissions', 'sort_order' => 2],
            ['name' => 'Main Menu', 'key' => 'mm6.main_menu', 'path' => '/settings/main-menus', 'sort_order' => 4],
            ['name' => 'Manual Management', 'key' => 'mm6.manual_management', 'path' => '/settings/manual-management', 'sort_order' => 5],
            ['name' => 'Audit Log', 'key' => 'mm6.audit_log_settings', 'path' => '/settings/audit-logs', 'sort_order' => 6],
            ['name' => 'Signature Setting', 'key' => 'mm6.signature_settings', 'path' => '/settings/signatures', 'sort_order' => 7],
        ];

        foreach ($rootMenus as $menu) {
            $this->keep($desiredMenuIds, $this->upsertMenu($settingMainMenuId, $menu, null));
        }

        $masterDataMenuId = $this->keep($desiredMenuIds, $this->upsertMenu($settingMainMenuId, [
            'name' => 'Master Data',
            'key' => 'mm6.master_data',
            'path' => null,
            'sort_order' => 3,
        ], null));
        $parentKeys[] = 'mm6.master_data';

        $this->keep($desiredMenuIds, $this->upsertMenu($settingMainMenuId, [
            'name' => $frontendNames ? 'Sub-Consultant list' : 'Sub-Consultant List',
            'key' => 'mm6.sub_consultant_settings',
            'path' => '/settings/sub-consultants',
            'sort_order' => 1,
        ], $masterDataMenuId));
        $this->keep($desiredMenuIds, $this->upsertMenu($settingMainMenuId, [
            'name' => 'Sub-Consultant Type',
            'key' => 'mm6.sub_consultant_type_settings',
            'path' => '/settings/sub-consultant-types',
            'sort_order' => 2,
        ], $masterDataMenuId));
        $this->keep($desiredMenuIds, $this->upsertMenu($settingMainMenuId, [
            'name' => 'Committee Setting',
            'key' => 'mm6.committee_settings',
            'path' => '/settings/committees',
            'sort_order' => 3,
        ], $masterDataMenuId));
        $this->keep($desiredMenuIds, $this->upsertMenu($settingMainMenuId, [
            'name' => 'Supplier List',
            'key' => 'mm6.supplier_settings',
            'path' => '/settings/suppliers',
            'sort_order' => 4,
        ], $masterDataMenuId));
        $this->keep($desiredMenuIds, $this->upsertMenu($settingMainMenuId, [
            'name' => 'Supplier Type',
            'key' => 'mm6.supplier_type_settings',
            'path' => '/settings/supplier-types',
            'sort_order' => 5,
        ], $masterDataMenuId));
        $this->keep($desiredMenuIds, $this->upsertMenu($settingMainMenuId, [
            'name' => 'Project Type',
            'key' => 'mm6.project_type_settings',
            'path' => '/settings/project-types',
            'sort_order' => 6,
        ], $masterDataMenuId));
        $this->keep($desiredMenuIds, $this->upsertMenu($settingMainMenuId, [
            'name' => 'Discipline',
            'key' => 'mm6.discipline_settings',
            'path' => '/settings/disciplines',
            'sort_order' => 7,
        ], $masterDataMenuId));
        $this->keep($desiredMenuIds, $this->upsertMenu($settingMainMenuId, [
            'name' => 'Project Detail',
            'key' => 'mm6.project_detail_settings',
            'path' => '/settings/project-details',
            'sort_order' => 8,
        ], $masterDataMenuId));
    }

    private function ensureMainMenu(array $names, string $canonicalName, int $sortOrder): int
    {
        $mainMenuId = $this->mainMenuIdByNames($names, true);

        if ($mainMenuId) {
            $this->updateMainMenu($mainMenuId, $canonicalName, $sortOrder);
            return $mainMenuId;
        }

        $values = [
            'name' => $canonicalName,
            'created_at' => now(),
            'updated_at' => now(),
        ];

        if (Schema::hasColumn('main_menus', 'sort_order')) {
            $values['sort_order'] = $sortOrder;
        }
        if (Schema::hasColumn('main_menus', 'deleted_at')) {
            $values['deleted_at'] = null;
        }

        return (int) DB::table('main_menus')->insertGetId($values);
    }

    private function updateMainMenu(int $id, string $name, int $sortOrder): void
    {
        $values = [
            'name' => $name,
            'updated_at' => now(),
        ];

        if (Schema::hasColumn('main_menus', 'sort_order')) {
            $values['sort_order'] = $sortOrder;
        }
        if (Schema::hasColumn('main_menus', 'deleted_at')) {
            $values['deleted_at'] = null;
        }

        DB::table('main_menus')->where('id', $id)->update($values);
    }

    private function mainMenuIdByNames(array $names, bool $includeDeleted = false): ?int
    {
        $query = DB::table('main_menus')->whereIn('name', $names);

        if (!$includeDeleted && Schema::hasColumn('main_menus', 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        if ($includeDeleted && Schema::hasColumn('main_menus', 'deleted_at')) {
            $active = (clone $query)->whereNull('deleted_at')->orderBy('id')->first();
            if ($active) {
                return (int) $active->id;
            }
        }

        $row = $query->orderBy('id')->first();
        return $row ? (int) $row->id : null;
    }

    private function mainMenuIdsByNames(array $names): array
    {
        $query = DB::table('main_menus')->whereIn('name', $names);
        if (Schema::hasColumn('main_menus', 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        return $query->pluck('id')->map(function ($id) {
            return (int) $id;
        })->toArray();
    }

    private function upsertMenu(int $mainMenuId, array $menu, ?int $parentId): int
    {
        $target = $this->findMenuTarget($mainMenuId, $menu, $parentId);

        $values = [
            'main_menu_id' => $mainMenuId,
            'name' => $menu['name'],
            'updated_at' => now(),
        ];

        if (Schema::hasColumn('menus', 'parent_id')) {
            $values['parent_id'] = $parentId;
        }
        if (Schema::hasColumn('menus', 'sort_order')) {
            $values['sort_order'] = (int) $menu['sort_order'];
        }
        if (Schema::hasColumn('menus', 'key')) {
            $values['key'] = $menu['key'];
        }
        if (Schema::hasColumn('menus', 'path')) {
            $values['path'] = $menu['path'];
        }
        if (Schema::hasColumn('menus', 'deleted_at')) {
            $values['deleted_at'] = null;
        }

        if ($target) {
            DB::table('menus')->where('id', $target->id)->update($values);
            return (int) $target->id;
        }

        $values['created_at'] = now();
        return (int) DB::table('menus')->insertGetId($values);
    }

    private function findMenuTarget(int $mainMenuId, array $menu, ?int $parentId)
    {
        if (!empty($menu['key']) && Schema::hasColumn('menus', 'key')) {
            $target = DB::table('menus')->where('key', $menu['key'])->orderBy('id')->first();
            if ($target) {
                return $target;
            }
        }

        if (array_key_exists('path', $menu) && $menu['path'] !== null && Schema::hasColumn('menus', 'path')) {
            $target = DB::table('menus')->where('path', $menu['path'])->orderBy('id')->first();
            if ($target) {
                return $target;
            }
        }

        $query = DB::table('menus')
            ->where('main_menu_id', $mainMenuId)
            ->where('name', $menu['name']);

        if (Schema::hasColumn('menus', 'parent_id')) {
            if ($parentId === null) {
                $query->whereNull('parent_id');
            } else {
                $query->where('parent_id', $parentId);
            }
        }

        return $query->orderBy('id')->first();
    }

    private function keep(array &$ids, int $id): int
    {
        $ids[] = $id;
        return $id;
    }

    private function affectedMainMenuIds(array $targetMainMenuIds): array
    {
        return array_values(array_unique(array_merge(
            $targetMainMenuIds,
            $this->mainMenuIdsByNames([
                'Projects',
                'Admin Forms',
                'Purchase Forms',
                'IMS FORMS',
                'IMS Forms',
                'GENERAL FORMS',
                'General Forms',
                'ANTI-CORRUPTION FORMS',
                'Anti-Corruption Forms',
                'Anti-Corruption Form',
                'Acp',
                'SETTING',
                'Setting',
                'Settings',
            ])
        )));
    }

    private function softDeleteMenusNotInDesired(array $mainMenuIds, array $desiredMenuIds): void
    {
        if (empty($mainMenuIds) || empty($desiredMenuIds)) {
            return;
        }

        $query = DB::table('menus')
            ->whereIn('main_menu_id', array_unique($mainMenuIds))
            ->whereNotIn('id', array_unique($desiredMenuIds));

        if (Schema::hasColumn('menus', 'deleted_at')) {
            $menuIds = (clone $query)->whereNull('deleted_at')->pluck('id')->map(function ($id) {
                return (int) $id;
            })->toArray();
            $this->softDeleteRows('menus', 'id', $menuIds);
            if (Schema::hasTable('menu_permissions')) {
                $this->softDeleteRows('menu_permissions', 'menu_id', $menuIds);
            }
            return;
        }

        $menuIds = $query->pluck('id')->map(function ($id) {
            return (int) $id;
        })->toArray();
        if (Schema::hasTable('menu_permissions')) {
            DB::table('menu_permissions')->whereIn('menu_id', $menuIds)->delete();
        }
        DB::table('menus')->whereIn('id', $menuIds)->delete();
    }

    private function softDeleteMainMenusByNames(array $names): void
    {
        $ids = $this->mainMenuIdsByNames($names);
        $this->softDeleteRows('main_menus', 'id', $ids);
    }

    private function softDeleteMenusByKeys(array $keys): void
    {
        if (empty($keys) || !Schema::hasColumn('menus', 'key')) {
            return;
        }

        $menuIds = DB::table('menus')->whereIn('key', $keys)->pluck('id')->map(function ($id) {
            return (int) $id;
        })->toArray();

        if (Schema::hasTable('menu_permissions')) {
            $this->softDeleteRows('menu_permissions', 'menu_id', $menuIds);
        }
        $this->softDeleteRows('menus', 'id', $menuIds);
    }

    private function syncParentPermissionRowsByKeys(array $parentKeys): void
    {
        if (!Schema::hasTable('menu_permissions') || !Schema::hasColumn('menus', 'key')) {
            return;
        }

        foreach (array_unique($parentKeys) as $key) {
            $parentId = $this->menuIdByKey($key);
            if (!$parentId) {
                continue;
            }

            $this->syncParentPermissionRows($parentId, $this->leafDescendantIds($parentId));
        }
    }

    private function syncParentPermissionRows(int $parentMenuId, array $leafMenuIds): void
    {
        if (empty($leafMenuIds)) {
            $this->softDeleteRows('menu_permissions', 'menu_id', [$parentMenuId]);
            return;
        }

        $childRowsQuery = DB::table('menu_permissions')
            ->whereIn('menu_id', $leafMenuIds);

        if (Schema::hasColumn('menu_permissions', 'deleted_at')) {
            $childRowsQuery->whereNull('deleted_at');
        }

        $permissionIds = $childRowsQuery
            ->pluck('permission_id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->unique()
            ->values()
            ->toArray();
        $permissionIds = $this->existingPermissionIds($permissionIds);

        $this->softDeleteParentPermissionsNotIn($parentMenuId, $permissionIds);

        foreach ($permissionIds as $permissionId) {
            $actions = $this->aggregatePermissionActions($permissionId, $leafMenuIds);

            $existing = DB::table('menu_permissions')
                ->where('permission_id', $permissionId)
                ->where('menu_id', $parentMenuId)
                ->first();

            $values = [
                'permission_id' => $permissionId,
                'menu_id' => $parentMenuId,
                'update_by' => 'frontend-menu-tree-sync',
                'updated_at' => now(),
            ];

            foreach ($actions as $column => $value) {
                if (Schema::hasColumn('menu_permissions', $column)) {
                    $values[$column] = $value;
                }
            }
            if (Schema::hasColumn('menu_permissions', 'deleted_at')) {
                $values['deleted_at'] = null;
            }

            if ($existing) {
                DB::table('menu_permissions')->where('id', $existing->id)->update($values);
                continue;
            }

            $values['create_by'] = 'frontend-menu-tree-sync';
            $values['created_at'] = now();
            DB::table('menu_permissions')->insert($values);
        }
    }

    private function aggregatePermissionActions(int $permissionId, array $menuIds): array
    {
        $query = DB::table('menu_permissions')
            ->where('permission_id', $permissionId)
            ->whereIn('menu_id', $menuIds);

        if (Schema::hasColumn('menu_permissions', 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        $actions = array_fill_keys($this->permissionColumns, 0);
        foreach ($query->get() as $row) {
            foreach ($this->permissionColumns as $column) {
                if ($this->value($row, $column)) {
                    $actions[$column] = 1;
                }
            }
        }

        $actions['view'] = ($actions['view'] || $actions['view_own'] || $actions['view_all']) ? 1 : 0;
        $actions['edit'] = ($actions['edit'] || $actions['edit_own'] || $actions['edit_all']) ? 1 : 0;
        $actions['save'] = ($actions['save'] || $actions['create'] || $actions['edit_own'] || $actions['edit_all']) ? 1 : 0;
        $actions['delete'] = ($actions['delete'] || $actions['delete_own'] || $actions['delete_all']) ? 1 : 0;

        return $actions;
    }

    private function existingPermissionIds(array $permissionIds): array
    {
        $permissionIds = array_values(array_unique(array_filter($permissionIds)));
        if (empty($permissionIds) || !Schema::hasTable('permissions')) {
            return [];
        }

        $query = DB::table('permissions')->whereIn('id', $permissionIds);
        if (Schema::hasColumn('permissions', 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        return $query->pluck('id')->map(function ($id) {
            return (int) $id;
        })->toArray();
    }

    private function leafDescendantIds(int $parentMenuId): array
    {
        $query = DB::table('menus')->select('id', 'parent_id');
        if (Schema::hasColumn('menus', 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        $childrenByParent = [];
        foreach ($query->get() as $menu) {
            $parentId = $menu->parent_id === null ? 0 : (int) $menu->parent_id;
            $childrenByParent[$parentId][] = (int) $menu->id;
        }

        $leafIds = [];
        $walk = function (int $id) use (&$walk, &$leafIds, $childrenByParent) {
            $children = $childrenByParent[$id] ?? [];
            foreach ($children as $childId) {
                if (empty($childrenByParent[$childId])) {
                    $leafIds[] = $childId;
                    continue;
                }

                $walk($childId);
            }
        };

        $walk($parentMenuId);

        return array_values(array_unique($leafIds));
    }

    private function softDeleteParentPermissionsNotIn(int $parentMenuId, array $permissionIds): void
    {
        $query = DB::table('menu_permissions')->where('menu_id', $parentMenuId);

        if (!empty($permissionIds)) {
            $query->whereNotIn('permission_id', $permissionIds);
        }

        if (Schema::hasColumn('menu_permissions', 'deleted_at')) {
            $query->update([
                'deleted_at' => now(),
                'updated_at' => now(),
            ]);
            return;
        }

        $query->delete();
    }

    private function menuIdByKey(string $key): ?int
    {
        $row = DB::table('menus')->where('key', $key)->orderBy('id')->first();
        return $row ? (int) $row->id : null;
    }

    private function value($row, string $column): bool
    {
        return isset($row->{$column}) && (int) $row->{$column} === 1;
    }

    private function softDeleteRows(string $table, string $idColumn, array $ids): void
    {
        $ids = array_values(array_unique(array_filter($ids)));
        if (empty($ids)) {
            return;
        }

        if (Schema::hasColumn($table, 'deleted_at')) {
            DB::table($table)->whereIn($idColumn, $ids)->update([
                'deleted_at' => now(),
                'updated_at' => now(),
            ]);
            return;
        }

        DB::table($table)->whereIn($idColumn, $ids)->delete();
    }
}
