<?php

namespace App\Http\Controllers;

use App\Models\Menu;
use App\Models\MenuPermission;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PermissionController extends Controller
{
    public function getList()
    {
        $items = Permission::orderBy('id', 'desc')->get()->toArray();
        if (!empty($items)) {
            for ($i = 0; $i < count($items); $i++) {
                $items[$i]['No'] = $i + 1;
            }
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $items);
    }

    public function getPage(Request $request)
    {
        $length = $request->length;
        $order = $request->order;
        $search = $request->search;
        $start = $request->start;
        $page = $start / $length + 1;

        $col = ['id', 'name', 'create_by', 'update_by', 'created_at', 'updated_at'];
        $orderby = ['id', 'name', 'create_by', 'update_by', 'created_at', 'updated_at'];

        $d = Permission::select($col);

        if (($orderby[$order[0]['column']] ?? false)) {
            $d->orderBy($orderby[$order[0]['column']], $order[0]['dir']);
        } else {
            $d->orderBy('id', 'desc');
        }

        if (($search['value'] ?? '') !== '') {
            $value = $search['value'];
            $d->where(function ($query) use ($value, $col) {
                foreach ($col as $c) {
                    $query->orWhere($c, 'like', '%' . $value . '%');
                }
            });
        }

        $items = $d->paginate($length, ['*'], 'page', $page);
        if ($items->isNotEmpty()) {
            $no = (($page - 1) * $length);
            for ($i = 0; $i < count($items); $i++) {
                $no++;
                $items[$i]->No = $no;
            }
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $items);
    }

    public function getPermissonUser(Request $request)
    {
        $permissionId = $request->input('permission_id');
        if (empty($permissionId)) {
            return $this->returnErrorData('[permission_id] Data Not Found', 404);
        }

        $items = User::where('permission_id', $permissionId)->get()->toArray();
        if (!empty($items)) {
            for ($i = 0; $i < count($items); $i++) {
                $items[$i]['No'] = $i + 1;
            }
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $items);
    }

    public function getPermissonMenu(Request $request)
    {
        $permissionId = $request->input('permission_id');
        if (empty($permissionId)) {
            return $this->returnErrorData('[permission_id] Data Not Found', 404);
        }

        $menus = Menu::with('main_menu')
            ->select('menus.*')
            ->join('main_menus', 'main_menus.id', '=', 'menus.main_menu_id')
            ->whereNotIn('menus.id', $this->auditLogSettingsMenuIds())
            ->whereRaw("TRIM(COALESCE(menus.path, '')) <> ''")
            ->whereNotExists(function ($query) {
                $query->select(DB::raw(1))
                    ->from('menus as child')
                    ->whereColumn('child.parent_id', 'menus.id')
                    ->whereNull('child.deleted_at');
            })
            ->orderBy('main_menus.sort_order')
            ->orderBy('main_menus.id')
            ->orderBy('menus.parent_id')
            ->orderBy('menus.sort_order')
            ->orderBy('menus.id')
            ->get();

        $permissionRows = MenuPermission::where('permission_id', $permissionId)
            ->whereNotIn('menu_id', $this->auditLogSettingsMenuIds())
            ->get()
            ->keyBy('menu_id');

        $result = [];
        foreach ($menus as $menu) {
            $row = $permissionRows->get($menu->id);
            $result[] = array_merge([
                'menu_id' => (int) $menu->id,
                'menu' => $menu,
            ], $this->serializeMenuPermissionActions($row));
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $result);
    }

    public function index()
    {
        return $this->getList();
    }

    public function store(Request $request)
    {
        if (!isset($request->name)) {
            return $this->returnErrorData('[name] Data Not Found', 404);
        }
        $actorId = $this->resolveActorId($request);

        // Support both "menus" (new) and "menu" (legacy client payload).
        $menus = $request->input('menus', $request->input('menu'));

        DB::beginTransaction();
        try {
            $permission = new Permission();
            $permission->name = $request->name;
            $permission->create_by = $actorId;
            $permission->update_by = $actorId;
            $permission->save();

            // Optional: create menu permissions together with the role.
            // menus: [{menu_id, view, edit, save, delete}]
            if (is_array($menus) && !empty($menus)) {
                $this->replaceMenuPermissions((int) $permission->id, $menus, $actorId);
            }

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            return $this->returnErrorData('Something went wrong Please try again', 404);
        }

        return $this->returnSuccess('Successful operation', $permission);
    }

    public function show($id)
    {
        $permission = Permission::find($id);
        if (!$permission) {
            return $this->returnErrorData('Data Not Found', 404);
        }

        return $this->returnSuccess('Successful', $permission);
    }

    public function update(Request $request, $id)
    {
        $permission = Permission::find($id);
        if (!$permission) {
            return $this->returnErrorData('Data Not Found', 404);
        }

        $actorId = $this->resolveActorId($request);

        // Support both "menus" (new) and "menu" (legacy client payload).
        $menus = $request->input('menus', $request->input('menu'));

        // Allow updating either name, menus, or both.
        if (!isset($request->name) && !is_array($menus)) {
            return $this->returnErrorData('[name] or [menus]/[menu] Data Not Found', 404);
        }

        DB::beginTransaction();
        try {
            if (isset($request->name)) {
                $permission->name = $request->name;
            }
            $permission->update_by = $actorId;
            $permission->save();

            // Optional: update menu permissions together with the role.
            // menus: [{menu_id, view, edit, save, delete}]
            if (is_array($menus)) {
                $this->replaceMenuPermissions((int) $permission->id, $menus, $actorId);
            }

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            return $this->returnErrorData('Something went wrong Please try again', 404);
        }

        return $this->returnUpdateReturnData('ดำเนินการสำเร็จ', $permission);
    }

    public function destroy($id)
    {
        DB::beginTransaction();
        try {
            $permission = Permission::find($id);
            if (!$permission) {
                return $this->returnErrorData('Data Not Found', 404);
            }

            $permission->delete();
            DB::commit();

            return $this->returnUpdate('ดำเนินการสำเร็จ');
        } catch (\Throwable $e) {
            DB::rollBack();
            return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ', 404);
        }
    }
}
