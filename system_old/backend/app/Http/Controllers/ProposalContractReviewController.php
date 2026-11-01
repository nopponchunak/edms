<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;
use App\Models\ProposalContractReview;

class ProposalContractReviewController extends Controller
{
    // =========================================================
    // getList
    // =========================================================
    public function getList()
    {
        $Item = ProposalContractReview::orderBy('id', 'desc')->get()->toArray();

        if (!empty($Item)) {
            for ($i = 0; $i < count($Item); $i++) {
                $Item[$i]['No'] = $i + 1;
            }
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $Item);
    }

    // =========================================================
    // getPage (DataTable)
    // =========================================================
    public function getPage(Request $request)
    {
        $columns = $request->columns;
        $length  = $request->length;
        $order   = $request->order;
        $search  = $request->search;
        $start   = $request->start;
        $page    = $start / ($length ?: 10) + 1;

        $projectType = $request->project_type;

        $col = [
            'id',
            'project_name',
            'project_no',
            'client_name',
            'city',
            'country',
            'project_type',
            'estimated_total_fees',
            'currency',
            'proposal_to_be_submitted',
            'contract_agreed_to_proceed',
            'filled_in_by',
            'filled_in_date',
            'create_by',
            'update_by',
            'created_at',
            'updated_at',
        ];

        $orderby = [
            '',
            'project_name',
            'project_no',
            'client_name',
            'city',
            'country',
            'project_type',
            'estimated_total_fees',
            'filled_in_date',
            'created_at',
        ];

        $D = ProposalContractReview::select($col);

        if (!empty($projectType)) {
            $D->where('project_type', $projectType);
        }

        // sort
        if (!empty($order) && ($orderby[$order[0]['column']] ?? false)) {
            $D->orderBy($orderby[$order[0]['column']], $order[0]['dir']);
        }

        // search
        if (!empty($search['value'])) {
            $keyword = '%' . $search['value'] . '%';
            $D->where(function ($q) use ($keyword, $col) {
                foreach ($col as $c) {
                    $q->orWhere($c, 'like', $keyword);
                }
            });
        }

        $d = $D->paginate($length, ['*'], 'page', $page);

        if ($d->isNotEmpty()) {
            $No = (($page - 1) * $length);
            for ($i = 0; $i < count($d); $i++) {
                $No        = $No + 1;
                $d[$i]->No = $No;
            }
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $d);
    }

    // =========================================================
    // show
    // =========================================================
    public function show($id)
    {
        $Item = ProposalContractReview::find($id);

        if (!$Item) {
            return $this->returnErrorData('ไม่พบข้อมูลที่ระบุ', 404);
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $Item);
    }

