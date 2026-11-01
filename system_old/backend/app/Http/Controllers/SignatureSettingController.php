<?php

namespace App\Http\Controllers;

use App\Models\SignatureSetting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class SignatureSettingController extends Controller
{
    public function getPage(Request $request)
    {
        $length = (int) ($request->length ?? 10);
        $length = $length > 0 ? $length : 10;
        $start = (int) ($request->start ?? 0);
        $page = ($start / $length) + 1;
        $order = $request->order ?? [];
        $search = $request->search ?? [];

        $orderby = [
            'signature_settings.id',
            'signature_settings.employee_code',
            'employees.firstname',
            'employees.department_name',
            'signature_settings.is_active',
            'signature_settings.updated_at',
        ];

        $query = $this->baseQuery();

        if ($request->filled('is_active') || $request->is_active === 0 || $request->is_active === '0') {
            $query->where('signature_settings.is_active', (int) $request->is_active);
        }

        if (!empty($search['value'])) {
            $keyword = $search['value'];
            $query->where(function ($q) use ($keyword) {
                $q->orWhere('signature_settings.employee_code', 'like', '%' . $keyword . '%')
                    ->orWhere('employees.initial', 'like', '%' . $keyword . '%')
                    ->orWhere('employees.firstname', 'like', '%' . $keyword . '%')
                    ->orWhere('employees.lastname', 'like', '%' . $keyword . '%')
                    ->orWhere('employees.department_name', 'like', '%' . $keyword . '%')
                    ->orWhere('employees.title_name', 'like', '%' . $keyword . '%');
            });
        }

        if (!empty($order) && isset($order[0]['column']) && ($orderby[$order[0]['column']] ?? false)) {
            $query->orderBy($orderby[$order[0]['column']], $order[0]['dir'] ?? 'asc');
        } else {
            $query->orderBy('signature_settings.updated_at', 'desc')
                ->orderBy('signature_settings.id', 'desc');
        }

        $result = $query->paginate($length, ['*'], 'page', $page);

        if ($result->isNotEmpty()) {
            $no = (($page - 1) * $length);
            for ($i = 0; $i < count($result); $i++) {
                $no++;
                $result[$i]->No = $no;
            }
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $result);
    }

    public function getList(Request $request)
    {
        $query = $this->baseQuery();

        if ($request->filled('active')) {
            $query->where('signature_settings.is_active', (int) $request->active);
        }

        $codes = $this->normalizeCodes($request->input('codes', []));
        if (!empty($codes)) {
            $query->whereIn('signature_settings.employee_code', $codes);
        }

        $items = $query->orderBy('employees.firstname')
            ->orderBy('employees.lastname')
            ->orderBy('signature_settings.employee_code')
            ->get();

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $items);
    }

    public function show($id)
    {
        $item = SignatureSetting::with('employee')->find($id);

        if (!$item) {
            return $this->returnErrorData('ไม่พบรายการที่ระบุ', 404);
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $item);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'employee_code' => [
                'required',
                'string',
                'exists:employees,code',
            ],
            'is_active' => ['nullable', Rule::in([0, 1, '0', '1'])],
        ]);

        $existing = SignatureSetting::withTrashed()
            ->where('employee_code', $validated['employee_code'])
            ->first();

        if ($existing && ($existing->trashed() || (int) $existing->is_active === 0)) {
            if ($existing->trashed()) {
                $existing->restore();
            }

            $existing->update([
                'is_active' => isset($validated['is_active']) ? (int) $validated['is_active'] : 1,
                'update_by' => $this->actorCode($request),
            ]);

            return $this->returnSuccess('บันทึกข้อมูลสำเร็จ', $existing->fresh()->load('employee'));
        }

        $request->validate([
            'employee_code' => [Rule::unique('signature_settings', 'employee_code')],
        ]);

        $item = SignatureSetting::create([
            'employee_code' => $validated['employee_code'],
            'is_active' => isset($validated['is_active']) ? (int) $validated['is_active'] : 1,
            'create_by' => $this->actorCode($request),
        ]);

        return $this->returnSuccess('บันทึกข้อมูลสำเร็จ', $item->load('employee'));
    }

    public function update(Request $request, $id)
    {
        $item = SignatureSetting::find($id);
        if (!$item) {
            return $this->returnErrorData('ไม่พบข้อมูลที่ต้องการแก้ไข', 404);
        }

        $validated = $request->validate([
            'employee_code' => [
                'required',
                'string',
                'exists:employees,code',
                Rule::unique('signature_settings', 'employee_code')->ignore($item->id),
            ],
            'is_active' => ['required', Rule::in([0, 1, '0', '1'])],
        ]);

        $item->update([
            'employee_code' => $validated['employee_code'],
            'is_active' => (int) $validated['is_active'],
            'update_by' => $this->actorCode($request),
        ]);

        return $this->returnUpdateReturnData('อัปเดตข้อมูลสำเร็จ', $item->load('employee'));
    }

    public function destroy($id, Request $request)
    {
        $item = SignatureSetting::find($id);
        if (!$item) {
            return $this->returnErrorData('ไม่พบข้อมูลในระบบ', 404);
        }

        $item->update([
            'is_active' => 0,
            'update_by' => $this->actorCode($request),
        ]);
        $item->delete();

        return $this->returnSuccess('ลบข้อมูลสำเร็จ', []);
    }

    private function baseQuery()
    {
        return DB::table('signature_settings')
            ->leftJoin('employees', 'employees.code', '=', 'signature_settings.employee_code')
            ->whereNull('signature_settings.deleted_at')
            ->select([
                'signature_settings.id',
                'signature_settings.employee_code',
                'signature_settings.is_active',
                'signature_settings.create_by',
                'signature_settings.update_by',
                'signature_settings.created_at',
                'signature_settings.updated_at',
                'employees.id as employee_id',
                'employees.initial',
                'employees.firstname',
                'employees.lastname',
                'employees.email',
                'employees.level_name',
                'employees.title_name',
                'employees.department_name',
                'employees.employee_type_name',
                'employees.active as employee_active',
            ]);
    }

    private function normalizeCodes($raw)
    {
        if (is_string($raw)) {
            $raw = explode(',', $raw);
        }

        if (!is_array($raw)) {
            return [];
        }

        return array_values(array_unique(array_filter(array_map(function ($code) {
            return trim((string) $code);
        }, $raw), function ($code) {
            return $code !== '';
        })));
    }

    private function actorCode(Request $request)
    {
        $loginBy = $request->login_by ?? null;

        if (is_object($loginBy)) {
            return $loginBy->employee_code ?? $loginBy->id ?? null;
        }

        if (is_array($loginBy)) {
            return $loginBy['employee_code'] ?? $loginBy['id'] ?? null;
        }

        return null;
    }
}
