<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AddMissingSettingsMenus extends Migration
{
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

        // 1. Find "Settings" main menu (Reference from mm5.*)
        $settingsMainMenu = DB::table('main_menus')
            ->whereNull('deleted_at')
            ->where(function ($query) {
                $query->where('name', 'Settings')
                    ->orWhere('name', 'Settings Forms')
                    ->orWhere('id', 5);
            })
            ->first();

        if (!$settingsMainMenu) {
            $mainMenuId = DB::table('main_menus')->insertGetId([
                'name' => 'Settings',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } else {
            $mainMenuId = $settingsMainMenu->id;
        }

        // 2. Menu items to add (Reference from production screen)
        $menusToAdd = [
            [
                'name' => 'Project Type',
                'key'  => 'mm5.project_type',
                'path' => '/settings/project-types',
            ],
            [
                'name' => 'Disciplint', // As seen in production screenshot
                'key'  => 'mm5.discipline',
                'path' => '/settings/disciplines',
            ],
            [
                'name' => 'Project Detail',
                'key'  => 'mm5.project_detail',
                'path' => '/settings/project-details',
            ],
        ];

        foreach ($menusToAdd as $menu) {
            $this->upsertMenu($mainMenuId, $menu);
        }
    }

    /**
     * Upsert menu item
     */
    private function upsertMenu($mainMenuId, $data)
    {
        $existingMenu = DB::table('menus')
            ->where('name', $data['name'])
            ->where('main_menu_id', $mainMenuId)
            ->first();

        if (!$existingMenu && isset($data['key'])) {
            $existingMenu = DB::table('menus')
                ->where('key', $data['key'])
                ->first();
        }

        $maxSort = DB::table('menus')
            ->where('main_menu_id', $mainMenuId)
            ->max('sort_order');

        $menuData = [
            'main_menu_id' => $mainMenuId,
            'name'         => $data['name'],
            'updated_at'   => now(),
            'deleted_at'   => null,
        ];

        if (Schema::hasColumn('menus', 'key')) {
            $menuData['key'] = $data['key'];
        }
        if (Schema::hasColumn('menus', 'path')) {
            $menuData['path'] = $data['path'];
        }
        if (Schema::hasColumn('menus', 'sort_order') && !$existingMenu) {
            $menuData['sort_order'] = ((int) $maxSort) + 1;
        }

        if ($existingMenu) {
            DB::table('menus')->where('id', $existingMenu->id)->update($menuData);
            $menuId = $existingMenu->id;
        } else {
            $menuData['created_at'] = now();
            $menuId = DB::table('menus')->insertGetId($menuData);
        }

        // Copy permissions to ensure menus are visible
        $this->copyPermissions($menuId);
    }

    /**
     * Copy permissions from Permission Settings menu to the new menu
     */
    private function copyPermissions(int $menuId): void
    {
        if (!Schema::hasTable('menu_permissions') || !Schema::hasTable('permissions')) {
            return;
        }

        $sourceMenu = DB::table('menus')
            ->where('key', 'mm5.permission_settings')
            ->first();

        if ($sourceMenu) {
            $sourceRows = DB::table('menu_permissions')
                ->where('menu_id', $sourceMenu->id)
                ->get();

            foreach ($sourceRows as $row) {
                $this->upsertPermissionRow($menuId, $row->permission_id, [
                    'view'   => $row->view ?? 1,
                    'edit'   => $row->edit ?? 1,
                    'save'   => $row->save ?? 1,
                    'delete' => $row->delete ?? 1,
                ]);
            }
        }
    }

    private function upsertPermissionRow(int $menuId, int $permissionId, array $actions): void
    {
        $values = [
            'updated_at' => now(),
            'deleted_at' => null,
        ];

        foreach (['view', 'edit', 'save', 'delete'] as $column) {
            if (Schema::hasColumn('menu_permissions', $column)) {
                $values[$column] = $actions[$column] ?? 1;
            }
        }

        $existing = DB::table('menu_permissions')
            ->where('permission_id', $permissionId)
            ->where('menu_id', $menuId)
            ->first();

        if ($existing) {
            DB::table('menu_permissions')->where('id', $existing->id)->update($values);
            return;
        }

        $values['permission_id'] = $permissionId;
        $values['menu_id'] = $menuId;
        $values['created_at'] = now();

        DB::table('menu_permissions')->insert($values);
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        $keys = ['mm5.project_type', 'mm5.discipline', 'mm5.project_detail'];
        $menuIds = DB::table('menus')->whereIn('key', $keys)->pluck('id')->toArray();
        
        if (!empty($menuIds)) {
            DB::table('menu_permissions')->whereIn('menu_id', $menuIds)->delete();
            DB::table('menus')->whereIn('id', $menuIds)->delete();
        }
    }
}
