<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AlignMenusAndPermissionActionsWithExcel extends Migration
{
    private $actionColumns = [
        'create',
        'view_own',
        'edit_own',
        'delete_own',
        'view_all',
        'edit_all',
        'delete_all',
    ];

    public function up()
    {
        $this->ensureSchema();
        $data = $this->loadMatrix();

        DB::transaction(function () use ($data) {
            $mainMenuIds = $this->syncMainMenus($data['main_menus']);
            $menuIdsByName = [];
            $desiredMenuIds = [];

            foreach ($data['main_menus'] as $mainMenu) {
                $mainMenuId = $mainMenuIds[$mainMenu['name']];
                $ids = $this->syncMenuNodes($mainMenu['menus'], $mainMenuId, null, $menuIdsByName);
                $desiredMenuIds = array_merge($desiredMenuIds, $ids);
            }

            $this->softDeleteMenusNotInMatrix($mainMenuIds, $desiredMenuIds);
            $permissionIds = $this->syncPermissions($data['roles']);
            $this->syncMenuPermissions($data, $permissionIds, $menuIdsByName);
        });
    }

    public function down()
    {
        Schema::table('menu_permissions', function (Blueprint $table) {
            foreach (array_reverse($this->actionColumns) as $column) {
                if (Schema::hasColumn('menu_permissions', $column)) {
                    $table->dropColumn($column);
                }
            }
        });

        Schema::table('main_menus', function (Blueprint $table) {
            if (Schema::hasColumn('main_menus', 'sort_order')) {
                $table->dropColumn('sort_order');
            }
        });
    }

    private function ensureSchema()
    {
        if (!Schema::hasColumn('main_menus', 'sort_order')) {
            Schema::table('main_menus', function (Blueprint $table) {
                $table->integer('sort_order')->nullable()->after('name');
            });
        }

        foreach ($this->actionColumns as $column) {
            if (!Schema::hasColumn('menu_permissions', $column)) {
                Schema::table('menu_permissions', function (Blueprint $table) use ($column) {
                    $table->tinyInteger($column)->default(0)->after('delete');
                });
            }
        }

        DB::statement(
            'UPDATE `menu_permissions` SET ' .
            '`create` = IF(`create` = 0, `save`, `create`), ' .
            '`view_own` = IF(`view_own` = 0, `view`, `view_own`), ' .
            '`edit_own` = IF(`edit_own` = 0, `edit`, `edit_own`), ' .
            '`delete_own` = IF(`delete_own` = 0, `delete`, `delete_own`), ' .
            '`view_all` = IF(`view_all` = 0, `view`, `view_all`), ' .
            '`edit_all` = IF(`edit_all` = 0, `edit`, `edit_all`), ' .
            '`delete_all` = IF(`delete_all` = 0, `delete`, `delete_all`)'
        );
    }

    private function loadMatrix()
    {
        $path = database_path('seeders/data/menu_permission_matrix.json');
        if (!is_file($path)) {
            throw new RuntimeException('Missing menu permission matrix: ' . $path);
        }

        $data = json_decode(file_get_contents($path), true);
        if (!is_array($data) || empty($data['main_menus']) || empty($data['roles'])) {
            throw new RuntimeException('Invalid menu permission matrix: ' . $path);
        }

        return $data;
    }

    private function syncMainMenus(array $mainMenus)
    {
        $ids = [];
        $sourceNames = array_map(function ($mainMenu) {
            return $mainMenu['name'];
        }, $mainMenus);

        foreach ($mainMenus as $mainMenu) {
            $name = $mainMenu['name'];
            $query = DB::table('main_menus')->where('name', $name);

            if ($name === 'Setting') {
                $query->orWhere('name', 'Settings');
            }

            $existing = $query->orderBy('id')->first();
            $values = [
                'name' => $name,
                'sort_order' => (int) $mainMenu['sort_order'],
                'deleted_at' => null,
                'updated_at' => now(),
            ];

            if ($existing) {
                DB::table('main_menus')->where('id', $existing->id)->update($values);
                $ids[$name] = (int) $existing->id;
            } else {
                $values['created_at'] = now();
                $ids[$name] = (int) DB::table('main_menus')->insertGetId($values);
            }
        }

        DB::table('main_menus')
            ->whereNull('deleted_at')
            ->whereNotIn('name', $sourceNames)
            ->update([
                'deleted_at' => now(),
                'updated_at' => now(),
            ]);

        return $ids;
    }

    private function syncMenuNodes(array $nodes, $mainMenuId, $parentId, array &$menuIdsByName)
    {
        $ids = [];
        foreach ($nodes as $node) {
            $menuId = $this->upsertMenuNode($node, $mainMenuId, $parentId);
            $menuIdsByName[$node['name']] = $menuId;
            $ids[] = $menuId;

            if (!empty($node['children'])) {
                $ids = array_merge(
                    $ids,
                    $this->syncMenuNodes($node['children'], $mainMenuId, $menuId, $menuIdsByName)
                );
            }
        }

        return $ids;
    }

    private function upsertMenuNode(array $node, $mainMenuId, $parentId)
    {
        $existing = null;
        if (!empty($node['key'])) {
            $existing = DB::table('menus')->where('key', $node['key'])->orderBy('id')->first();
        }

        if (!$existing) {
            $query = DB::table('menus')
                ->where('main_menu_id', $mainMenuId)
                ->where('name', $node['name']);

            if ($parentId === null) {
                $query->whereNull('parent_id');
            } else {
                $query->where('parent_id', $parentId);
            }

            $existing = $query->orderBy('id')->first();
        }

        $values = [
            'main_menu_id' => $mainMenuId,
            'parent_id' => $parentId,
            'name' => $node['name'],
            'sort_order' => (int) $node['sort_order'],
            'key' => $node['key'],
            'path' => $node['path'],
            'deleted_at' => null,
            'updated_at' => now(),
        ];

        if ($existing) {
            DB::table('menus')->where('id', $existing->id)->update($values);
            return (int) $existing->id;
        }

        $values['created_at'] = now();
        return (int) DB::table('menus')->insertGetId($values);
    }

    private function softDeleteMenusNotInMatrix(array $mainMenuIds, array $desiredMenuIds)
    {
        if (empty($mainMenuIds)) {
            return;
        }

        $deletedIds = DB::table('menus')
            ->whereIn('main_menu_id', array_values($mainMenuIds))
            ->whereNull('deleted_at')
            ->whereNotIn('id', array_unique($desiredMenuIds))
            ->pluck('id')
            ->toArray();

        if (empty($deletedIds)) {
            return;
        }

        DB::table('menus')->whereIn('id', $deletedIds)->update([
            'deleted_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('menu_permissions')->whereIn('menu_id', $deletedIds)->update([
            'deleted_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function syncPermissions(array $roles)
    {
        $permissionIds = [];
        foreach ($roles as $role) {
            $existing = DB::table('permissions')->where('name', $role)->orderBy('id')->first();
            $values = [
                'name' => $role,
                'deleted_at' => null,
                'updated_at' => now(),
            ];

            if ($existing) {
                DB::table('permissions')->where('id', $existing->id)->update($values);
                $permissionIds[$role] = (int) $existing->id;
            } else {
                $values['create_by'] = 'excel-sync';
                $values['update_by'] = 'excel-sync';
                $values['created_at'] = now();
                $permissionIds[$role] = (int) DB::table('permissions')->insertGetId($values);
            }
        }

        return $permissionIds;
    }

    private function syncMenuPermissions(array $data, array $permissionIds, array $menuIdsByName)
    {
        foreach ($data['roles'] as $role) {
            foreach ($data['main_menus'] as $mainMenu) {
                foreach ($mainMenu['menus'] as $node) {
                    $this->syncNodePermission($node, $role, $data, $permissionIds, $menuIdsByName);
                }
            }
        }
    }

    private function syncNodePermission(array $node, $role, array $data, array $permissionIds, array $menuIdsByName)
    {
        $actions = $this->resolveNodeActions($node, $role, $data);
        $menuId = $menuIdsByName[$node['name']];
        $permissionId = $permissionIds[$role];
        $legacy = $this->legacyActions($actions);

        $values = array_merge($actions, $legacy, [
            'permission_id' => $permissionId,
            'menu_id' => $menuId,
            'create_by' => 'excel-sync',
            'update_by' => 'excel-sync',
            'deleted_at' => null,
            'updated_at' => now(),
        ]);

        $existing = DB::table('menu_permissions')
            ->where('permission_id', $permissionId)
            ->where('menu_id', $menuId)
            ->first();

        if ($existing) {
            DB::table('menu_permissions')->where('id', $existing->id)->update($values);
        } else {
            $values['created_at'] = now();
            DB::table('menu_permissions')->insert($values);
        }

        if (!empty($node['children'])) {
            foreach ($node['children'] as $child) {
                $this->syncNodePermission($child, $role, $data, $permissionIds, $menuIdsByName);
            }
        }
    }

    private function resolveNodeActions(array $node, $role, array $data)
    {
        if (isset($data['permissions'][$node['name']][$role])) {
            return $this->normalizeActions($data['permissions'][$node['name']][$role]);
        }

        $actions = $this->emptyActions();
        if (empty($node['children'])) {
            return $actions;
        }

        foreach ($node['children'] as $child) {
            $childActions = $this->resolveNodeActions($child, $role, $data);
            foreach ($this->actionColumns as $column) {
                $actions[$column] = $actions[$column] || (bool) $childActions[$column];
            }
        }

        return $this->normalizeActions($actions);
    }

    private function normalizeActions(array $actions)
    {
        $normalized = [];
        foreach ($this->actionColumns as $column) {
            $normalized[$column] = !empty($actions[$column]) ? 1 : 0;
        }

        return $normalized;
    }

    private function emptyActions()
    {
        $actions = [];
        foreach ($this->actionColumns as $column) {
            $actions[$column] = 0;
        }

        return $actions;
    }

    private function legacyActions(array $actions)
    {
        return [
            'view' => ($actions['view_own'] || $actions['view_all']) ? 1 : 0,
            'edit' => ($actions['edit_own'] || $actions['edit_all']) ? 1 : 0,
            'save' => ($actions['create'] || $actions['edit_own'] || $actions['edit_all']) ? 1 : 0,
            'delete' => ($actions['delete_own'] || $actions['delete_all']) ? 1 : 0,
        ];
    }
}
