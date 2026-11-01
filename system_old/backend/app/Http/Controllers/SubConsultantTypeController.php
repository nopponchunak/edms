<?php
namespace App\Http\Controllers;

use App\Models\SubConsultantType;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SubConsultantTypeController extends Controller
{
    private array $defaultSubConsultantTypes = [
        ['code' => 'ARCHITECTURE', 'name' => 'Architecture'],
        ['code' => 'CIVIL_STRUCTURAL', 'name' => 'Civil and Structural Engineering'],
        ['code' => 'MECHANICAL_ELECTRICAL', 'name' => 'Mechanical and Electrical Engineering'],
        ['code' => 'QUANTITY_SURVEYING', 'name' => 'Quantity Surveying'],
        ['code' => 'FACADE', 'name' => 'Facade Consultant'],
        ['code' => 'GEOTECHNICAL', 'name' => 'Geotechnical Consultant'],
        ['code' => 'SURVEYING', 'name' => 'Surveying'],
        ['code' => 'ENVIRONMENTAL', 'name' => 'Environmental Consultant'],
        ['code' => 'TRAFFIC_TRANSPORTATION', 'name' => 'Traffic and Transportation'],
        ['code' => 'LIGHTING', 'name' => 'Lighting Consultant'],
        ['code' => 'ACOUSTIC', 'name' => 'Acoustic Consultant'],
        ['code' => 'FIRE_SAFETY', 'name' => 'Fire Safety Consultant'],
        ['code' => 'BIM', 'name' => 'BIM Consultant'],
        ['code' => 'OTHER_SERVICES', 'name' => 'Other Services'],
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

        $query = SubConsultantType::select($col);

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

        $inactiveSubConsultantType = SubConsultantType::withTrashed()
            ->where('code', $request->code)
            ->where('is_active', 0)
            ->first();

        if ($inactiveSubConsultantType) {
            if ($inactiveSubConsultantType->trashed()) {
                $inactiveSubConsultantType->restore();
            }

            $inactiveSubConsultantType->update([
                'name'      => $request->name,
                'detail'    => $request->detail,
                'is_active' => 1,
            ]);

            return response()->json([
                'status'  => true,
                'message' => 'created successfully',
                'data'    => $inactiveSubConsultantType->fresh(),
            ]);
        }

        $request->validate([
            'code' => [Rule::unique('sub_consultant_types', 'code')],
        ], [
            'code.unique' => 'The code has already been taken.',
        ]);

        $data = SubConsultantType::create([
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

        foreach ($this->defaultSubConsultantTypes as $default) {
            $subConsultantType = SubConsultantType::withTrashed()
                ->where('code', $default['code'])
                ->first();

            if (! $subConsultantType) {
                SubConsultantType::create([
                    'code'      => $default['code'],
                    'name'      => $default['name'],
                    'detail'    => null,
                    'is_active' => 1,
                ]);
                $created++;
                continue;
            }

            if ($subConsultantType->trashed() || (int) $subConsultantType->is_active !== 1) {
                if ($subConsultantType->trashed()) {
                    $subConsultantType->restore();
                }

                $subConsultantType->update([
                    'name'      => $default['name'],
                    'detail'    => $subConsultantType->detail,
                    'is_active' => 1,
                ]);
                $restored++;
                continue;
            }

            $existing++;
        }

        return response()->json([
            'status'  => true,
            'message' => 'Default sub-consultant types added successfully',
            'data'    => [
                'created'  => $created,
                'restored' => $restored,
                'existing' => $existing,
                'total'    => count($this->defaultSubConsultantTypes),
            ],
        ]);
    }

    public function show($id)
    {
        $data = SubConsultantType::where('id', $id)
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
        $data = SubConsultantType::findOrFail($id);

        $request->validate([
            'code' => 'required|unique:sub_consultant_types,code,' . $id,
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
            $data = SubConsultantType::where('id', $id)->where('is_active', 1)->first();

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
        $data = SubConsultantType::where('is_active', 1)
            ->orderBy('code')
            ->get();

        return response()->json([
            'status'  => true,
            'message' => 'success',
            'data'    => $data,
        ]);
    }
}
