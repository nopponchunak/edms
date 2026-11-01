<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AddSubConsultantTypeSettingsMenu extends Migration
{
    private array $permissionColumns = [
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

    private array $mainMenuColumns = [];
    private array $menuColumns = [];
    private array $menuPermissionColumns = [];

    public function up()
    {
        if (! Schema::hasTable('main_menus') || ! Schema::hasTable('menus')) {
            return;
        }

        $this->loadSchemaColumns();

        DB::transaction(function () {
            $settingMainMenuId = $this->settingMainMenuId();
            $menuId = $this->upsertMenu($settingMainMenuId);

            if (Schema::hasTable('menu_permissions')) {
                $sourceMenu = DB::table('menus')
                    ->where('key', 'mm6.sub_consultant_settings')
                    ->first();

                if (! $sourceMenu) {
                    $sourceMenu = DB::table('menus')
                        ->where('key', 'mm6.permission_settings')
                        ->first();
                }

                if ($sourceMenu) {
                    $this->copyMissingPermissionRows((int) $sourceMenu->id, $menuId);
                }
            }

            $this->grantAdminPermissions($menuId);
        });
    }

    public function down()
    {
        if (! Schema::hasTable('menus')) {
            return;
        }

        $menuIds = DB::table('menus')
            ->where('key', 'mm6.sub_consultant_type_settings')
            ->pluck('id')
            ->toArray();

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

    private function settingMainMenuId(): int
    {
        $mainMenu = DB::table('main_menus')
            ->whereNull('deleted_at')
            ->whereIn('name', ['Setting', 'Settings'])
            ->orderBy('id')
            ->first();

        if (! $mainMenu) {
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

    private function upsertMenu(int $settingMainMenuId): int
    {
        $target = DB::table('menus')
            ->where('key', 'mm6.sub_consultant_type_settings')
            ->orderBy('id')
            ->first();

        if (! $target) {
            $target = DB::table('menus')
                ->where('main_menu_id', $settingMainMenuId)
                ->where('name', 'Sub-Consultant Type')
                ->orderBy('id')
                ->first();
        }

        $values = [
            'main_menu_id' => $settingMainMenuId,
            'name' => 'Sub-Consultant Type',
            'updated_at' => now(),
            'deleted_at' => null,
        ];

        if ($this->hasMenuColumn('parent_id')) {
            $values['parent_id'] = null;
        }
        if ($this->hasMenuColumn('sort_order')) {
            $values['sort_order'] = 5;
        }
        if ($this->hasMenuColumn('key')) {
            $values['key'] = 'mm6.sub_consultant_type_settings';
        }
        if ($this->hasMenuColumn('path')) {
            $values['path'] = '/settings/sub-consultant-types';
        }

        if ($target) {
            DB::table('menus')->where('id', $target->id)->update($values);
            return (int) $target->id;
        }

        $values['created_at'] = now();
        return (int) DB::table('menus')->insertGetId($values);
    }

    private function copyMissingPermissionRows(int $sourceMenuId, int $targetMenuId): void
    {
        $sourceRows = DB::table('menu_permissions')->where('menu_id', $sourceMenuId)->get();

        foreach ($sourceRows as $sourceRow) {
            if (! $this->permissionExists($sourceRow->permission_id)) {
                continue;
            }

            $existing = DB::table('menu_permissions')
                ->where('permission_id', $sourceRow->permission_id)
                ->where('menu_id', $targetMenuId)
                ->first();

            $values = [
                'deleted_at' => null,
                'updated_at' => now(),
            ];

            foreach ($this->permissionColumns as $column) {
                if ($this->hasMenuPermissionColumn($column)) {
                    $values[$column] = $sourceRow->{$column} ?? 0;
                }
            }

            if ($this->hasMenuPermissionColumn('create_by')) {
                $values['create_by'] = $sourceRow->create_by ?? 'sub-consultant-type-menu-sync';
            }
            if ($this->hasMenuPermissionColumn('update_by')) {
                $values['update_by'] = $sourceRow->update_by ?? 'sub-consultant-type-menu-sync';
            }

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

    private function grantAdminPermissions(int $menuId): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasTable('menu_permissions')) {
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
                'deleted_at' => null,
                'updated_at' => now(),
            ];

            foreach ($this->permissionColumns as $column) {
                if ($this->hasMenuPermissionColumn($column)) {
                    $values[$column] = 1;
                }
            }

            if ($this->hasMenuPermissionColumn('create_by')) {
                $values['create_by'] = 'sub-consultant-type-menu-sync';
            }
            if ($this->hasMenuPermissionColumn('update_by')) {
                $values['update_by'] = 'sub-consultant-type-menu-sync';
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

    private function permissionExists($permissionId): bool
    {
        if (! Schema::hasTable('permissions')) {
            return false;
        }

        return DB::table('permissions')->where('id', $permissionId)->exists();
    }

    private function loadSchemaColumns(): void
    {
        $this->mainMenuColumns = Schema::hasTable('main_menus') ? Schema::getColumnListing('main_menus') : [];
        $this->menuColumns = Schema::hasTable('menus') ? Schema::getColumnListing('menus') : [];
        $this->menuPermissionColumns = Schema::hasTable('menu_permissions') ? Schema::getColumnListing('menu_permissions') : [];
    }

    private function hasMainMenuColumn(string $column): bool
    {
        return in_array($column, $this->mainMenuColumns, true);
    }

    private function hasMenuColumn(string $column): bool
    {
        return in_array($column, $this->menuColumns, true);
    }

    private function hasMenuPermissionColumn(string $column): bool
    {
        return in_array($column, $this->menuPermissionColumns, true);
    }
}