    // =========================================================
    // store
    // =========================================================
    public function store(Request $request)
    {
        $loginBy = $request->login_by;

        // Required หลัก ๆ ตามหน้าฟอร์ม
        if (!isset($request->project_name)) {
            return $this->returnErrorData('กรุณาระบุ project_name', 404);
        }
        if (!isset($request->project_no)) {
            return $this->returnErrorData('กรุณาระบุ project_no', 404);
        }
        if (!isset($request->city)) {
            return $this->returnErrorData('กรุณาระบุ city', 404);
        }
        if (!isset($request->country)) {
            return $this->returnErrorData('กรุณาระบุ country', 404);
        }
        if (!isset($request->client_name)) {
            return $this->returnErrorData('กรุณาระบุ client_name', 404);
        }
        if (!isset($request->client_contact_name)) {
            return $this->returnErrorData('กรุณาระบุ client_contact_name', 404);
        }
        if (!isset($request->project_type)) {
            return $this->returnErrorData('กรุณาระบุ project_type', 404);
        }
        if (!isset($request->currency)) {
            return $this->returnErrorData('กรุณาระบุ currency', 404);
        }
        if (!isset($request->filled_in_by)) {
            return $this->returnErrorData('กรุณาระบุ filled_in_by', 404);
        }

        // Convert date
        $filled_in_date             = $this->convertDMY($request->filled_in_date);
        $proposal_reviewer1_date    = $this->convertDMY($request->proposal_reviewer1_date);
        $proposal_reviewer2_date    = $this->convertDMY($request->proposal_reviewer2_date);
        $proposal_reviewer3_date    = $this->convertDMY($request->proposal_reviewer3_date);
        $contract_reviewer1_date    = $this->convertDMY($request->contract_reviewer1_date);
        $contract_reviewer2_date    = $this->convertDMY($request->contract_reviewer2_date);
        $contract_reviewer3_date    = $this->convertDMY($request->contract_reviewer3_date);

        DB::beginTransaction();

        try {
            $Item = new ProposalContractReview();

            // Header Information
            $Item->copies_to  = $request->copies_to;
            $Item->circ_adm   = $request->circ_adm;
            $Item->ch_file    = $request->ch_file;

            // Project Identification
            $Item->project_name       = $request->project_name;
            $Item->project_no         = $request->project_no;
            $Item->proposal_attached  = $request->proposal_attached;

            // Location
            $Item->city    = $request->city;
            $Item->country = $request->country;

            // Client Information
            $Item->client_name          = $request->client_name;
            $Item->client_contact_name  = $request->client_contact_name;
            $Item->client_address       = $request->client_address;
            $Item->client_tel_no        = $request->client_tel_no;
            $Item->client_fax_no        = $request->client_fax_no;

            // Architect Information
            $Item->architect_name         = $request->architect_name;
            $Item->architect_contact_name = $request->architect_contact_name;
            $Item->architect_address      = $request->architect_address;
            $Item->architect_tel_no       = $request->architect_tel_no;
            $Item->architect_fax_no       = $request->architect_fax_no;

            // Project Details
            $Item->enquiry_from                  = $request->enquiry_from;
            $Item->pd_concept_detail_design      = $request->pd_concept_detail_design;
            $Item->pd_value_engineering          = $request->pd_value_engineering;
            $Item->pd_engineering_audit          = $request->pd_engineering_audit;
            $Item->pd_construction_supervision   = $request->pd_construction_supervision;
            $Item->pd_tender_evaluation          = $request->pd_tender_evaluation;
            $Item->pd_others_flag                = $request->pd_others_flag;
            $Item->pd_others_text                = $request->pd_others_text;

            // Discipline
            $Item->disc_cs              = $request->disc_cs;
            $Item->disc_facade          = $request->disc_facade;
            $Item->disc_transportation  = $request->disc_transportation;
            $Item->disc_me              = $request->disc_me;
            $Item->disc_lighting        = $request->disc_lighting;
            $Item->disc_others_flag     = $request->disc_others_flag;
            $Item->disc_others_text     = $request->disc_others_text;

            // Project Type / Fees
            $Item->project_type              = $request->project_type;
            $Item->fee_calculation_attached = $request->fee_calculation_attached;
            $Item->estimated_total_fees     = $request->estimated_total_fees;
            $Item->currency                 = $request->currency;

            // Scope & Resources
            $Item->scope_clearly_defined     = $request->scope_clearly_defined;
            $Item->staff_resources_available = $request->staff_resources_available;
            $Item->help_from_other_offices   = $request->help_from_other_offices;
            $Item->sub_consultants_required  = $request->sub_consultants_required;

            // Quality & Considerations
            $Item->qa_requirements        = $request->qa_requirements;
            $Item->special_considerations = $request->special_considerations;
            $Item->quality_comments       = $request->quality_comments;

            // Project Classification
            $Item->is_government_project = $request->is_government_project;
            $Item->is_mmcl_project       = $request->is_mmcl_project;
            $Item->is_mtl_project        = $request->is_mtl_project;

            // Administrative Details
            $Item->filled_in_by   = $request->filled_in_by;
            $Item->filled_in_date = $filled_in_date;

            // Conclusion of Proposal Review
            $Item->proposal_to_be_submitted = $request->proposal_to_be_submitted;
            $Item->proposal_decline         = $request->proposal_decline;
            $Item->win_probability          = $request->win_probability;

            $Item->proposal_reviewer1       = $request->proposal_reviewer1;
            $Item->proposal_reviewer1_date  = $proposal_reviewer1_date;
            $Item->proposal_reviewer2       = $request->proposal_reviewer2;
            $Item->proposal_reviewer2_date  = $proposal_reviewer2_date;
            $Item->proposal_reviewer3       = $request->proposal_reviewer3;
            $Item->proposal_reviewer3_date  = $proposal_reviewer3_date;

            // Conclusion of Contract Review
            $Item->contract_agreed_to_proceed = $request->contract_agreed_to_proceed;
            $Item->contract_decline           = $request->contract_decline;
            $Item->lead_tl                    = $request->lead_tl;
            $Item->tl_name                    = $request->tl_name;
            $Item->need_quality_plan_pqp      = $request->need_quality_plan_pqp;

            $Item->contract_reviewer1      = $request->contract_reviewer1;
            $Item->contract_reviewer1_date = $contract_reviewer1_date;
            $Item->contract_reviewer2      = $request->contract_reviewer2;
            $Item->contract_reviewer2_date = $contract_reviewer2_date;
            $Item->contract_reviewer3      = $request->contract_reviewer3;
            $Item->contract_reviewer3_date = $contract_reviewer3_date;

            // Standard fields
            $Item->create_by = $loginBy->id ?? 'admin';

            $Item->save();

            DB::commit();
            return $this->returnSuccess('บันทึกข้อมูลสำเร็จ', $Item);

        } catch (\Throwable $e) {
            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }

    // =========================================================
    // update
    // =========================================================
    public function update(Request $request, $id)
    {
        $loginBy = $request->login_by;

        if (!isset($request->project_name)) {
            return $this->returnErrorData('กรุณาระบุ project_name', 404);
        }

        $filled_in_date             = $this->convertDMY($request->filled_in_date);
        $proposal_reviewer1_date    = $this->convertDMY($request->proposal_reviewer1_date);
        $proposal_reviewer2_date    = $this->convertDMY($request->proposal_reviewer2_date);
        $proposal_reviewer3_date    = $this->convertDMY($request->proposal_reviewer3_date);
        $contract_reviewer1_date    = $this->convertDMY($request->contract_reviewer1_date);
        $contract_reviewer2_date    = $this->convertDMY($request->contract_reviewer2_date);
        $contract_reviewer3_date    = $this->convertDMY($request->contract_reviewer3_date);

        DB::beginTransaction();

        try {
            $Item = ProposalContractReview::find($id);
            if (!$Item) {
                return $this->returnErrorData('ไม่พบข้อมูล', 404);
            }

            // Header Information
            $Item->copies_to  = $request->copies_to;
            $Item->circ_adm   = $request->circ_adm;
            $Item->ch_file    = $request->ch_file;

            // Project Identification
            $Item->project_name       = $request->project_name;
            $Item->project_no         = $request->project_no;
            $Item->proposal_attached  = $request->proposal_attached;

            // Location
            $Item->city    = $request->city;
            $Item->country = $request->country;

            // Client Information
            $Item->client_name          = $request->client_name;
            $Item->client_contact_name  = $request->client_contact_name;
            $Item->client_address       = $request->client_address;
            $Item->client_tel_no        = $request->client_tel_no;
            $Item->client_fax_no        = $request->client_fax_no;

            // Architect Information
            $Item->architect_name         = $request->architect_name;
            $Item->architect_contact_name = $request->architect_contact_name;
            $Item->architect_address      = $request->architect_address;
            $Item->architect_tel_no       = $request->architect_tel_no;
            $Item->architect_fax_no       = $request->architect_fax_no;

            // Project Details
            $Item->enquiry_from                  = $request->enquiry_from;
            $Item->pd_concept_detail_design      = $request->pd_concept_detail_design;
            $Item->pd_value_engineering          = $request->pd_value_engineering;
            $Item->pd_engineering_audit          = $request->pd_engineering_audit;
            $Item->pd_construction_supervision   = $request->pd_construction_supervision;
            $Item->pd_tender_evaluation          = $request->pd_tender_evaluation;
            $Item->pd_others_flag                = $request->pd_others_flag;
            $Item->pd_others_text                = $request->pd_others_text;

            // Discipline
            $Item->disc_cs              = $request->disc_cs;
            $Item->disc_facade          = $request->disc_facade;
            $Item->disc_transportation  = $request->disc_transportation;
            $Item->disc_me              = $request->disc_me;
            $Item->disc_lighting        = $request->disc_lighting;
            $Item->disc_others_flag     = $request->disc_others_flag;
            $Item->disc_others_text     = $request->disc_others_text;

            // Project Type / Fees
            $Item->project_type              = $request->project_type;
            $Item->fee_calculation_attached = $request->fee_calculation_attached;
            $Item->estimated_total_fees     = $request->estimated_total_fees;
            $Item->currency                 = $request->currency;

            // Scope & Resources
            $Item->scope_clearly_defined     = $request->scope_clearly_defined;
            $Item->staff_resources_available = $request->staff_resources_available;
            $Item->help_from_other_offices   = $request->help_from_other_offices;
            $Item->sub_consultants_required  = $request->sub_consultants_required;

            // Quality & Considerations
            $Item->qa_requirements        = $request->qa_requirements;
            $Item->special_considerations = $request->special_considerations;
            $Item->quality_comments       = $request->quality_comments;

            // Project Classification
            $Item->is_government_project = $request->is_government_project;
            $Item->is_mmcl_project       = $request->is_mmcl_project;
            $Item->is_mtl_project        = $request->is_mtl_project;

            // Administrative Details
            $Item->filled_in_by   = $request->filled_in_by;
            $Item->filled_in_date = $filled_in_date;

            // Conclusion of Proposal Review
            $Item->proposal_to_be_submitted = $request->proposal_to_be_submitted;
            $Item->proposal_decline         = $request->proposal_decline;
            $Item->win_probability          = $request->win_probability;

            $Item->proposal_reviewer1       = $request->proposal_reviewer1;
            $Item->proposal_reviewer1_date  = $proposal_reviewer1_date;
            $Item->proposal_reviewer2       = $request->proposal_reviewer2;
            $Item->proposal_reviewer2_date  = $proposal_reviewer2_date;
            $Item->proposal_reviewer3       = $request->proposal_reviewer3;
            $Item->proposal_reviewer3_date  = $proposal_reviewer3_date;

            // Conclusion of Contract Review
            $Item->contract_agreed_to_proceed = $request->contract_agreed_to_proceed;
            $Item->contract_decline           = $request->contract_decline;
            $Item->lead_tl                    = $request->lead_tl;
            $Item->tl_name                    = $request->tl_name;
            $Item->need_quality_plan_pqp      = $request->need_quality_plan_pqp;

            $Item->contract_reviewer1      = $request->contract_reviewer1;
            $Item->contract_reviewer1_date = $contract_reviewer1_date;
            $Item->contract_reviewer2      = $request->contract_reviewer2;
            $Item->contract_reviewer2_date = $contract_reviewer2_date;
            $Item->contract_reviewer3      = $request->contract_reviewer3;
            $Item->contract_reviewer3_date = $contract_reviewer3_date;

            $Item->update_by = $loginBy->id ?? 'admin';
            $Item->save();

            DB::commit();
            return $this->returnUpdate('อัปเดตข้อมูลสำเร็จ', $Item);

        } catch (\Throwable $e) {
            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }

    // =========================================================
    // destroy
    // =========================================================
    public function destroy($id, Request $request)
    {
        $loginBy = $request->login_by;

        DB::beginTransaction();

        try {
            $Item = ProposalContractReview::find($id);

            if (!$Item) {
                return $this->returnErrorData('ไม่พบข้อมูล', 404);
            }

            $Item->delete();

            $this->Log(
                $loginBy->id ?? 'admin',
                "ลบข้อมูล Proposal Contract Review #{$id}",
                "ลบข้อมูล"
            );

            DB::commit();
            return $this->returnSuccess('ลบข้อมูลสำเร็จ', []);

        } catch (\Throwable $e) {
            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }

    // =========================================================
    // Convert DD-MM-YYYY -> Y-m-d
    // =========================================================
    private function convertDMY($value)
    {
        if (empty($value)) return null;

        try {
            if (preg_match('/^\d{2}-\d{2}-\d{4}$/', $value)) {
                return Carbon::createFromFormat('d-m-Y', $value)->format('Y-m-d');
            }
        } catch (\Throwable $e) {
            return $value;
        }

        return $value;
    }
}
