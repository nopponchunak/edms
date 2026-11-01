<?php

namespace App\Http\Controllers;

use App\Models\MainMenu;
use App\Models\Menu;
use App\Models\Permission;
use App\Models\MenuPermission;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MenuController extends Controller
{

    private function validateParent(Menu $menu, ?int $parentId): ?string
    {
        if ($parentId === null) {
            return null;
        }
        if ($parentId === (int) $menu->id) {
            return 'parent_id ไม่สามารถเป็นตัวเองได้';
        }

        $parent = Menu::where('id', $parentId)->whereNull('deleted_at')->first();
        if (!$parent) {
            return 'ไม่พบ parent menu ที่ระบุ';
        }
        if ((int) $parent->main_menu_id !== (int) $menu->main_menu_id) {
            return 'parent menu ต้องอยู่ใน main_menu เดียวกัน';
        }

        // Prevent cycles: walk up parent chain.
        $seen = [];
        $cursor = $parent;
        while ($cursor && $cursor->parent_id !== null) {
            $pid = (int) $cursor->parent_id;
            if ($pid === (int) $menu->id) {
                return 'parent_id ทำให้เกิด loop ในโครงสร้างเมนู';
            }
            if (isset($seen[$pid])) {
                break;
            }
            $seen[$pid] = true;
            $cursor = Menu::where('id', $pid)->whereNull('deleted_at')->first();
        }

        return null;
    }

    private function collectDescendantIds(int $rootId): array
    {
        $all = [$rootId];
        $queue = [$rootId];

        while (!empty($queue)) {
            $children = Menu::whereIn('parent_id', $queue)->whereNull('deleted_at')->pluck('id')->toArray();
            $children = array_map('intval', $children);
            $children = array_values(array_diff(array_unique($children), $all));

            if (empty($children)) {
                break;
            }

            $all = array_merge($all, $children);
            $queue = $children;
        }

        return array_values(array_unique(array_map('intval', $all)));
    }

    public function getList()
    {
        $Item = Menu::select('menus.*')
            ->join('main_menus', 'main_menus.id', '=', 'menus.main_menu_id')
            ->orderBy('main_menus.sort_order')
            ->orderBy('main_menus.id')
            ->orderBy('parent_id')
            ->orderBy('menus.sort_order')
            ->orderBy('menus.id')
            ->get()
            ->toArray();

        return $this->returnSuccess('Successful', $Item);
    }
    /**
     * Display a listing of the resource.
     *
     * @return \Illuminate\Http\Response
     */
    public function index()
    {
        $Menu = Menu::with('main_menu')
            ->select('menus.*')
            ->join('main_menus', 'main_menus.id', '=', 'menus.main_menu_id')
            ->orderBy('main_menus.sort_order')
            ->orderBy('main_menus.id')
            ->orderBy('parent_id')
            ->orderBy('menus.sort_order')
            ->orderBy('menus.id')
            ->get();

        if ($Menu->isNotEmpty()) {

            for ($i = 0; $i < count($Menu); $i++) {
                $Menu[$i]['No'] = $i + 1;
            }
        }

        return $this->returnSuccess('Successful', $Menu);
    }

    /**
     * Show the form for creating a new resource.
     *
     * @return \Illuminate\Http\Response
     */
    public function create()
    {
        //
    }

    /**
     * Store a newly created resource in storage.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\Response
     */
    public function store(Request $request)
    {

        if (!isset($request->name)) {
            return $this->returnErrorData('[name] Data Not Found', 404);
        }
        if (!isset($request->main_menu_id)) {
            return $this->returnErrorData('[main_menu_id] Data Not Found', 404);
        }
        $actorId = $this->resolveActorId($request);

        $name = $request->name;
        $main_menu_id = $request->main_menu_id;
        $parent_id = $request->parent_id;
        $sort_order = $request->sort_order;
        $key = $request->key;
        $path = $request->path;

        DB::beginTransaction();

        try {

            $rows = [];
            for ($i = 0; $i < count($name); $i++) {
                $rows[] = [
                    'name' => $name[$i],
                    'main_menu_id' => $main_menu_id[$i] ?? null,
                    'parent_id' => is_array($parent_id) ? ($parent_id[$i] ?? null) : null,
                    'sort_order' => is_array($sort_order) ? ($sort_order[$i] ?? null) : null,
                    'key' => is_array($key) ? ($key[$i] ?? null) : null,
                    'path' => is_array($path) ? ($path[$i] ?? null) : null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }

            foreach ($rows as $row) {
                $this->storeMenuRow($row);
            }

            //log
            $useId = $actorId;
            $log_type = 'Create Menu';
            $log_description = 'User ' . $useId . ' has ' . $log_type;
            $this->Log($useId, $log_description, $log_type);
            //

            DB::commit();

            return $this->returnSuccess('Successful operation', []);

        } catch (\InvalidArgumentException $e) {

            DB::rollback();

            return $this->returnErrorData($e->getMessage(), 404);

        } catch (\Throwable $e) {

            DB::rollback();

            return $this->returnErrorData('Something went wrong Please try again', 404);
        }
    }

    /**
     * Display the specified resource.
     *
     * @param  \App\Models\Menu  $menu
     * @return \Illuminate\Http\Response
     */
    public function show(Menu $menu)
    {
        $menu->load(['main_menu', 'parent', 'children']);
        return $this->returnSuccess('Successful', $menu);
    }

    private function storeMenuRow(array $row): void
    {
        $key = $row['key'] ?? null;
        $key = is_string($key) ? trim($key) : $key;

        if ($key !== null && $key !== '') {
            $existing = Menu::withTrashed()->where('key', $key)->first();

            if ($existing && !$existing->trashed()) {
                throw new \InvalidArgumentException('menu key ' . $key . ' มีอยู่ในระบบแล้ว');
            }

            if ($existing) {
                $existing->name = $row['name'];
                $existing->main_menu_id = $row['main_menu_id'];
                $existing->parent_id = $row['parent_id'];
                $existing->sort_order = $row['sort_order'];
                $existing->key = $key;
                $existing->path = $row['path'];
                $existing->restore();
                $existing->save();
                return;
            }
        }

        $menu = new Menu();
        $menu->name = $row['name'];
        $menu->main_menu_id = $row['main_menu_id'];
        $menu->parent_id = $row['parent_id'];
        $menu->sort_order = $row['sort_order'];
        $menu->key = $key;
        $menu->path = $row['path'];
        $menu->save();
    }

    /**
     * Show the form for editing the specified resource.
     *
     * @param  \App\Models\Menu  $menu
     * @return \Illuminate\Http\Response
     */
    public function edit(Menu $menu)
    {
        //
    }

    /**
     * Update the specified resource in storage.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \App\Models\Menu  $menu
     * @return \Illuminate\Http\Response
     */
    public function update(Request $request, Menu $menu)
    {
        $actorId = $this->resolveActorId($request);

        DB::beginTransaction();
        try {
            if (isset($request->name)) {
                $menu->name = $request->name;
            }
            if (isset($request->main_menu_id)) {
                $menu->main_menu_id = $request->main_menu_id;
            }
            if (array_key_exists('key', $request->all())) {
                $menu->key = $request->key;
            }
            if (array_key_exists('path', $request->all())) {
                $menu->path = $request->path;
            }
            if (array_key_exists('sort_order', $request->all())) {
                $menu->sort_order = $request->sort_order;
            }
            if (array_key_exists('parent_id', $request->all())) {
                $parentId = $request->parent_id !== null ? (int) $request->parent_id : null;
                $err = $this->validateParent($menu, $parentId);
                if ($err) {
                    return $this->returnErrorData($err, 404);
                }
                $menu->parent_id = $parentId;
            }

            $menu->updated_at = now();
            $menu->save();

            $log_type = 'Update Menu';
            $log_description = 'User ' . $actorId . ' has ' . $log_type . ' #' . $menu->id;
            $this->Log($actorId, $log_description, $log_type);

            DB::commit();
            return $this->returnUpdateReturnData('ดำเนินการสำเร็จ', $menu);
        } catch (\Throwable $e) {
            DB::rollBack();
            return $this->returnErrorData('Something went wrong Please try again', 404);
        }
    }

    /**
     * Remove the specified resource from storage.
     *
     * @param  \App\Models\Menu  $menu
     * @return \Illuminate\Http\Response
     */
    public function destroy(Menu $menu)
    {
        $actorId = $this->resolveActorId(request());

        DB::beginTransaction();
        try {
            $ids = $this->collectDescendantIds((int) $menu->id);

            // Soft delete menu permissions for all nodes.
            MenuPermission::whereIn('menu_id', $ids)->delete();

            // Soft delete menus (subtree).
            Menu::whereIn('id', $ids)->delete();

            $log_type = 'Delete Menu';
            $log_description = 'User ' . $actorId . ' has ' . $log_type . ' #' . $menu->id;
            $this->Log($actorId, $log_description, $log_type);

            DB::commit();
            return $this->returnUpdate('ดำเนินการสำเร็จ');
        } catch (\Throwable $e) {
            DB::rollBack();
            return $this->returnErrorData('Something went wrong Please try again', 404);
        }
    }
}
