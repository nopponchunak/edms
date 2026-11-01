<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

class PreserveExistingAdminMenuPermissions extends Migration
{
    public function up()
    {
        $adminPermissions = DB::table('permissions')
            ->whereNull('deleted_at')
            ->where(function ($q) {
                $q->where('name', 'like', '%Admin%')
                    ->orWhere('name', 'like', '%Administrator%')
                    ->orWhere('name', 'like', '%Administator%');
            })
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->toArray();

        if (empty($adminPermissions)) {
            return;
        }

        $menuIds = DB::table('menus')
            ->whereNull('deleted_at')
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->toArray();

        foreach ($adminPermissions as $permissionId) {
            foreach ($menuIds as $menuId) {
                $values = [
                    'permission_id' => $permissionId,
                    'menu_id' => $menuId,
                    'view' => 1,
                    'edit' => 1,
                    'save' => 1,
                    'delete' => 1,
                    'create' => 1,
                    'view_own' => 1,
                    'edit_own' => 1,
                    'delete_own' => 1,
                    'view_all' => 1,
                    'edit_all' => 1,
                    'delete_all' => 1,
                    'create_by' => 'excel-sync',
                    'update_by' => 'excel-sync',
                    'deleted_at' => null,
                    'updated_at' => now(),
                ];

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
    }

    public function down()
    {
        //
    }
}
