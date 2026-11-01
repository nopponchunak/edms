<?php
namespace App\Http\Controllers;

use App\Models\SupplierType;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SupplierTypeController extends Controller
{
    private array $defaultSupplierTypes = [
        ['code' => 'INSTRUMENTS_CALIBRATION', 'name' => 'Instruments and Calibration Services'],
        ['code' => 'SOFTWARE', 'name' => 'Software'],
        ['code' => 'OFFICE_EQUIPMENT_HARDWARE_ACCESSORIES', 'name' => 'Office Equipment, Hardware and Accessories'],
        ['code' => 'ADVISORS', 'name' => 'Advisors'],
        ['code' => 'LAWYER', 'name' => 'Lawyer'],
        ['code' => 'AUDITORS', 'name' => 'Auditors'],
        ['code' => 'INSTITUTE_MEMBERSHIPS', 'name' => 'Institute Memberships'],
        ['code' => 'CAR_RENTAL_MAINTENANCES', 'name' => 'Car, Car Rental and Car Maintenances'],
        ['code' => 'MEMBERSHIPS', 'name' => 'Memberships'],
        ['code' => 'TRAVELLING', 'name' => 'Travelling'],
        ['code' => 'INSURANCES', 'name' => 'Insurances'],
        ['code' => 'IT_INTERNET_SYSTEMS', 'name' => 'IT and Internet Systems'],
        ['code' => 'TRAINING', 'name' => 'Training'],
        ['code' => 'EVENT_ORGANIZING_ENTERTAINMENT_AGENCIES', 'name' => 'Event Organizing and Entertainment Agencies'],
        ['code' => 'OTHER_PRODUCTS_SERVICES', 'name' => 'Other Products and Services'],
    ];

    public function getPage(Request $request)
    {
        $length = $request->length ?? 10;
        $order  = $request->order;
        $search = $request->search;
        $start  = $request->start ?? 0;
        $page   = $start / $length + 1;
        $col    = [
            'id',
            'code',
            'name',
            'detail',
            'is_active',
            'created_at',
            'updated_at',
        ];

        $orderby = [
            'id',
            'code',
            'name',
            'detail',
            'is_active',
            'created_at',
            'updated_at',
        ];

        $query = SupplierType::select($col);

        if (! empty($order) && ($orderby[$order[0]['column']] ?? false)) {
            $query->orderBy($orderby[$order[0]['column']], $order[0]['dir']);
        } else {
            $query->orderBy('code');
        }

        if (! empty($search['value'])) {
            $query->where(function ($q) use ($search, $col) {
                foreach ($col as $c) {
                    $q->orWhere($c, 'like', '%' . $search['value'] . '%');
                }
            });
        }

        if ($request->filled('is_active') || $request->is_active === 0) {
            $query->where('is_active', $request->is_active);
        }

        $data = $query->paginate($length, ['*'], 'page', $page);

        if ($data->isNotEmpty()) {
            $No = (($page - 1) * $length);
            for ($i = 0; $i < count($data); $i++) {
                $No = $No + 1;
                $data[$i]->No = $No;
            }
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $data);
    }

    public function store(Request $request)
    {
        $request->validate([
            'code' => 'required',
            'name' => 'required|string',
        ], [
            'code.required' => 'The code field is required.',
            'name.required' => 'The name field is required.',
            'name.string'   => 'The name must be a string.',
        ]);

        $inactiveSupplierType = SupplierType::withTrashed()
            ->where('code', $request->code)
            ->where('is_active', 0)
            ->first();

        if ($inactiveSupplierType) {
            if ($inactiveSupplierType->trashed()) {
                $inactiveSupplierType->restore();
            }

            $inactiveSupplierType->update([
                'name'      => $request->name,
                'detail'    => $request->detail,
                'is_active' => 1,
            ]);

            return response()->json([
                'status'  => true,
                'message' => 'created successfully',
                'data'    => $inactiveSupplierType->fresh(),
            ]);
        }

        $request->validate([
            'code' => [Rule::unique('supplier_types', 'code')],
        ], [
            'code.unique' => 'The code has already been taken.',
        ]);

        $data = SupplierType::create([
            'code'      => $request->code,
            'name'      => $request->name,
            'detail'    => $request->detail,
            'is_active' => 1,
        ]);

        return response()->json([
            'status'  => true,
            'message' => 'created successfully',
            'data'    => $data,
        ]);
    }

    public function seedDefaults()
    {
        $created = 0;
        $restored = 0;
        $existing = 0;

        foreach ($this->defaultSupplierTypes as $default) {
            $supplierType = SupplierType::withTrashed()
                ->where('code', $default['code'])
                ->first();

            if (! $supplierType) {
                SupplierType::create([
                    'code'      => $default['code'],
                    'name'      => $default['name'],
                    'detail'    => null,
                    'is_active' => 1,
                ]);
                $created++;
                continue;
            }

            if ($supplierType->trashed() || (int) $supplierType->is_active !== 1) {
                if ($supplierType->trashed()) {
                    $supplierType->restore();
                }

                $supplierType->update([
                    'name'      => $default['name'],
                    'detail'    => $supplierType->detail,
                    'is_active' => 1,
                ]);
                $restored++;
                continue;
            }

            $existing++;
        }

        return response()->json([
            'status'  => true,
            'message' => 'Default supplier types added successfully',
            'data'    => [
                'created'  => $created,
                'restored' => $restored,
                'existing' => $existing,
                'total'    => count($this->defaultSupplierTypes),
            ],
        ]);
    }

    public function show($id)
    {
        $data = SupplierType::where('id', $id)
            ->where('is_active', 1)
            ->firstOrFail();

        return response()->json([
            'status'  => true,
            'message' => 'success',
            'data'    => $data,
        ]);
    }

    public function update(Request $request, $id)
    {
        $data = SupplierType::findOrFail($id);

        $request->validate([
            'code' => 'required|unique:supplier_types,code,' . $id,
            'name' => 'required|string',
        ]);

        $data->update($request->only([
            'code',
            'name',
            'detail',
            'is_active',
        ]));

        return response()->json([
            'status'  => true,
            'message' => 'updated successfully',
            'data'    => $data,
        ]);
    }

    public function destroy($id)
    {
        try {
            $data = SupplierType::where('id', $id)->where('is_active', 1)->first();

            if (! $data) {
                return response()->json([
                    'status'  => false,
                    'message' => 'Record not found',
                    'data'    => null,
                ], 404);
            }

            $data->update(['is_active' => 0]);
            $data->delete();

            return response()->json([
                'status'  => true,
                'message' => 'deleted successfully',
                'data'    => null,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'status'  => false,
                'message' => 'Internal Server Error',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    public function getAll()
    {
        $data = SupplierType::where('is_active', 1)
            ->orderBy('code')
            ->get();

        return response()->json([
            'status'  => true,
            'message' => 'success',
            'data'    => $data,
        ]);
    }
}
