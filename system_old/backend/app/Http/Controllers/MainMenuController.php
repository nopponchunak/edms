<?php

namespace App\Http\Controllers;

use App\Models\MainMenu;
use App\Models\Menu;
use App\Models\MenuPermission;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MainMenuController extends Controller
{
    private function menuIncludeSetForPermission(int $permissionId, int $mainMenuId): array
    {
        $visibleMenuIds = MenuPermission::join('menus', 'menus.id', '=', 'menu_permissions.menu_id')
            ->where('menu_permissions.permission_id', $permissionId)
            ->where(function ($q) {
                $q->where('menu_permissions.view', 1)
                    ->orWhere('menu_permissions.view_own', 1)
                    ->orWhere('menu_permissions.view_all', 1);
            })
            ->whereNull('menu_permissions.deleted_at')
            ->whereNull('menus.deleted_at')
            ->where('menus.main_menu_id', $mainMenuId)
            ->pluck('menus.id')
            ->map(function ($v) {
                return (int) $v;
            })
            ->toArray();

        if (empty($visibleMenuIds)) {
            return [];
        }

        // Include ancestors so the tree stays connected even if parent nodes are not directly viewable.
        $includeIds = $visibleMenuIds;
        $seen = [];
        $queue = $visibleMenuIds;
        while (!empty($queue)) {
            $queue = array_values(array_diff(array_unique($queue), $seen));
            if (empty($queue)) {
                break;
            }
            foreach ($queue as $id) {
                $seen[] = $id;
            }

            $parentIds = Menu::whereIn('id', $queue)
                ->where('main_menu_id', $mainMenuId)
                ->whereNotNull('parent_id')
                ->pluck('parent_id')
                ->map(function ($v) {
                    return (int) $v;
                })
                ->toArray();

            if (empty($parentIds)) {
                break;
            }

            $includeIds = array_values(array_unique(array_merge($includeIds, $parentIds)));
            $queue = $parentIds;
        }

        return array_fill_keys($includeIds, true);
    }

    private function buildMenuTree(array $menus, $parentId = null): array
    {
        $tree = [];
        foreach ($menus as $menu) {
            $menuParentId = $menu['parent_id'] ?? null;
            if ((string) $menuParentId !== (string) $parentId) {
                continue;
            }

            $node = $menu;
            $node['children'] = $this->buildMenuTree($menus, $menu['id']);
            $tree[] = $node;
        }

        return $tree;
    }

    public function getList()
    {
        $permissionId = request()->input('permission_id');

        $query = MainMenu::query();
        if (!empty($permissionId)) {
            $query->whereExists(function ($q) use ($permissionId) {
                $q->select(DB::raw(1))
                    ->from('menus')
                    ->join('menu_permissions', 'menu_permissions.menu_id', '=', 'menus.id')
                    ->whereColumn('menus.main_menu_id', 'main_menus.id')
                    ->whereNull('menus.deleted_at')
                    ->whereNull('menu_permissions.deleted_at')
                    ->where('menu_permissions.permission_id', (int) $permissionId)
                    ->where(function ($qq) {
                        $qq->where('menu_permissions.view', 1)
                            ->orWhere('menu_permissions.view_own', 1)
                            ->orWhere('menu_permissions.view_all', 1);
                    });
            });
        }

        $Item = $query->orderBy('sort_order', 'asc')->orderBy('id', 'asc')->get()->toArray();

        if (!empty($Item)) {

            for ($i = 0; $i < count($Item); $i++) {
                $Item[$i]['No'] = $i + 1;
                $menusQuery = Menu::where('main_menu_id', $Item[$i]['id'])
                    ->orderBy('parent_id')
                    ->orderBy('sort_order')
                    ->orderBy('id')
                    ->whereNotIn('id', $this->auditLogSettingsMenuIds())
                    ->whereNull('deleted_at');

                $menus = $menusQuery->get()->toArray();
                if (!empty($permissionId)) {
                    $includeSet = $this->menuIncludeSetForPermission((int) $permissionId, (int) $Item[$i]['id']);
                    $menus = array_values(array_filter($menus, function ($m) use ($includeSet) {
                        return isset($includeSet[(int) $m['id']]);
                    }));
                }
                // Keep backward compatible field (flat list)
                $Item[$i]['Menus'] = $menus;
                // New: nested tree for 2+ levels
                $Item[$i]['MenusTree'] = $this->buildMenuTree($menus, null);
            }
        }

        return $this->returnSuccess('Successful', $Item);
    }

    public function getPage(Request $request)
    {
        $columns = $request->columns;
        $length = $request->length;
        $order = $request->order;
        $search = $request->search;
        $start = $request->start;
        $page = $start / $length + 1;
        $permissionId = $request->permission_id;

        $col = ['id', 'name', 'sort_order', 'created_at', 'updated_at'];
        $orderby = ['id', 'name', 'created_at', 'updated_at'];

        $d = MainMenu::select($col);
        if (!empty($permissionId)) {
            $d->whereExists(function ($q) use ($permissionId) {
                $q->select(DB::raw(1))
                    ->from('menus')
                    ->join('menu_permissions', 'menu_permissions.menu_id', '=', 'menus.id')
                    ->whereColumn('menus.main_menu_id', 'main_menus.id')
                    ->whereNull('menus.deleted_at')
                    ->whereNull('menu_permissions.deleted_at')
                    ->where('menu_permissions.permission_id', (int) $permissionId)
                    ->where(function ($qq) {
                        $qq->where('menu_permissions.view', 1)
                            ->orWhere('menu_permissions.view_own', 1)
                            ->orWhere('menu_permissions.view_all', 1);
                    });
            });
        }

        if (($orderby[$order[0]['column']] ?? false)) {
            $d->orderBy($orderby[$order[0]['column']], $order[0]['dir']);
        } else {
            $d->orderBy('sort_order', 'asc')->orderBy('id', 'asc');
        }

        if (($search['value'] ?? '') !== '' && ($search['value'] ?? null) !== null) {
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
                $menusQuery = Menu::where('main_menu_id', $items[$i]->id)
                    ->orderBy('parent_id')
                    ->orderBy('sort_order')
                    ->orderBy('id')
                    ->whereNull('deleted_at');

                $menus = $menusQuery->get()->toArray();
                if (!empty($permissionId)) {
                    $includeSet = $this->menuIncludeSetForPermission((int) $permissionId, (int) $items[$i]->id);
                    $menus = array_values(array_filter($menus, function ($m) use ($includeSet) {
                        return isset($includeSet[(int) $m['id']]);
                    }));
                }
                $items[$i]->Menus = $menus;
                $items[$i]->MenusTree = $this->buildMenuTree($menus, null);
            }
        }

        return $this->returnSuccess('Successful', $items);
    }
    /**
     * Display a listing of the resource.
     *
     * @return \Illuminate\Http\Response
     */
    public function index()
    {
        //
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
        $actorId = $this->resolveActorId($request);

        DB::beginTransaction();

        try {

            $Item = new MainMenu();
            $Item->name = $request->name;

            $Item->save();

            //log
            $userId = $actorId;
            $type = 'Add Main Menu';
            $description = 'User ' . $userId . ' has ' . $type . ' ' . $request->name;
            $this->Log($userId, $description, $type);
            //

            DB::commit();

            return $this->returnSuccess('Successful operation', []);
        } catch (\Throwable $e) {

            DB::rollback();

            return $this->returnErrorData('Something went wrong Please try again ', 404);
        }
    }

    /**
     * Display the specified resource.
     *
     * @param  \App\Models\MainMenu  $mainMenu
     * @return \Illuminate\Http\Response
     */
    public function show(MainMenu $mainMenu)
    {
        $permissionId = request()->input('permission_id');

        $menusQuery = Menu::where('main_menu_id', $mainMenu->id)
            ->orderBy('parent_id')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->whereNull('deleted_at');

        $menus = $menusQuery->get()->toArray();
        if (!empty($permissionId)) {
            $includeSet = $this->menuIncludeSetForPermission((int) $permissionId, (int) $mainMenu->id);
            $menus = array_values(array_filter($menus, function ($m) use ($includeSet) {
                return isset($includeSet[(int) $m['id']]);
            }));

            // If nothing is visible for this permission, behave like not found.
            if (empty($menus)) {
                return $this->returnErrorData('Data Not Found', 404);
            }
        }

        $data = $mainMenu->toArray();
        $data['Menus'] = $menus;
        $data['MenusTree'] = $this->buildMenuTree($menus, null);

        return $this->returnSuccess('Successful', $data);
    }

    /**
     * Show the form for editing the specified resource.
     *
     * @param  \App\Models\MainMenu  $mainMenu
     * @return \Illuminate\Http\Response
     */
    public function edit(MainMenu $mainMenu)
    {
        //
    }

    /**
     * Update the specified resource in storage.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \App\Models\MainMenu  $mainMenu
     * @return \Illuminate\Http\Response
     */
    public function update(Request $request, MainMenu $mainMenu)
    {
        //
    }

    /**
     * Remove the specified resource from storage.
     *
     * @param  \App\Models\MainMenu  $mainMenu
     * @return \Illuminate\Http\Response
     */
    public function destroy(MainMenu $mainMenu)
    {
        //
    }
}
