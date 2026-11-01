<?php
namespace App\Http\Controllers;

use App\Models\ProjectDetail;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProjectDetailController extends Controller
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

        $col = [
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
            'created_at',
            'updated_at',
        ];

        $D = ProjectDetail::select($col);

        // order by
        if (! empty($order) && ($orderby[$order[0]['column']] ?? false)) {
            $D->orderBy($orderby[$order[0]['column']], $order[0]['dir']);
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

    // create a new project detail
    public function store(Request $request)
    {
        $request->validate([
            'code' => 'required',
            'name' => 'required|string',
        ]);

        $inactiveProjectDetail = ProjectDetail::withTrashed()
            ->where('code', $request->code)
            ->where('is_active', 0)
            ->first();

        if ($inactiveProjectDetail) {
            if ($inactiveProjectDetail->trashed()) {
                $inactiveProjectDetail->restore();
            }

            $inactiveProjectDetail->update([
                'name'      => $request->name,
                'detail'    => $request->detail,
                'is_active' => 1,
            ]);

            return response()->json([
                'status'  => true,
                'message' => 'created successfully',
                'data'    => $inactiveProjectDetail->fresh(),
            ]);
        }

        $request->validate([
            'code' => [Rule::unique('project_details', 'code')],
        ]);

        $data = ProjectDetail::create([
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

    // get a project detail by id
    public function show($id)
    {

        $data = ProjectDetail::where('id', $id)
            ->where('is_active', 1)
            ->firstOrFail();

        return response()->json([
            'status'  => true,
            'message' => 'success',
            'data'    => $data,
        ]);
    }

    // upate a project detail by id
    public function update($id, Request $request)
    {
        $data = ProjectDetail::findOrFail($id);

        $request->validate([
            'code' => 'required|unique:project_details,code,' . $id,
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

    // delete a project detail by id
    public function destroy($id)
    {
        try {

            $data = ProjectDetail::where('id', $id)->where('is_active', 1)->first();

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

    // get all project detail
    public function getAll()
    {
        $data = ProjectDetail::where('is_active', 1)->get();

        return response()->json([
            'status'  => true,
            'message' => 'success',
            'data'    => $data,
        ]);
    }

}
