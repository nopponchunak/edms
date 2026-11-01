<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AddReferenceSettingsMenusToPermissions extends Migration
{
    private $menus = [
        [
            'name' => 'Project Type',
            'key' => 'mm6.project_type_settings',
            'legacy_key' => 'mm5.project_type',
            'path' => '/settings/project-types',
            'sort_order' => 7,
        ],
        [
            'name' => 'Discipline',
            'key' => 'mm6.discipline_settings',
            'legacy_key' => 'mm5.discipline',
            'path' => '/settings/disciplines',
            'sort_order' => 8,
        ],
        [
            'name' => 'Project Detail',
            'key' => 'mm6.project_detail_settings',
            'legacy_key' => 'mm5.project_detail',
            'path' => '/settings/project-details',
            'sort_order' => 9,
        ],
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

    public function up()
    {
        if (!Schema::hasTable('main_menus') || !Schema::hasTable('menus')) {
            return;
        }

        $this->loadSchemaColumns();

        DB::transaction(function () {
            $settingMainMenuId = $this->settingMainMenuId();
            $sourceMenu = DB::table('menus')->where('key', 'mm6.permission_settings')->first();

            foreach ($this->menus as $menu) {
                $menuId = $this->upsertMenu($settingMainMenuId, $menu);

                if ($sourceMenu && Schema::hasTable('menu_permissions')) {
                    $this->copyMissingPermissionRows((int) $sourceMenu->id, $menuId);
                }

                $this->grantAdminPermissions($menuId);
            }
        });
    }

    public function down()
    {
        if (!Schema::hasTable('menus')) {
            return;
        }

        $this->loadSchemaColumns();

        $keys = array_map(function ($menu) {
            return $menu['key'];
        }, $this->menus);

        $menuIds = DB::table('menus')->whereIn('key', $keys)->pluck('id')->toArray();
        if (empty($menuIds)) {
            return;
        }

        if (Schema::hasTable('menu_permissions')) {
            DB::table('menu_permissions')->whereIn('menu_id', $menuIds)->update([
                'deleted_at' => now(),
                'updated_at' => now(),
            ]);
        }

        DB::table('menus')->whereIn('id', $menuIds)->update([
            'deleted_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function settingMainMenuId()
    {
        $mainMenu = DB::table('main_menus')
            ->whereNull('deleted_at')
            ->whereIn('name', ['Setting', 'Settings'])
            ->orderBy('id')
            ->first();

        if (!$mainMenu) {
            $mainMenu = DB::table('main_menus')
                ->whereIn('name', ['Setting', 'Settings'])
                ->orderBy('id')
                ->first();
        }

        $values = [
            'name' => 'Setting',
            'updated_at' => now(),
            'deleted_at' => null,
        ];

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

    private function upsertMenu($settingMainMenuId, array $menu)
    {
        $existing = DB::table('menus')->where('key', $menu['key'])->orderBy('id')->first();
        $legacy = DB::table('menus')->where('key', $menu['legacy_key'])->orderBy('id')->first();

        if ($existing && $legacy && (int) $existing->id !== (int) $legacy->id) {
            $this->movePermissionRows((int) $legacy->id, (int) $existing->id);
            DB::table('menus')->where('id', $legacy->id)->update([
                'deleted_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $target = $existing ?: $legacy;
        if (!$target) {
            $target = DB::table('menus')
                ->where('main_menu_id', $settingMainMenuId)
                ->where('name', $menu['name'])
                ->orderBy('id')
                ->first();
        }

        $values = [
            'main_menu_id' => $settingMainMenuId,
            'name' => $menu['name'],
            'updated_at' => now(),
            'deleted_at' => null,
        ];

        if ($this->hasMenuColumn('parent_id')) {
            $values['parent_id'] = null;
        }
        if ($this->hasMenuColumn('sort_order')) {
            $values['sort_order'] = $menu['sort_order'];
        }
        if ($this->hasMenuColumn('key')) {
            $values['key'] = $menu['key'];
        }
        if ($this->hasMenuColumn('path')) {
            $values['path'] = $menu['path'];
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
        $sourceRows = DB::table('menu_permissions')->where('menu_id', $sourceMenuId)->get();

        foreach ($sourceRows as $sourceRow) {
            if (!$this->permissionExists($sourceRow->permission_id)) {
                continue;
            }

            $existing = DB::table('menu_permissions')
                ->where('permission_id', $sourceRow->permission_id)
                ->where('menu_id', $targetMenuId)
                ->first();

            if ($existing) {
                $values = [
                    'deleted_at' => null,
                    'updated_at' => now(),
                ];

                foreach ($this->permissionColumns as $column) {
                    if ($this->hasMenuPermissionColumn($column)) {
                        $values[$column] = $sourceRow->{$column} ?? 0;
                    }
                }

                DB::table('menu_permissions')->where('id', $existing->id)->update($values);
                continue;
            }

            $values = [
                'permission_id' => $sourceRow->permission_id,
                'menu_id' => $targetMenuId,
                'create_by' => $sourceRow->create_by,
                'update_by' => $sourceRow->update_by,
                'created_at' => now(),
                'updated_at' => now(),
                'deleted_at' => null,
            ];

            foreach ($this->permissionColumns as $column) {
                if ($this->hasMenuPermissionColumn($column)) {
                    $values[$column] = $sourceRow->{$column} ?? 0;
                }
            }

            DB::table('menu_permissions')->insert($values);
        }
    }

    private function grantAdminPermissions($menuId)
    {
        if (!Schema::hasTable('permissions') || !Schema::hasTable('menu_permissions')) {
            return;
        }

        $adminPermissionIds = DB::table('permissions')
            ->whereNull('deleted_at')
            ->where(function ($query) {
                $query->where('name', 'like', '%Admin%')
                    ->orWhere('name', 'like', '%Administrator%')
                    ->orWhere('name', 'like', '%Administator%');
            })
            ->pluck('id')
            ->toArray();

        foreach ($adminPermissionIds as $permissionId) {
            $values = [
                'permission_id' => $permissionId,
                'menu_id' => $menuId,
                'create_by' => 'settings-menu-sync',
                'update_by' => 'settings-menu-sync',
                'deleted_at' => null,
                'updated_at' => now(),
            ];

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

    private function movePermissionRows($fromMenuId, $toMenuId)
    {
        if (!Schema::hasTable('menu_permissions')) {
            return;
        }

        $rows = DB::table('menu_permissions')->where('menu_id', $fromMenuId)->get();
        foreach ($rows as $row) {
            if (!$this->permissionExists($row->permission_id)) {
                continue;
            }

            $existing = DB::table('menu_permissions')
                ->where('permission_id', $row->permission_id)
                ->where('menu_id', $toMenuId)
                ->first();

            if ($existing) {
                DB::table('menu_permissions')->where('id', $row->id)->delete();
                continue;
            }

            DB::table('menu_permissions')->where('id', $row->id)->update([
                'menu_id' => $toMenuId,
                'updated_at' => now(),
            ]);
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
