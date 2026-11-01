<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AddManualManagementSettingsMenu extends Migration
{
    private $menu = [
        'name' => 'Manual Management',
        'key' => 'mm6.manual_management',
        'path' => '/settings/manual-management',
        'sort_order' => 10,
    ];

    private $permissionColumns = [
        'view',
        'edit',
        'save',
        'delete',
        'create',
        'view_own',
        'edit_own',
        'delete_own',
        'view_all',
        'edit_all',
        'delete_all',
    ];

    private $mainMenuColumns = [];
    private $menuColumns = [];
    private $menuPermissionColumns = [];

    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        if (!Schema::hasTable('main_menus') || !Schema::hasTable('menus')) {
            return;
        }

        $this->loadSchemaColumns();

        DB::transaction(function () {
            $settingMainMenuId = $this->settingMainMenuId();
            $menuId = $this->upsertMenu($settingMainMenuId);

            if (Schema::hasTable('menu_permissions')) {
                $sourceMenu = DB::table('menus')
                    ->whereIn('key', ['mm6.permission_settings', 'mm5.permission_settings'])
                    ->orderBy('id')
                    ->first();

                if ($sourceMenu) {
                    $this->copyMissingPermissionRows((int) $sourceMenu->id, $menuId);
                }
            }

            $this->grantAdminPermissions($menuId);
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        if (!Schema::hasTable('menus')) {
            return;
        }

        $this->loadSchemaColumns();

        $menuIds = DB::table('menus')->where('key', $this->menu['key'])->pluck('id')->toArray();
        if (empty($menuIds)) {
            return;
        }

        if (Schema::hasTable('menu_permissions')) {
            if ($this->hasMenuPermissionColumn('deleted_at')) {
                DB::table('menu_permissions')->whereIn('menu_id', $menuIds)->update([
                    'deleted_at' => now(),
                    'updated_at' => now(),
                ]);
            } else {
                DB::table('menu_permissions')->whereIn('menu_id', $menuIds)->delete();
            }
        }

        if ($this->hasMenuColumn('deleted_at')) {
            DB::table('menus')->whereIn('id', $menuIds)->update([
                'deleted_at' => now(),
                'updated_at' => now(),
            ]);
        } else {
            DB::table('menus')->whereIn('id', $menuIds)->delete();
        }
    }

    private function settingMainMenuId()
    {
        $query = DB::table('main_menus')->whereIn('name', ['Setting', 'Settings']);
        if ($this->hasMainMenuColumn('deleted_at')) {
            $query->whereNull('deleted_at');
        }

        $mainMenu = $query->orderBy('id')->first();
        if (!$mainMenu) {
            $mainMenu = DB::table('main_menus')
                ->whereIn('name', ['Setting', 'Settings'])
                ->orderBy('id')
                ->first();
        }

        $values = [
            'name' => 'Setting',
            'updated_at' => now(),
        ];

        if ($this->hasMainMenuColumn('deleted_at')) {
            $values['deleted_at'] = null;
        }
        if ($this->hasMainMenuColumn('sort_order')) {
            $values['sort_order'] = 6;
        }

        if ($mainMenu) {
            DB::table('main_menus')->where('id', $mainMenu->id)->update($values);
            return (int) $mainMenu->id;
        }

        $values['created_at'] = now();
        return (int) DB::table('main_menus')->insertGetId($values);
    }

    private function upsertMenu($settingMainMenuId)
    {
        $target = DB::table('menus')
            ->where('key', $this->menu['key'])
            ->orderBy('id')
            ->first();

        if (!$target) {
            $target = DB::table('menus')
                ->where('path', $this->menu['path'])
                ->orderBy('id')
                ->first();
        }

        if (!$target) {
            $target = DB::table('menus')
                ->where('main_menu_id', $settingMainMenuId)
                ->where('name', $this->menu['name'])
                ->orderBy('id')
                ->first();
        }

        $values = [
            'main_menu_id' => $settingMainMenuId,
            'name' => $this->menu['name'],
            'updated_at' => now(),
        ];

        if ($this->hasMenuColumn('parent_id')) {
            $values['parent_id'] = null;
        }
        if ($this->hasMenuColumn('sort_order')) {
            $values['sort_order'] = $this->menu['sort_order'];
        }
        if ($this->hasMenuColumn('key')) {
            $values['key'] = $this->menu['key'];
        }
        if ($this->hasMenuColumn('path')) {
            $values['path'] = $this->menu['path'];
        }
        if ($this->hasMenuColumn('deleted_at')) {
            $values['deleted_at'] = null;
        }

        if ($target) {
            DB::table('menus')->where('id', $target->id)->update($values);
            return (int) $target->id;
        }

        $values['created_at'] = now();
        return (int) DB::table('menus')->insertGetId($values);
    }

    private function copyMissingPermissionRows($sourceMenuId, $targetMenuId)
    {
        if (!Schema::hasTable('menu_permissions')) {
            return;
        }

        $sourceRows = DB::table('menu_permissions')->where('menu_id', $sourceMenuId)->get();
        foreach ($sourceRows as $sourceRow) {
            if (!$this->permissionExists($sourceRow->permission_id)) {
                continue;
            }

            $values = [
                'permission_id' => $sourceRow->permission_id,
                'menu_id' => $targetMenuId,
                'create_by' => $sourceRow->create_by ?? 'manual-management-menu-sync',
                'update_by' => $sourceRow->update_by ?? 'manual-management-menu-sync',
                'updated_at' => now(),
            ];

            if ($this->hasMenuPermissionColumn('deleted_at')) {
                $values['deleted_at'] = null;
            }

            foreach ($this->permissionColumns as $column) {
                if ($this->hasMenuPermissionColumn($column)) {
                    $values[$column] = $sourceRow->{$column} ?? 0;
                }
            }

            $existing = DB::table('menu_permissions')
                ->where('permission_id', $sourceRow->permission_id)
                ->where('menu_id', $targetMenuId)
                ->first();

            if ($existing) {
                DB::table('menu_permissions')->where('id', $existing->id)->update($values);
                continue;
            }

            $values['created_at'] = now();
            DB::table('menu_permissions')->insert($values);
        }
    }

    private function grantAdminPermissions($menuId)
    {
        if (!Schema::hasTable('permissions') || !Schema::hasTable('menu_permissions')) {
            return;
        }

        $query = DB::table('permissions')
            ->where(function ($q) {
                $q->where('name', 'like', '%Admin%')
                    ->orWhere('name', 'like', '%Administrator%')
                    ->orWhere('name', 'like', '%Administator%');
            });

        if (Schema::hasColumn('permissions', 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        $adminPermissionIds = $query->pluck('id')->toArray();
        foreach ($adminPermissionIds as $permissionId) {
            $values = [
                'permission_id' => $permissionId,
                'menu_id' => $menuId,
                'create_by' => 'manual-management-menu-sync',
                'update_by' => 'manual-management-menu-sync',
                'updated_at' => now(),
            ];

            if ($this->hasMenuPermissionColumn('deleted_at')) {
                $values['deleted_at'] = null;
            }

            foreach ($this->permissionColumns as $column) {
                if ($this->hasMenuPermissionColumn($column)) {
                    $values[$column] = 1;
                }
            }

            $existing = DB::table('menu_permissions')
                ->where('permission_id', $permissionId)
                ->where('menu_id', $menuId)
                ->first();

            if ($existing) {
                DB::table('menu_permissions')->where('id', $existing->id)->update($values);
                continue;
            }

            $values['created_at'] = now();
            DB::table('menu_permissions')->insert($values);
        }
    }

    private function permissionExists($permissionId)
    {
        if (!Schema::hasTable('permissions')) {
            return false;
        }

        return DB::table('permissions')->where('id', $permissionId)->exists();
    }

    private function loadSchemaColumns()
    {
        $this->mainMenuColumns = Schema::hasTable('main_menus') ? Schema::getColumnListing('main_menus') : [];
        $this->menuColumns = Schema::hasTable('menus') ? Schema::getColumnListing('menus') : [];
        $this->menuPermissionColumns = Schema::hasTable('menu_permissions') ? Schema::getColumnListing('menu_permissions') : [];
    }

    private function hasMainMenuColumn($column)
    {
        return in_array($column, $this->mainMenuColumns, true);
    }

    private function hasMenuColumn($column)
    {
        return in_array($column, $this->menuColumns, true);
    }

    private function hasMenuPermissionColumn($column)
    {
        return in_array($column, $this->menuPermissionColumns, true);
    }
}
