<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class RefreshSignatureSettingsMenuPermissions extends Migration
{
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

    public function up()
    {
        if (!Schema::hasTable('main_menus') || !Schema::hasTable('menus') || !Schema::hasTable('menu_permissions')) {
            return;
        }

        DB::transaction(function () {
            $settingMainMenuId = $this->settingMainMenuId();
            $targetMenuId = $this->upsertSignatureMenu($settingMainMenuId);
            $sourceMenu = $this->sourceMenu();

            if (!$sourceMenu) {
                return;
            }

            $this->copyPermissionRows((int) $sourceMenu->id, $targetMenuId);
        });
    }

    public function down()
    {
        // This migration refreshes permissions for an existing menu. Keep data intact on rollback.
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

        if (Schema::hasColumn('main_menus', 'sort_order')) {
            $values['sort_order'] = 7;
        }

        if ($mainMenu) {
            DB::table('main_menus')->where('id', $mainMenu->id)->update($values);
            return (int) $mainMenu->id;
        }

        $values['created_at'] = now();
        return (int) DB::table('main_menus')->insertGetId($values);
    }

    private function upsertSignatureMenu($settingMainMenuId)
    {
        $existing = DB::table('menus')
            ->where('key', 'mm6.signature_settings')
            ->orderBy('id')
            ->first();

        if (!$existing) {
            $existing = DB::table('menus')
                ->where('main_menu_id', $settingMainMenuId)
                ->where('name', 'Signature Setting')
                ->orderBy('id')
                ->first();
        }

        $values = [
            'main_menu_id' => $settingMainMenuId,
            'name' => 'Signature Setting',
            'updated_at' => now(),
            'deleted_at' => null,
        ];

        if (Schema::hasColumn('menus', 'parent_id')) {
            $values['parent_id'] = null;
        }
        if (Schema::hasColumn('menus', 'sort_order')) {
            $values['sort_order'] = 10;
        }
        if (Schema::hasColumn('menus', 'key')) {
            $values['key'] = 'mm6.signature_settings';
        }
        if (Schema::hasColumn('menus', 'path')) {
            $values['path'] = '/settings/signatures';
        }

        if ($existing) {
            DB::table('menus')->where('id', $existing->id)->update($values);
            return (int) $existing->id;
        }

        $values['created_at'] = now();
        return (int) DB::table('menus')->insertGetId($values);
    }

    private function sourceMenu()
    {
        $keys = [
            'mm6.project_detail_settings',
            'mm6.permission_settings',
            'mm5.permission_settings',
        ];

        foreach ($keys as $key) {
            $source = DB::table('menus')
                ->where('key', $key)
                ->whereNull('deleted_at')
                ->orderBy('id')
                ->first();

            if ($source) {
                return $source;
            }
        }

        return DB::table('menus')
            ->whereIn('name', ['Project Detail', 'Permission', 'Permission Settings'])
            ->whereNull('deleted_at')
            ->orderBy('id')
            ->first();
    }

    private function copyPermissionRows($sourceMenuId, $targetMenuId)
    {
        if (!Schema::hasTable('permissions')) {
            return;
        }

        $sourceRows = DB::table('menu_permissions')
            ->where('menu_id', $sourceMenuId)
            ->whereNull('deleted_at')
            ->get();

        foreach ($sourceRows as $sourceRow) {
            if (!$this->permissionExists($sourceRow->permission_id)) {
                continue;
            }

            $values = [
                'deleted_at' => null,
                'updated_at' => now(),
            ];

            foreach ($this->permissionColumns as $column) {
                if (Schema::hasColumn('menu_permissions', $column)) {
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

            $values['permission_id'] = $sourceRow->permission_id;
            $values['menu_id'] = $targetMenuId;
            $values['created_at'] = now();

            DB::table('menu_permissions')->insert($values);
        }
    }

    private function permissionExists($permissionId)
    {
        if (!$permissionId || !Schema::hasTable('permissions')) {
            return false;
        }

        return DB::table('permissions')->where('id', $permissionId)->exists();
    }
}
