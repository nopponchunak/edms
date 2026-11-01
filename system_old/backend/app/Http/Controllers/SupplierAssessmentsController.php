<?php

namespace App\Http\Controllers;

use App\Models\SupplierAssessments;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SupplierAssessmentsController extends Controller
{
    private function normalizeAttachments($attachments)
    {
        if (is_array($attachments)) {
            return $attachments;
        }

        if (is_string($attachments)) {
            $decoded = json_decode($attachments, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                return $decoded;
            }

            $trimmed = trim($attachments);
            if ($trimmed !== '') {
                return [$trimmed];
            }
        }

        return [];
    }

    private function attachmentsToJson($attachments)
    {
        $normalized = $this->normalizeAttachments($attachments);
        return $this->encodeAttachments($normalized);
    }

    private function encodeAttachments($normalized)
    {
        if (empty($normalized)) {
            return null;
        }

        return json_encode($normalized, JSON_UNESCAPED_UNICODE);
    }

    // =========== getList ===========
    public function getList()
    {
        $Item = SupplierAssessments::orderBy('id', 'desc')->get()->toArray();

        if (!empty($Item)) {
            for ($i = 0; $i < count($Item); $i++) {
                $Item[$i]['No'] = $i + 1;
            }
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $Item);
    }

    // =========== getPage (DataTables style) ===========
    public function getPage(Request $request)
    {
        $columns = $request->columns;
        $length  = $request->length;
        $order   = $request->order;
        $search  = $request->search;
        $start   = $request->start;
        $page    = $start / $length + 1;

        $Recommendation = $request->recommendation;
        $ApprovedList   = $request->approved_to_supplier_list;

        $table = 'supplier_assessments';
        $col = [
            "{$table}.id",
            "{$table}.items_supplied",
            "{$table}.company_name",
            "{$table}.attachments",
            "{$table}.experience_score",
            "{$table}.staff_score",
            "{$table}.product_compliance_score",
            "{$table}.total_score",
            "{$table}.recommendation",
            "{$table}.approved_to_supplier_list",
            "{$table}.assessed_by",
            "{$table}.assessed_by_date",
            "{$table}.assessed_by_status",
            "{$table}.approved_by",
            "{$table}.approved_by_date",
            "{$table}.approved_by_status",
            "{$table}.acknowledged_by",
            "{$table}.acknowledged_by_date",
            "{$table}.acknowledged_by_status",
            "{$table}.create_by",
            "{$table}.update_by",
            "{$table}.created_at",
            "{$table}.updated_at",
            $this->employeeDisplayNameSelect('assessed_employee', 'assessed_by_name'),
            $this->employeeDisplayNameSelect('approved_employee', 'approved_by_name'),
            $this->employeeDisplayNameSelect('acknowledged_employee', 'acknowledged_by_name'),
            $this->employeeDisplayNameSelect('created_employee', 'create_by_name'),
            $this->employeeDisplayNameSelect('updated_employee', 'update_by_name'),
        ];

        $orderby = [
            "{$table}.company_name",
            "{$table}.assessed_by_date",
            "{$table}.total_score",
            "{$table}.assessed_by",
            "{$table}.created_at",
            "{$table}.acknowledged_by_status",
        ];

        $D = SupplierAssessments::query()
            ->leftJoin('employees as assessed_employee', function ($join) use ($table) {
                $join->on('assessed_employee.code', '=', "{$table}.assessed_by")
                    ->whereNull('assessed_employee.deleted_at');
            })
            ->leftJoin('employees as approved_employee', function ($join) use ($table) {
                $join->on('approved_employee.code', '=', "{$table}.approved_by")
                    ->whereNull('approved_employee.deleted_at');
            })
            ->leftJoin('employees as acknowledged_employee', function ($join) use ($table) {
                $join->on('acknowledged_employee.code', '=', "{$table}.acknowledged_by")
                    ->whereNull('acknowledged_employee.deleted_at');
            })
            ->leftJoin('employees as created_employee', function ($join) use ($table) {
                $join->on('created_employee.code', '=', "{$table}.create_by")
                    ->whereNull('created_employee.deleted_at');
            })
            ->leftJoin('employees as updated_employee', function ($join) use ($table) {
                $join->on('updated_employee.code', '=', "{$table}.update_by")
                    ->whereNull('updated_employee.deleted_at');
            })
            ->select($col);

        if (!empty($Recommendation)) {
            $D->where("{$table}.recommendation", $Recommendation);
        }

        if ($ApprovedList !== null && $ApprovedList !== '') {
            $D->where("{$table}.approved_to_supplier_list", $ApprovedList);
        }

        // sort
        if ($orderby[$order[0]['column']] ?? false) {
            $D->orderBy($orderby[$order[0]['column']], $order[0]['dir']);
        }

        // search
        if (!empty($search['value'])) {
            $searchableColumns = [
                "{$table}.id",
                "{$table}.items_supplied",
                "{$table}.company_name",
                "{$table}.total_score",
                "{$table}.recommendation",
                "{$table}.approved_to_supplier_list",
                "{$table}.assessed_by",
                "{$table}.approved_by",
                "{$table}.acknowledged_by",
                "{$table}.create_by",
                "{$table}.update_by",
                'assessed_employee.initial',
                'assessed_employee.firstname',
                'assessed_employee.lastname',
                'approved_employee.initial',
                'approved_employee.firstname',
                'approved_employee.lastname',
                'acknowledged_employee.initial',
                'acknowledged_employee.firstname',
                'acknowledged_employee.lastname',
                'created_employee.initial',
                'created_employee.firstname',
                'created_employee.lastname',
                'updated_employee.initial',
                'updated_employee.firstname',
                'updated_employee.lastname',
            ];

            $D->where(function ($query) use ($search, $searchableColumns) {
                foreach ($searchableColumns as $c) {
                    $query->orWhere($c, 'like', '%' . $search['value'] . '%');
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

    private function employeeDisplayNameSelect($employeeAlias, $fieldAlias)
    {
        return DB::raw("
            NULLIF(
                TRIM(
                    CONCAT(
                        CASE
                            WHEN {$employeeAlias}.initial IS NOT NULL AND TRIM({$employeeAlias}.initial) <> ''
                            THEN CONCAT(TRIM(TRAILING '.' FROM {$employeeAlias}.initial), ', ')
                            ELSE ''
                        END,
                        CONCAT_WS(
                            ' ',
                            NULLIF(TRIM({$employeeAlias}.firstname), ''),
                            NULLIF(TRIM({$employeeAlias}.lastname), '')
                        )
                    )
                ),
                ''
            ) as {$fieldAlias}
        ");
    }

    // =========== show ===========
    public function show($id)
    {
        $Item = SupplierAssessments::find($id);

        if (!$Item) {
            return $this->returnErrorData('ไม่พบรายการที่ระบุ', 404);
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $Item);
    }

    // =========== store ===========
    public function store(Request $request)
    {
        $loginBy = $request->login_by;

        // validate แบบ snake_case ที่จำเป็น
        if (!isset($request->items_supplied)) {
            return $this->returnErrorData('กรุณาระบุ items_supplied', 404);
        }
        if (!isset($request->company_name)) {
            return $this->returnErrorData('กรุณาระบุ company_name', 404);
        }
        if (!isset($request->total_score)) {
            return $this->returnErrorData('กรุณาระบุ total_score', 404);
        }
        if (!isset($request->recommendation)) {
            return $this->returnErrorData('กรุณาระบุ recommendation', 404);
        }

        // แปลงวันที่ให้รองรับเวลา และบันทึกเป็น datetime (POST: assessed_by_date ใช้ created_at หลัง save)
        $approved_by_date     = $request->approved_by_date;
        $acknowledged_by_date = $request->acknowledged_by_date;

        $approved_by_date = $this->normalizeDateTimeInput($approved_by_date);
        $acknowledged_by_date = $this->normalizeDateTimeInput($acknowledged_by_date);

        DB::beginTransaction();

        try {

            $Item = new SupplierAssessments();
            // Assessment Details
            $Item->items_supplied = $request->items_supplied ?? null;
            $Item->company_name   = $request->company_name ?? null;

            // Information used for Assessment (checkbox)
            $Item->info_company_profile            = !empty($request->info_company_profile) ? 1 : 0;
            $Item->info_project_reference          = !empty($request->info_project_reference) ? 1 : 0;
            $Item->info_site_visit                 = !empty($request->info_site_visit) ? 1 : 0;
            $Item->info_previous_assessment_record = !empty($request->info_previous_assessment_record) ? 1 : 0;
            $Item->info_previous_evaluation_record = !empty($request->info_previous_evaluation_record) ? 1 : 0;
            $Item->info_iso_certificates           = !empty($request->info_iso_certificates) ? 1 : 0;

            // Assessment Areas score
            $Item->experience_score         = $request->experience_score ?? 0;
            $Item->staff_score              = $request->staff_score ?? 0;
            $Item->product_compliance_score = $request->product_compliance_score ?? 0;
            $Item->total_score              = $request->total_score ?? 0;

            // References
            $Item->reference_a_name    = $request->reference_a_name ?? null;
            $Item->reference_a_opinion = $request->reference_a_opinion ?? null;
            $Item->reference_b_name    = $request->reference_b_name ?? null;
            $Item->reference_b_opinion = $request->reference_b_opinion ?? null;

            // Recommendation
            $Item->recommendation        = $request->recommendation ?? null;
            $Item->recommendation_reason = $request->recommendation_reason ?? null;

            // Assessed & Approval workflow (POST: assessed_by_date = created_at หลัง save)
            $Item->assessed_by  = $request->assessed_by ?? null;

            $Item->approved_to_supplier_list = !empty($request->approved_to_supplier_list) ? 1 : 0;
            $Item->remark                    = $request->remark ?? null;

            $Item->approved_by   = $request->approved_by ?? null;
            $Item->approved_by_date = $approved_by_date;

            $Item->acknowledged_by   = $request->acknowledged_by ?? null;
            $Item->acknowledged_by_date = $acknowledged_by_date;

            $attachments = $request->input('attachments');
            $normalizedAttachments = $this->normalizeAttachments($attachments);
            $Item->attachments = $this->encodeAttachments($normalizedAttachments);

            $Item->create_by = $loginBy->employee_code ?? $loginBy->id ?? 'admin';

            $Item->save();

            $Item->assessed_by_date = $Item->created_at;
            $Item->timestamps = false;
            $Item->save();
            $Item->timestamps = true;

            $Item->attachments = $normalizedAttachments;

            $this->logDocumentCreateAudit($request, $Item);

            DB::commit();
            return $this->returnSuccess('บันทึกข้อมูลสำเร็จ', $Item);

        } catch (\Throwable $e) {

            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }

    // =========== update ===========
    public function update(Request $request, $id)
    {
        $loginBy = $request->login_by;

        // validate เหมือน store
        if (!isset($request->items_supplied)) {
            return $this->returnErrorData('กรุณาระบุ items_supplied', 404);
        }
        if (!isset($request->company_name)) {
            return $this->returnErrorData('กรุณาระบุ company_name', 404);
        }
        if (!isset($request->total_score)) {
            return $this->returnErrorData('กรุณาระบุ total_score', 404);
        }
        if (!isset($request->recommendation)) {
            return $this->returnErrorData('กรุณาระบุ recommendation', 404);
        }

        // แปลงวันที่ให้รองรับเวลา และบันทึกเป็น datetime
        $assessed_by_date     = $request->assessed_by_date;
        $approved_by_date     = $request->approved_by_date;
        $acknowledged_by_date = $request->acknowledged_by_date;

        $assessed_by_date = $this->normalizeDateTimeInput($assessed_by_date);
        $approved_by_date = $this->normalizeDateTimeInput($approved_by_date);
        $acknowledged_by_date = $this->normalizeDateTimeInput($acknowledged_by_date);

        DB::beginTransaction();

        try {

            $Item = SupplierAssessments::find($id);
            if (!$Item) {
                return $this->returnErrorData('ไม่พบข้อมูลที่ต้องการแก้ไข', 404);
            }

            // Assessment Details
            $Item->items_supplied = $request->items_supplied ?? null;
            $Item->company_name   = $request->company_name ?? null;

            // Information used for Assessment (checkbox)
            $Item->info_company_profile            = !empty($request->info_company_profile) ? 1 : 0;
            $Item->info_project_reference          = !empty($request->info_project_reference) ? 1 : 0;
            $Item->info_site_visit                 = !empty($request->info_site_visit) ? 1 : 0;
            $Item->info_previous_assessment_record = !empty($request->info_previous_assessment_record) ? 1 : 0;
            $Item->info_previous_evaluation_record = !empty($request->info_previous_evaluation_record) ? 1 : 0;
            $Item->info_iso_certificates           = !empty($request->info_iso_certificates) ? 1 : 0;

            // Assessment Areas score
            $Item->experience_score         = $request->experience_score ?? 0;
            $Item->staff_score              = $request->staff_score ?? 0;
            $Item->product_compliance_score = $request->product_compliance_score ?? 0;
            $Item->total_score              = $request->total_score ?? 0;

            // References
            $Item->reference_a_name    = $request->reference_a_name ?? null;
            $Item->reference_a_opinion = $request->reference_a_opinion ?? null;
            $Item->reference_b_name    = $request->reference_b_name ?? null;
            $Item->reference_b_opinion = $request->reference_b_opinion ?? null;

            // Recommendation
            $Item->recommendation        = $request->recommendation ?? null;
            $Item->recommendation_reason = $request->recommendation_reason ?? null;

            // Assessed & Approval workflow
            $Item->assessed_by  = $request->assessed_by ?? null;
            $Item->assessed_by_date = $assessed_by_date;

            $Item->approved_to_supplier_list = !empty($request->approved_to_supplier_list) ? 1 : 0;
            $Item->remark                    = $request->remark ?? null;

            $Item->approved_by   = $request->approved_by ?? null;
            $Item->approved_by_date = $approved_by_date;

            $Item->acknowledged_by   = $request->acknowledged_by ?? null;
            $Item->acknowledged_by_date = $acknowledged_by_date;

            if ($request->has('attachments')) {
                $attachments = $request->input('attachments');
                $normalizedAttachments = $this->normalizeAttachments($attachments);
                $Item->attachments = $this->encodeAttachments($normalizedAttachments);
            }

            $Item->update_by = $loginBy->employee_code ?? $loginBy->id ?? 'admin';

            $Item->save();
            if (isset($normalizedAttachments)) {
                $Item->attachments = $normalizedAttachments;
            }

            DB::commit();
            return $this->returnUpdate('อัปเดตข้อมูลสำเร็จ', $Item);

        } catch (\Throwable $e) {

            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด ' . $e->getMessage(), 500);
        }
    }

    // =========== destroy ===========
    public function destroy($id, Request $request)
    {
        $loginBy = $request->login_by;

        if (!isset($id)) {
            return $this->returnErrorData('ไม่พบข้อมูล id', 404);
        }

        DB::beginTransaction();

        try {

            $Item = SupplierAssessments::find($id);
            if (!$Item) {
                return $this->returnErrorData('ไม่พบข้อมูลในระบบ', 404);
            }

            $Item->delete();

            // log
            $userId      = $loginBy->employee_code ?? $loginBy->id ?? 'admin';
            $type        = 'ลบ Supplier Assessment';
            $description = 'ผู้ใช้งาน ' . $userId . ' ได้ทำการ ' . $type . ' #' . $Item->id;
            $this->Log($userId, $description, $type);

            DB::commit();
            return $this->returnSuccess('ลบข้อมูลสำเร็จ', []);

        } catch (\Throwable $e) {

            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ' . $e->getMessage(), 500);
        }
    }
}
