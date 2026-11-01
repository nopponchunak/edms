<?php
namespace App\Http\Controllers;

use App\Models\ProjectType;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProjectTypeController extends Controller
{
    // =========== getPage (DataTables style) ===========
    public function getPage(Request $request)
    {
        $columns = $request->columns;
        $length  = $request->length ?? 10;
        $order   = $request->order;
        $search  = $request->search;
        $start   = $request->start ?? 0;
        $page    = $start / $length + 1;
        $col     = [
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

        $D = ProjectType::select($col);

        // order by
        if (! empty($order) && ($orderby[$order[0]['column']] ?? false)) {
            $D->orderBy($orderby[$order[0]['column']], $order[0]['dir']);
        } else {
            $D->orderBy('code');
        }

        // search all columns
        if (! empty($search['value'])) {
            $D->where(function ($query) use ($search, $col) {
                foreach ($col as $c) {
                    $query->orWhere($c, 'like', '%' . $search['value'] . '%');
                }
            });
        }

        if ($request->filled('is_active') || $request->is_active === 0) {
            $D->where('is_active', $request->is_active);
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

    // POST /project_type
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

        $inactiveProjectType = ProjectType::withTrashed()
            ->where('code', $request->code)
            ->where('is_active', 0)
            ->first();

        if ($inactiveProjectType) {
            if ($inactiveProjectType->trashed()) {
                $inactiveProjectType->restore();
            }

            $inactiveProjectType->update([
                'name'      => $request->name,
                'detail'    => $request->detail,
                'is_active' => 1,
            ]);

            return response()->json([
                'status'  => true,
                'message' => 'created successfully',
                'data'    => $inactiveProjectType->fresh(),
            ]);
        }

        $request->validate([
            'code' => [Rule::unique('project_types', 'code')],
        ], [
            'code.unique'   => 'The code has already been taken.',
        ]);

        $data = ProjectType::create([
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

    // GET /project_type/{id}
    public function show($id)
    {
        $data = ProjectType::where('id', $id)
            ->where('is_active', 1)
            ->firstOrFail();

        return response()->json([
            'status'  => true,
            'message' => 'success',
            'data'    => $data,
        ]);
    }

    // PUT /project_type/{id}
    public function update(Request $request, $id)
    {
        $data = ProjectType::findOrFail($id);

        $request->validate([
            'code' => 'required|unique:project_types,code,' . $id,
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

    // DELETE /project_type/{id} (soft delete)
    public function destroy($id)
    {
        try {

            $data = ProjectType::where('id', $id)->where('is_active', 1)->first();

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

    // GET /get_project_type (dropdown)
    public function getAll()
    {
        $data = ProjectType::where('is_active', 1)
            ->orderBy('code')
            ->get();

        return response()->json([
            'status'  => true,
            'message' => 'success',
            'data'    => $data,
        ]);
    }
}
