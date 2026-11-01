<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SyncSettingsMenuTreeWithFrontend extends Migration
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

    private $rootSettingMenus = [
        [
            'name' => 'User Setting',
            'key' => 'mm6.user_settings',
            'path' => '/settings/users',
            'sort_order' => 1,
        ],
        [
            'name' => 'Permission',
            'key' => 'mm6.permission_settings',
            'path' => '/settings/permissions',
            'sort_order' => 2,
        ],
        [
            'name' => 'Main Menu',
            'key' => 'mm6.main_menu',
            'path' => '/settings/main-menus',
            'sort_order' => 4,
        ],
        [
            'name' => 'Manual Management',
            'key' => 'mm6.manual_management',
            'path' => '/settings/manual-management',
            'sort_order' => 5,
        ],
        [
            'name' => 'Audit Log',
            'key' => 'mm6.audit_log_settings',
            'path' => '/settings/audit-logs',
            'sort_order' => 6,
        ],
        [
            'name' => 'Signature Setting',
            'key' => 'mm6.signature_settings',
            'path' => '/settings/signatures',
            'sort_order' => 7,
        ],
    ];

    private $masterDataMenu = [
        'name' => 'Master Data',
        'key' => 'mm6.master_data',
        'path' => null,
        'sort_order' => 3,
    ];

    private $masterDataChildren = [
        [
            'name' => 'Sub-Consultant List',
            'key' => 'mm6.sub_consultant_settings',
            'path' => '/settings/sub-consultants',
            'sort_order' => 1,
        ],
        [
            'name' => 'Sub-Consultant Type',
            'key' => 'mm6.sub_consultant_type_settings',
            'path' => '/settings/sub-consultant-types',
            'sort_order' => 2,
        ],
        [
            'name' => 'Committee Setting',
            'key' => 'mm6.committee_settings',
            'path' => '/settings/committees',
            'sort_order' => 3,
        ],
        [
            'name' => 'Supplier List',
            'key' => 'mm6.supplier_settings',
            'path' => '/settings/suppliers',
            'sort_order' => 4,
        ],
        [
            'name' => 'Supplier Type',
            'key' => 'mm6.supplier_type_settings',
            'path' => '/settings/supplier-types',
            'sort_order' => 5,
        ],
        [
            'name' => 'Project Type',
            'key' => 'mm6.project_type_settings',
            'path' => '/settings/project-types',
            'sort_order' => 6,
        ],
        [
            'name' => 'Discipline',
            'key' => 'mm6.discipline_settings',
            'path' => '/settings/disciplines',
            'sort_order' => 7,
        ],
        [
            'name' => 'Project Detail',
            'key' => 'mm6.project_detail_settings',
            'path' => '/settings/project-details',
            'sort_order' => 8,
        ],
    ];

    public function up()
    {
        if (!Schema::hasTable('main_menus') || !Schema::hasTable('menus')) {
            return;
        }

        DB::transaction(function () {
            $settingMainMenuId = $this->ensureMainMenu(['Setting', 'Settings'], 'Setting', 7);
            $this->ensureMainMenu(['Anti-Corruption Forms', 'Anti-Corruption Form', 'Acp'], 'Anti-Corruption Forms', 6);

            foreach ($this->rootSettingMenus as $menu) {
                $this->upsertMenu($settingMainMenuId, $menu, null);
            }

            $masterDataMenuId = $this->upsertMenu($settingMainMenuId, $this->masterDataMenu, null);
            $childMenuIds = [];
            foreach ($this->masterDataChildren as $menu) {
                $childMenuIds[] = $this->upsertMenu($settingMainMenuId, $menu, $masterDataMenuId);
            }

            $this->syncMasterDataPermissionRows($masterDataMenuId, $childMenuIds);
        });
    }

    public function down()
    {
        if (!Schema::hasTable('main_menus') || !Schema::hasTable('menus')) {
            return;
        }

        DB::transaction(function () {
            $settingMainMenuId = $this->mainMenuIdByNames(['Setting', 'Settings']);
            if ($settingMainMenuId) {
                $this->updateMainMenu($settingMainMenuId, 'Setting', 6);
            }

            $antiCorruptionMainMenuId = $this->mainMenuIdByNames(['Anti-Corruption Forms', 'Anti-Corruption Form', 'Acp']);
            if ($antiCorruptionMainMenuId) {
                $this->updateMainMenu($antiCorruptionMainMenuId, 'Acp', 6);
            }

            if ($settingMainMenuId) {
                $legacyRootMenus = [
                    'mm6.sub_consultant_settings' => ['name' => 'Sub-Consultant Setting', 'sort_order' => 3],
                    'mm6.committee_settings' => ['name' => 'Committee Setting', 'sort_order' => 4],
                    'mm6.supplier_settings' => ['name' => 'Suplier Setting', 'sort_order' => 5],
                    'mm6.sub_consultant_type_settings' => ['name' => 'Sub-Consultant Type', 'sort_order' => 5],
                    'mm6.main_menu' => ['name' => 'Main Menu', 'sort_order' => 6],
                    'mm6.supplier_type_settings' => ['name' => 'Supplier Type', 'sort_order' => 6],
                    'mm6.project_type_settings' => ['name' => 'Project Type', 'sort_order' => 7],
                    'mm6.discipline_settings' => ['name' => 'Discipline', 'sort_order' => 8],
                    'mm6.project_detail_settings' => ['name' => 'Project Detail', 'sort_order' => 9],
                    'mm6.signature_settings' => ['name' => 'Signature Setting', 'sort_order' => 10],
                    'mm6.manual_management' => ['name' => 'Manual Management', 'sort_order' => 10],
                    'mm6.audit_log_settings' => ['name' => 'Audit Log', 'sort_order' => 11],
                ];

                foreach ($legacyRootMenus as $key => $values) {
                    $this->updateMenuByKey($key, [
                        'main_menu_id' => $settingMainMenuId,
                        'name' => $values['name'],
                        'parent_id' => null,
                        'sort_order' => $values['sort_order'],
                    ]);
                }
            }

            $masterDataMenuId = $this->menuIdByKey($this->masterDataMenu['key']);
            if ($masterDataMenuId) {
                if (Schema::hasTable('menu_permissions')) {
                    $this->softDeleteRows('menu_permissions', 'menu_id', [$masterDataMenuId]);
                }
                $this->softDeleteRows('menus', 'id', [$masterDataMenuId]);
            }
        });
    }

    private function ensureMainMenu(array $names, string $canonicalName, int $sortOrder): int
    {
        $mainMenuId = $this->mainMenuIdByNames($names);

        if ($mainMenuId) {
            $this->updateMainMenu($mainMenuId, $canonicalName, $sortOrder);
            return $mainMenuId;
        }

        $values = [
            'name' => $canonicalName,
            'created_at' => now(),
            'updated_at' => now(),
        ];

        if (Schema::hasColumn('main_menus', 'sort_order')) {
            $values['sort_order'] = $sortOrder;
        }
        if (Schema::hasColumn('main_menus', 'deleted_at')) {
            $values['deleted_at'] = null;
        }

        return (int) DB::table('main_menus')->insertGetId($values);
    }

    private function mainMenuIdByNames(array $names): ?int
    {
        $query = DB::table('main_menus')->whereIn('name', $names);
        if (Schema::hasColumn('main_menus', 'deleted_at')) {
            $active = (clone $query)->whereNull('deleted_at')->orderBy('id')->first();
            if ($active) {
                return (int) $active->id;
            }
        }

        $row = $query->orderBy('id')->first();
        return $row ? (int) $row->id : null;
    }

    private function updateMainMenu(int $id, string $name, int $sortOrder): void
    {
        $values = [
            'name' => $name,
            'updated_at' => now(),
        ];

        if (Schema::hasColumn('main_menus', 'sort_order')) {
            $values['sort_order'] = $sortOrder;
        }
        if (Schema::hasColumn('main_menus', 'deleted_at')) {
            $values['deleted_at'] = null;
        }

        DB::table('main_menus')->where('id', $id)->update($values);
    }

    private function upsertMenu(int $mainMenuId, array $menu, ?int $parentId): int
    {
        $target = $this->findMenuTarget($mainMenuId, $menu);
        $values = [
            'main_menu_id' => $mainMenuId,
            'name' => $menu['name'],
            'updated_at' => now(),
        ];

        if (Schema::hasColumn('menus', 'parent_id')) {
            $values['parent_id'] = $parentId;
        }
        if (Schema::hasColumn('menus', 'sort_order')) {
            $values['sort_order'] = $menu['sort_order'];
        }
        if (Schema::hasColumn('menus', 'key')) {
            $values['key'] = $menu['key'];
        }
        if (Schema::hasColumn('menus', 'path')) {
            $values['path'] = $menu['path'];
        }
        if (Schema::hasColumn('menus', 'deleted_at')) {
            $values['deleted_at'] = null;
        }

        if ($target) {
            DB::table('menus')->where('id', $target->id)->update($values);
            return (int) $target->id;
        }

        $values['created_at'] = now();
        return (int) DB::table('menus')->insertGetId($values);
    }

    private function findMenuTarget(int $mainMenuId, array $menu)
    {
        if (!empty($menu['key']) && Schema::hasColumn('menus', 'key')) {
            $target = DB::table('menus')->where('key', $menu['key'])->orderBy('id')->first();
            if ($target) {
                return $target;
            }
        }

        if (array_key_exists('path', $menu) && $menu['path'] !== null && Schema::hasColumn('menus', 'path')) {
            $target = DB::table('menus')->where('path', $menu['path'])->orderBy('id')->first();
            if ($target) {
                return $target;
            }
        }

        return DB::table('menus')
            ->where('main_menu_id', $mainMenuId)
            ->where('name', $menu['name'])
            ->orderBy('id')
            ->first();
    }

    private function updateMenuByKey(string $key, array $values): void
    {
        if (!Schema::hasColumn('menus', 'key')) {
            return;
        }

        $updateValues = [
            'updated_at' => now(),
        ];

        foreach ($values as $column => $value) {
            if (Schema::hasColumn('menus', $column)) {
                $updateValues[$column] = $value;
            }
        }

        if (Schema::hasColumn('menus', 'deleted_at')) {
            $updateValues['deleted_at'] = null;
        }

        DB::table('menus')->where('key', $key)->update($updateValues);
    }

    private function menuIdByKey(string $key): ?int
    {
        if (!Schema::hasColumn('menus', 'key')) {
            return null;
        }

        $row = DB::table('menus')->where('key', $key)->orderBy('id')->first();
        return $row ? (int) $row->id : null;
    }

    private function syncMasterDataPermissionRows(int $masterDataMenuId, array $childMenuIds): void
    {
        if (!Schema::hasTable('permissions') || !Schema::hasTable('menu_permissions') || empty($childMenuIds)) {
            return;
        }

        $permissionsQuery = DB::table('permissions')->select('id');
        if (Schema::hasColumn('permissions', 'deleted_at')) {
            $permissionsQuery->whereNull('deleted_at');
        }

        $permissionIds = $permissionsQuery->pluck('id')->map(function ($id) {
            return (int) $id;
        })->toArray();

        foreach ($permissionIds as $permissionId) {
            $actions = $this->aggregatePermissionActions($permissionId, $childMenuIds);
            $existing = DB::table('menu_permissions')
                ->where('permission_id', $permissionId)
                ->where('menu_id', $masterDataMenuId)
                ->first();

            $values = array_merge($actions, [
                'permission_id' => $permissionId,
                'menu_id' => $masterDataMenuId,
                'update_by' => 'settings-menu-tree-sync',
                'updated_at' => now(),
            ]);

            if (Schema::hasColumn('menu_permissions', 'deleted_at')) {
                $values['deleted_at'] = null;
            }

            if ($existing) {
                DB::table('menu_permissions')->where('id', $existing->id)->update($values);
                continue;
            }

            $values['create_by'] = 'settings-menu-tree-sync';
            $values['created_at'] = now();
            DB::table('menu_permissions')->insert($values);
        }
    }

    private function aggregatePermissionActions(int $permissionId, array $childMenuIds): array
    {
        $query = DB::table('menu_permissions')
            ->where('permission_id', $permissionId)
            ->whereIn('menu_id', $childMenuIds);

        if (Schema::hasColumn('menu_permissions', 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        $actions = array_fill_keys($this->permissionColumns, 0);
        foreach ($query->get() as $row) {
            $view = $this->value($row, 'view') || $this->value($row, 'view_own') || $this->value($row, 'view_all');
            $edit = $this->value($row, 'edit') || $this->value($row, 'edit_own') || $this->value($row, 'edit_all');
            $save = $this->value($row, 'save') || $this->value($row, 'create') || $this->value($row, 'edit_own') || $this->value($row, 'edit_all');
            $delete = $this->value($row, 'delete') || $this->value($row, 'delete_own') || $this->value($row, 'delete_all');

            $actions['view'] = $actions['view'] || $view ? 1 : 0;
            $actions['edit'] = $actions['edit'] || $edit ? 1 : 0;
            $actions['save'] = $actions['save'] || $save ? 1 : 0;
            $actions['delete'] = $actions['delete'] || $delete ? 1 : 0;
            $actions['create'] = $actions['create'] || $this->value($row, 'create') ? 1 : 0;
            $actions['view_own'] = $actions['view_own'] || $this->value($row, 'view_own') ? 1 : 0;
            $actions['edit_own'] = $actions['edit_own'] || $this->value($row, 'edit_own') ? 1 : 0;
            $actions['delete_own'] = $actions['delete_own'] || $this->value($row, 'delete_own') ? 1 : 0;
            $actions['view_all'] = $actions['view_all'] || $this->value($row, 'view_all') ? 1 : 0;
            $actions['edit_all'] = $actions['edit_all'] || $this->value($row, 'edit_all') ? 1 : 0;
            $actions['delete_all'] = $actions['delete_all'] || $this->value($row, 'delete_all') ? 1 : 0;
        }

        return $actions;
    }

    private function value($row, string $column): bool
    {
        return isset($row->{$column}) && (int) $row->{$column} === 1;
    }

    private function softDeleteRows(string $table, string $idColumn, array $ids): void
    {
        if (empty($ids)) {
            return;
        }

        if (Schema::hasColumn($table, 'deleted_at')) {
            DB::table($table)->whereIn($idColumn, $ids)->update([
                'deleted_at' => now(),
                'updated_at' => now(),
            ]);
            return;
        }

        DB::table($table)->whereIn($idColumn, $ids)->delete();
    }
}
