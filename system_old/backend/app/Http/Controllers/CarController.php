<?php
namespace App\Http\Controllers;

use App\Models\Car;
use App\Services\PurchaseDocumentNumberService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CarController extends Controller
{
    private const REF_SEQUENCE_PAD_LENGTH = 3;

    // ------------------------------------------------------------
    // GET: list (ไม่แบ่งหน้า)
    // ------------------------------------------------------------
    public function getList(Request $request)
    {
        try {
            $q = Car::query()->whereNull('deleted_at');

            // filter simple
            if (isset($request->department) && $request->department !== '') {
                $q->where('department', $request->department);
            }
            if (isset($request->severity) && $request->severity !== '') {
                $q->where('severity', $request->severity);
            }
            if (isset($request->status) && $request->status !== '') {
                $q->where('status', $request->status);
            }

            // date range
            if (isset($request->date_from) && $request->date_from !== '') {
                $q->whereDate('date', '>=', $request->date_from);
            }
            if (isset($request->date_to) && $request->date_to !== '') {
                $q->whereDate('date', '<=', $request->date_to);
            }

            // search
            if (isset($request->search) && $request->search !== '') {
                $s = trim($request->search);
                $q->where(function ($w) use ($s) {
                    $w->where('department', 'like', "%{$s}%")
                        ->orWhere('project_name', 'like', "%{$s}%")
                        ->orWhere('ref_no', 'like', "%{$s}%")
                        ->orWhere('project_no', 'like', "%{$s}%")
                        ->orWhere('to', 'like', "%{$s}%")
                        ->orWhere('car_issued_by', 'like', "%{$s}%")
                        ->orWhere('severity', 'like', "%{$s}%");
                });
            }

            $items = $q->orderBy('id', 'desc')->get();

            // เติม No
            $no = 1;
            foreach ($items as $it) {
                $it->no = $no++;
            }

            return $this->returnSuccess('success', $items);
        } catch (\Exception $e) {
            return $this->returnErrorData($e->getMessage(), 500);
        }
    }

    // ------------------------------------------------------------
    // GET: page (DataTables)
    // ------------------------------------------------------------
    public function getPage(Request $request)
    {
        try {
            $draw   = (int)($request->draw ?? 1);
            $start  = (int)($request->start ?? 0);
            $length = (int)($request->length ?? 10);

            $q = Car::query()->whereNull('deleted_at');

            // filters
            if (isset($request->department) && $request->department !== '') {
                $q->where('department', $request->department);
            }
            if (isset($request->severity) && $request->severity !== '') {
                $q->where('severity', $request->severity);
            }
            if (isset($request->status) && $request->status !== '') {
                $q->where('status', $request->status);
            }

            // date range
            if (isset($request->date_from) && $request->date_from !== '') {
                $q->whereDate('date', '>=', $request->date_from);
            }
            if (isset($request->date_to) && $request->date_to !== '') {
                $q->whereDate('date', '<=', $request->date_to);
            }

            // search (DataTables)
            $searchValue = $request->input('search.value');
            if ($searchValue !== null && trim($searchValue) !== '') {
                $s = trim($searchValue);
                $q->where(function ($w) use ($s) {
                    $w->where('department', 'like', "%{$s}%")
                        ->orWhere('project_name', 'like', "%{$s}%")
                        ->orWhere('ref_no', 'like', "%{$s}%")
                        ->orWhere('project_no', 'like', "%{$s}%")
                        ->orWhere('to', 'like', "%{$s}%")
                        ->orWhere('car_issued_by', 'like', "%{$s}%")
                        ->orWhere('severity', 'like', "%{$s}%");
                });
            }

            $recordsTotal = Car::query()->whereNull('deleted_at')->count();
            $recordsFiltered = (clone $q)->count();

            // orderBy mapping
            $orderColIndex = $request->input('order.0.column');
            $orderDir      = $request->input('order.0.dir', 'desc');

            $columnsMap = [
                0 => 'ref_no',
                1 => 'project_name',
                2 => 'to',
                3 => 'department',
                4 => 'severity',
                5 => 'created_at',
                6 => 'updated_at',
                7 => 'approved_by_status',
            ];

            if ($orderColIndex !== null && isset($columnsMap[(int)$orderColIndex])) {
                $q->orderBy($columnsMap[(int)$orderColIndex], $orderDir);
            } else {
                $q->orderBy('id', 'desc');
            }

            $items = $q->skip($start)->take($length)->get();

            // เติม No ตามหน้า
            $no = $start + 1;
            foreach ($items as $it) {
                $it->no = $no++;
            }

            return response()->json([
                'draw' => $draw,
                'recordsTotal' => $recordsTotal,
                'recordsFiltered' => $recordsFiltered,
                'data' => $items,
            ]);
        } catch (\Exception $e) {
            return $this->returnErrorData($e->getMessage(), 500);
        }
    }

    // ------------------------------------------------------------
    // GET: show
    // ------------------------------------------------------------
    public function show($id)
    {
        try {
            $item = Car::query()
                ->where('id', $id)
                ->whereNull('deleted_at')
                ->first();

            if (!$item) {
                return $this->returnErrorData('ไม่พบข้อมูล', 404);
            }

            return $this->returnSuccess('success', $item);
        } catch (\Exception $e) {
            return $this->returnErrorData($e->getMessage(), 500);
        }
    }

    // ------------------------------------------------------------
    // POST: store
    // ------------------------------------------------------------
    public function store(Request $request)
    {
        DB::beginTransaction();
        try {
            // validation แบบสไตล์คุณ (เช็ค isset เฉพาะที่จำเป็นจริง ๆ)
            // *ตอนนี้ไม่ได้ระบุ required field มา จึงไม่บังคับ*
            // ถ้าต้องการ required เพิ่ม บอกผมได้ เดี๋ยวใส่ให้ตรง flow

            $item = new Car();

            $this->fillCar($item, $request);
            $item->ref_no = $this->resolveCarReferenceNumber($request, $item);

            $loginBy = $request->login_by;
            $mtlCode = $loginBy->employee_code ?? $loginBy->id ?? 'admin';

            $item->create_by = $mtlCode;
            $item->update_by = $mtlCode;

            $item->save();

            $this->logDocumentCreateAudit($request, $item);

            DB::commit();
            return $this->returnSuccess('บันทึกสำเร็จ', $item);
        } catch (\Exception $e) {
            DB::rollBack();
            return $this->returnErrorData($e->getMessage(), 500);
        }
    }

    // ------------------------------------------------------------
    // PUT: update
    // ------------------------------------------------------------
    public function update(Request $request, $id)
    {
        DB::beginTransaction();
        try {
            $item = Car::query()
                ->where('id', $id)
                ->whereNull('deleted_at')
                ->first();

            if (!$item) {
                return $this->returnErrorData('ไม่พบข้อมูล', 404);
            }

            $this->fillCar($item, $request);
            if (trim((string) ($item->ref_no ?? '')) === '') {
                $item->ref_no = $this->resolveCarReferenceNumber($request, $item);
            }

            $loginBy = $request->login_by;
            $mtlCode = $loginBy->employee_code ?? $loginBy->id ?? 'admin';

            $item->update_by = $mtlCode;

            $item->save();

            DB::commit();
            return $this->returnUpdate('แก้ไขสำเร็จ', $item);
        } catch (\Exception $e) {
            DB::rollBack();
            return $this->returnErrorData($e->getMessage(), 500);
        }
    }

    // ------------------------------------------------------------
    // DELETE: destroy (soft delete)
    // ------------------------------------------------------------
    public function destroy(Request $request, $id)
    {
        DB::beginTransaction();
        try {
            $item = Car::query()
                ->where('id', $id)
                ->whereNull('deleted_at')
                ->first();

            if (!$item) {
                return $this->returnErrorData('ไม่พบข้อมูล', 404);
            }

            // log สไตล์คุณ (ถ้าโปรเจกต์คุณมี Log helper)
            // $this->Log('cars', 'delete', $id, $request->login_by->id ?? null);

            $item->deleted_at = now();

            $loginBy = $request->login_by;
            $mtlCode = $loginBy->employee_code ?? $loginBy->id ?? 'admin';

            $item->update_by = $mtlCode;
            $item->save();

            DB::commit();
            return $this->returnSuccess('ลบสำเร็จ', $item);
        } catch (\Exception $e) {
            DB::rollBack();
            return $this->returnErrorData($e->getMessage(), 500);
        }
    }

    public function getNextNumber(Request $request): JsonResponse
    {
        $year = $this->documentNumberService()->yearFromDate(
            $request->input('year', $request->input('date'))
        );
        $nextNumber = $this->getNextCarReferenceNumber(false, $year);

        return response()->json([
            'success' => true,
            'data' => [
                'next_ref_no' => $nextNumber,
                'next_number' => $nextNumber,
                'year' => $year,
            ],
        ]);
    }

    private function documentNumberService(): PurchaseDocumentNumberService
    {
        return app(PurchaseDocumentNumberService::class);
    }

    private function carReferenceNumberYear(Request $request, ?Car $item = null): int
    {
        $date = $request->input('date');

        if ($date === null || $date === '') {
            $date = $item->date ?? $item->created_at ?? null;
        }

        return $this->documentNumberService()->yearFromDate($date);
    }

    private function getNextCarReferenceNumber(bool $lock = false, ?int $year = null): string
    {
        $year = $year ?? $this->documentNumberService()->yearFromDate(null);

        $query = Car::withTrashed()
            ->whereNotNull('ref_no')
            ->where('ref_no', 'like', '%/' . $year);

        if ($lock) {
            $query->lockForUpdate();
        }

        $maxSequence = 0;
        foreach ($query->pluck('ref_no') as $refNo) {
            $sequence = $this->sequenceFromCarReferenceNumber($refNo, $year);
            if ($sequence !== null) {
                $maxSequence = max($maxSequence, $sequence);
            }
        }

        return $this->formatCarReferenceNumber($maxSequence + 1, $year);
    }

    private function resolveCarReferenceNumber(Request $request, ?Car $item = null): string
    {
        $year = $this->carReferenceNumberYear($request, $item);
        $requestRefNo = trim((string) $request->input('ref_no', ''));

        if (!$request->exists('ref_no') && $item && $item->id && trim((string) ($item->ref_no ?? '')) !== '') {
            return trim((string) $item->ref_no);
        }

        if ($requestRefNo !== '' && $this->isFormattedCarReferenceNumber($requestRefNo, $year)) {
            $duplicateQuery = Car::withTrashed()->where('ref_no', $requestRefNo);
            if ($item && $item->id) {
                $duplicateQuery->where('id', '!=', $item->id);
            }

            if (!$duplicateQuery->lockForUpdate()->exists()) {
                return $requestRefNo;
            }
        }

        return $this->getNextCarReferenceNumber(true, $year);
    }

    private function formatCarReferenceNumber(int $sequence, int $year): string
    {
        return str_pad((string) $sequence, self::REF_SEQUENCE_PAD_LENGTH, '0', STR_PAD_LEFT) . '/' . $year;
    }

    private function isFormattedCarReferenceNumber($value, ?int $year = null): bool
    {
        $value = trim((string) ($value ?? ''));

        if ($year !== null) {
            return (bool) preg_match('/^\d{' . self::REF_SEQUENCE_PAD_LENGTH . ',}\/' . preg_quote((string) $year, '/') . '$/', $value);
        }

        return (bool) preg_match('/^\d{' . self::REF_SEQUENCE_PAD_LENGTH . ',}\/\d{4}$/', $value);
    }

    private function sequenceFromCarReferenceNumber($value, int $year): ?int
    {
        $value = trim((string) ($value ?? ''));

        if (!preg_match('/^(\d{' . self::REF_SEQUENCE_PAD_LENGTH . ',})\/' . preg_quote((string) $year, '/') . '$/', $value, $matches)) {
            return null;
        }

        return (int) $matches[1];
    }

    // ------------------------------------------------------------
    // Helper: map request -> model (รองรับ field ใหม่ทั้งหมด)
    // ------------------------------------------------------------
    private function fillCar(Car $item, Request $request): void
    {
        if (isset($request->department)) $item->department = $request->department;
        if (isset($request->project_name)) $item->project_name = $request->project_name;
        if (isset($request->ref_no)) $item->ref_no = $request->ref_no;
        if (isset($request->project_no)) $item->project_no = $request->project_no;
        if (isset($request->to)) $item->to = $request->to;

        if (isset($request->date)) $item->date = $request->date;
        if (isset($request->car_issued_by)) $item->car_issued_by = $request->car_issued_by;

        // sources: ถ้าส่งมาเป็น array ให้ encode เก็บ text
        if (isset($request->sources)) {
            $item->sources = is_array($request->sources) ? json_encode($request->sources, JSON_UNESCAPED_UNICODE) : $request->sources;
        }

        if (isset($request->other_source_description)) $item->other_source_description = $request->other_source_description;
        if (isset($request->severity)) $item->severity = $request->severity;

        if (isset($request->non_conformity_types)) {
            $item->non_conformity_types = is_array($request->non_conformity_types)
                ? json_encode($request->non_conformity_types, JSON_UNESCAPED_UNICODE)
                : $request->non_conformity_types;
        }

        if (isset($request->non_conformity_description)) $item->non_conformity_description = $request->non_conformity_description;

        // CAR / IMR detail
        if (isset($request->cause_of_non_conformity)) $item->cause_of_non_conformity = $request->cause_of_non_conformity;
        if (isset($request->remedial_action)) $item->remedial_action = $request->remedial_action;
        if (isset($request->corrective_action)) $item->corrective_action = $request->corrective_action;
        if (isset($request->imr_comments)) $item->imr_comments = $request->imr_comments;

        // workflow
        if (isset($request->completed_by)) $item->completed_by = $request->completed_by;
        if (isset($request->completed_by_date)) $item->completed_by_date = $this->normalizeDateTimeInput($request->completed_by_date);
        if (isset($request->completed_by_status)) $item->completed_by_status = $request->completed_by_status;

        if (isset($request->acknowledged_by)) $item->acknowledged_by = $request->acknowledged_by;
        if (isset($request->acknowledged_by_date)) $item->acknowledged_by_date = $this->normalizeDateTimeInput($request->acknowledged_by_date);
        if (isset($request->acknowledged_by_status)) $item->acknowledged_by_status = $request->acknowledged_by_status;

        if (isset($request->verified_by)) $item->verified_by = $request->verified_by;
        if (isset($request->verified_by_date)) $item->verified_by_date = $this->normalizeDateTimeInput($request->verified_by_date);
        if (isset($request->verified_by_status)) $item->verified_by_status = $request->verified_by_status;
        if (isset($request->verified_by_date_2)) $item->verified_by_date_2 = $this->normalizeDateTimeInput($request->verified_by_date_2);
        if (isset($request->verified_by_status_2)) $item->verified_by_status_2 = $request->verified_by_status_2;

        if (isset($request->approved_by)) $item->approved_by = $request->approved_by;
        if (isset($request->approved_by_date)) $item->approved_by_date = $this->normalizeDateTimeInput($request->approved_by_date);
        if (isset($request->approved_by_status)) $item->approved_by_status = $request->approved_by_status;
        if (isset($request->approve_by_date_2)) $item->approve_by_date_2 = $this->normalizeDateTimeInput($request->approve_by_date_2);
        if (isset($request->approve_by_status_2)) $item->approve_by_status_2 = $request->approve_by_status_2;

        // flags (0/1)
        if (isset($request->response_time_check)) $item->response_time_check = (int)$request->response_time_check;
        if (isset($request->ra_ca_satisfactory)) $item->ra_ca_satisfactory = (int)$request->ra_ca_satisfactory;
        if (isset($request->further_action_required)) $item->further_action_required = (int)$request->further_action_required;

        $raSelected = $request->exists('ra_ca_satisfactory') && (int)$request->ra_ca_satisfactory === 1;
        $furtherSelected = $request->exists('further_action_required') && (int)$request->further_action_required === 1;

        if ($furtherSelected) {
            $item->ra_ca_satisfactory = 0;
        } elseif ($raSelected) {
            $item->further_action_required = 0;
        } elseif ((int)$item->ra_ca_satisfactory === 1 && (int)$item->further_action_required === 1) {
            $item->further_action_required = 0;
        }

        if ($request->exists('ra_ca_satisfactory_description')) {
            $description = trim((string)$request->ra_ca_satisfactory_description);
            $item->ra_ca_satisfactory_description = $description !== '' ? $description : null;
        }

        if ($request->exists('further_action_description')) {
            $description = trim((string)$request->further_action_description);
            $item->further_action_description = $description !== '' ? $description : null;
        }

        if ((int)$item->ra_ca_satisfactory === 0) {
            $item->ra_ca_satisfactory_description = null;
        }

        if ((int)$item->further_action_required === 0) {
            $item->further_action_description = null;
        }

        if ($furtherSelected && $request->input('action_type') === 'verified_by_status') {
            $item->completed_by_status = 'pending';
            $item->completed_by_date = null;
            $item->acknowledged_by_status = 'pending';
            $item->acknowledged_by_date = null;
            $item->verified_by_status = 'pending';
            $item->verified_by_date = null;
            $item->approve_by_status_2 = 'pending';
            $item->approve_by_date_2 = null;
        }

        // status ถ้ามีในตารางของคุณ (จากรูปมี status)
        if (isset($request->status)) $item->status = $request->status;
    }
}
