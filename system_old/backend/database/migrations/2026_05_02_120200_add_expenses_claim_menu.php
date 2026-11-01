<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AddExpensesClaimMenu extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('main_menus') || !Schema::hasTable('menus')) {
            return;
        }

        $adminMainMenu = DB::table('main_menus')
            ->whereNull('deleted_at')
            ->where(function ($query) {
                $query->where('name', 'Admin Forms')
                    ->orWhere('name', 'Admin')
                    ->orWhere('id', 2);
            })
            ->orderByRaw("CASE WHEN name = 'Admin Forms' THEN 0 WHEN id = 2 THEN 1 ELSE 2 END")
            ->first();

        if (!$adminMainMenu) {
            $mainMenuId = DB::table('main_menus')->insertGetId([
                'name' => 'Admin Forms',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } else {
            $mainMenuId = $adminMainMenu->id;
        }

        $existingMenu = DB::table('menus')
            ->where('key', 'mm2.expenses_claim')
            ->first();

        $maxSort = DB::table('menus')
            ->where('main_menu_id', $mainMenuId)
            ->max('sort_order');

        $menuData = [
            'main_menu_id' => $mainMenuId,
            'name' => 'Expenses Claim',
            'updated_at' => now(),
            'deleted_at' => null,
        ];
        if (Schema::hasColumn('menus', 'parent_id')) {
            $menuData['parent_id'] = null;
        }
        if (Schema::hasColumn('menus', 'sort_order')) {
            $menuData['sort_order'] = ((int) $maxSort) + 1;
        }
        if (Schema::hasColumn('menus', 'key')) {
            $menuData['key'] = 'mm2.expenses_claim';
        }
        if (Schema::hasColumn('menus', 'path')) {
            $menuData['path'] = '/expenses-claim';
        }

        if ($existingMenu) {
            DB::table('menus')->where('id', $existingMenu->id)->update($menuData);
            $menuId = $existingMenu->id;
        } else {
            $menuData['created_at'] = now();
            $menuId = DB::table('menus')->insertGetId($menuData);
        }

        $this->copyPermissions($menuId);
    }

    public function down()
    {
        if (!Schema::hasTable('menus')) {
            return;
        }

        $menu = DB::table('menus')->where('key', 'mm2.expenses_claim')->first();
        if (!$menu) {
            return;
        }

        if (Schema::hasTable('menu_permissions')) {
            DB::table('menu_permissions')->where('menu_id', $menu->id)->delete();
        }

        DB::table('menus')->where('id', $menu->id)->delete();
    }

    private function copyPermissions(int $menuId): void
    {
        if (!Schema::hasTable('menu_permissions') || !Schema::hasTable('permissions')) {
            return;
        }

        $sourceMenu = DB::table('menus')
            ->where('key', 'mm2.sub_consultant_assessment')
            ->first();

        if ($sourceMenu) {
            $sourceRows = DB::table('menu_permissions')
                ->where('menu_id', $sourceMenu->id)
                ->get();

            foreach ($sourceRows as $row) {
                $this->upsertPermissionRow($menuId, $row->permission_id, [
                    'view' => $row->view ?? 1,
                    'edit' => $row->edit ?? 1,
                    'save' => $row->save ?? 1,
                    'delete' => $row->delete ?? 1,
                ]);
            }

            return;
        }

        $permissions = DB::table('permissions')->select('id')->get();
        foreach ($permissions as $permission) {
            $this->upsertPermissionRow($menuId, $permission->id, [
                'view' => 1,
                'edit' => 1,
                'save' => 1,
                'delete' => 1,
            ]);
        }
    }

    private function upsertPermissionRow(int $menuId, int $permissionId, array $actions): void
    {
        if (!DB::table('permissions')->where('id', $permissionId)->exists()) {
            return;
        }

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
}
