<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class RestoreDesignWorkflowMenuPermissions extends Migration
{
    private $menuKey = 'mm1.design_review.design_workflow';
    private $legacyMenuKey = 'mm1.design_workflow';
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
        if (!Schema::hasTable('main_menus') || !Schema::hasTable('menus')) {
            return;
        }

        DB::transaction(function () {
            $projects = $this->projectsMainMenu();
            if (!$projects) {
                return;
            }

            $designReview = $this->designReviewMenu((int) $projects->id);
            if (!$designReview) {
                return;
            }

            $menuId = $this->upsertDesignWorkflowMenu((int) $projects->id, (int) $designReview->id);
            $this->restorePermissionRows($menuId);
        });
    }

    public function down()
    {
        if (!Schema::hasTable('menus')) {
            return;
        }

        $menu = DB::table('menus')
            ->where('key', $this->menuKey)
            ->orWhere('key', $this->legacyMenuKey)
            ->orWhere('path', '/design-workflow')
            ->orWhere('name', 'Design Workflow')
            ->first();
        if (!$menu) {
            return;
        }

        if (Schema::hasTable('menu_permissions')) {
            DB::table('menu_permissions')->where('menu_id', $menu->id)->update([
                'deleted_at' => now(),
                'updated_at' => now(),
            ]);
        }

        DB::table('menus')->where('id', $menu->id)->update([
            'deleted_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function projectsMainMenu()
    {
        $query = DB::table('main_menus')->where('name', 'Projects');
        if (Schema::hasColumn('main_menus', 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        return $query->orderBy('id')->first();
    }

    private function designReviewMenu($projectsMainMenuId)
    {
        $query = DB::table('menus')
            ->where('main_menu_id', $projectsMainMenuId)
            ->where(function ($q) {
                $q->where('name', 'Design Review');
                if (Schema::hasColumn('menus', 'key')) {
                    $q->orWhere('key', 'mm1.design_review');
                }
            });

        if (Schema::hasColumn('menus', 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        return $query->orderBy('id')->first();
    }

    private function upsertDesignWorkflowMenu($projectsMainMenuId, $designReviewMenuId)
    {
        $this->syncProjectMenuSortOrders($projectsMainMenuId);

        $target = DB::table('menus')
            ->where(function ($query) {
                $query->where('key', $this->menuKey)
                    ->orWhere('key', $this->legacyMenuKey)
                    ->orWhere('path', '/design-workflow')
                    ->orWhere('name', 'Design Workflow');
            })
            ->orderBy('id')
            ->first();

        $values = [
            'main_menu_id' => $projectsMainMenuId,
            'name' => 'Design Workflow',
            'updated_at' => now(),
        ];

        if (Schema::hasColumn('menus', 'parent_id')) {
            $values['parent_id'] = $designReviewMenuId;
        }
        if (Schema::hasColumn('menus', 'sort_order')) {
            $values['sort_order'] = 6;
        }
        if (Schema::hasColumn('menus', 'key')) {
            $values['key'] = $this->menuKey;
        }
        if (Schema::hasColumn('menus', 'path')) {
            $values['path'] = '/design-workflow';
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

    private function syncProjectMenuSortOrders($projectsMainMenuId)
    {
        if (!Schema::hasColumn('menus', 'sort_order')) {
            return;
        }

        $this->updateMenuSortOrder($projectsMainMenuId, ['mm1.design_review'], ['Design Review'], 2);
        $this->updateMenuSortOrder($projectsMainMenuId, ['mm1.engineering_audit_study_review'], ['Engineering Audit/Study Review'], 3);
        $this->updateMenuSortOrder($projectsMainMenuId, ['mm1.value_engineering'], ['Value Engineering'], 4);
        $this->updateMenuSortOrder($projectsMainMenuId, ['mm1.leed_review'], ['LEED Review'], 5);
    }

    private function updateMenuSortOrder($mainMenuId, array $keys, array $names, $sortOrder)
    {
        $query = DB::table('menus')
            ->where('main_menu_id', $mainMenuId)
            ->where(function ($q) use ($keys, $names) {
                if (Schema::hasColumn('menus', 'key')) {
                    $q->whereIn('key', $keys);
                }
                $q->orWhereIn('name', $names);
            });

        $query->update([
            'sort_order' => $sortOrder,
            'updated_at' => now(),
        ]);
    }

    private function restorePermissionRows($menuId)
    {
        if (!Schema::hasTable('permissions') || !Schema::hasTable('menu_permissions')) {
            return;
        }

        $sourceMenu = DB::table('menus')->where('key', 'mm1.design_review')->first();
        if ($sourceMenu) {
            $restoredFromSource = false;
            $sourceRows = DB::table('menu_permissions')->where('menu_id', $sourceMenu->id)->get();
            foreach ($sourceRows as $sourceRow) {
                if (!$this->permissionExists($sourceRow->permission_id)) {
                    continue;
                }

                $this->upsertPermissionRow((int) $sourceRow->permission_id, $menuId, $this->readOnlyActionsFrom($sourceRow));
                $restoredFromSource = true;
            }

            if ($restoredFromSource) {
                return;
            }
        }

        $visibleRoles = ['IT', 'Satff', 'Secretary 1', 'Secretary 2', 'IMS', 'AD-TL', 'DI-MD'];
        $permissions = DB::table('permissions')
            ->whereIn('name', $visibleRoles)
            ->when(Schema::hasColumn('permissions', 'deleted_at'), function ($query) {
                $query->whereNull('deleted_at');
            })
            ->get();

        foreach ($permissions as $permission) {
            $this->upsertPermissionRow((int) $permission->id, $menuId, [
                'view' => 1,
                'view_own' => in_array($permission->name, ['IT', 'Satff'], true) ? 1 : 0,
                'view_all' => 1,
            ]);
        }
    }

    private function readOnlyActionsFrom($sourceRow)
    {
        $viewOwn = (int) ($sourceRow->view_own ?? 0);
        $viewAll = (int) ($sourceRow->view_all ?? 0);
        $view = (int) ($sourceRow->view ?? 0);
        $canView = ($viewOwn === 1 || $viewAll === 1 || $view === 1) ? 1 : 0;

        return [
            'view' => $canView,
            'view_own' => $viewOwn,
            'view_all' => $viewAll,
            'edit' => 0,
            'save' => 0,
            'delete' => 0,
            'create' => 0,
            'edit_own' => 0,
            'delete_own' => 0,
            'edit_all' => 0,
            'delete_all' => 0,
        ];
    }

    private function upsertPermissionRow($permissionId, $menuId, array $actions)
    {
        $values = [
            'permission_id' => $permissionId,
            'menu_id' => $menuId,
            'update_by' => 'design-workflow-menu-restore',
            'updated_at' => now(),
        ];

        if (Schema::hasColumn('menu_permissions', 'create_by')) {
            $values['create_by'] = 'design-workflow-menu-restore';
        }
        if (Schema::hasColumn('menu_permissions', 'deleted_at')) {
            $values['deleted_at'] = null;
        }

        foreach ($this->permissionColumns as $column) {
            if (Schema::hasColumn('menu_permissions', $column)) {
                $values[$column] = (int) ($actions[$column] ?? 0);
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

        $values['created_at'] = now();
        DB::table('menu_permissions')->insert($values);
    }

    private function permissionExists($permissionId)
    {
        return DB::table('permissions')->where('id', $permissionId)->exists();
    }
}
