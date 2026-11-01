<?php
namespace App\Http\Controllers;

use App\Models\Discipline;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DisciplineController extends Controller
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
            'detail',
            'is_active',
            'created_at',
            'updated_at',
        ];

        $D = Discipline::select($col);

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

    // create a new discipline
    public function store(Request $request)
    {
        $request->validate([
            'code' => 'required',
            'name' => 'required|string',
        ]);

        $inactiveDiscipline = Discipline::withTrashed()
            ->where('code', $request->code)
            ->where('is_active', 0)
            ->first();

        if ($inactiveDiscipline) {
            if ($inactiveDiscipline->trashed()) {
                $inactiveDiscipline->restore();
            }

            $inactiveDiscipline->update([
                'name'      => $request->name,
                'detail'    => $request->detail,
                'is_active' => 1,
            ]);

            return response()->json([
                'status'  => true,
                'message' => 'created successfully',
                'data'    => $inactiveDiscipline->fresh(),
            ]);
        }

        $request->validate([
            'code' => [Rule::unique('disciplines', 'code')],
        ]);

        $data = Discipline::create([
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

    // get a discipline by id
    public function show($id)
    {
        $data = Discipline::where('id', $id)
            ->where('is_active', 1)
            ->firstOrFail();

        return response()->json([
            'status'  => true,
            'message' => 'success',
            'data'    => $data,
        ]);
    }

    // upate a discipline by id
    public function update($id, Request $request)
    {
        $data = Discipline::findOrFail($id);

        $request->validate([
            'code' => 'required|unique:disciplines,code,' . $id,
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

    // delete a discipline by id
    public function destroy($id)
    {
        try {
            $discipline = Discipline::find($id);

            if (! $discipline) {
                return response()->json([
                    'status'  => false,
                    'message' => 'Discipline not found',
                    'data'    => null,
                ], 404);
            }

            // if ($discipline->project()->where('is_active', 1)->exists()) {
            //     return response()->json([
            //         'status'  => false,
            //         'message' => 'Cannot delete. Discipline is linked to active projects.',
            //         'data'    => null,
            //     ], 409);
            // }

            $discipline->update(['is_active' => 0]);
            $discipline->delete();

            return response()->json([
                'status'  => true,
                'message' => 'Deleted successfully',
                'data'    => null,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status'  => false,
                'message' => 'Internal Server Error',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    // get all discipline
    public function getAll()
    {
        $data = Discipline::where('is_active', 1)->get();

        return response()->json([
            'status'  => true,
            'message' => 'success',
            'data'    => $data,
        ]);
    }
}
