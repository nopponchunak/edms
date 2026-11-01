<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AddCompletedLegacyDesignReviewMenu extends Migration
{
    private $menuKey = 'mm1.design_review.legacy_design_review_completed_records';
    private $path = '/legacy-design-review/completed-records';
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
        if (! Schema::hasTable('menus')) {
            return;
        }

        DB::transaction(function () {
            $designReviewMenu = $this->designReviewMenu();
            if (! $designReviewMenu) {
                return;
            }

            $menuId = $this->upsertMenu((int) $designReviewMenu->main_menu_id, (int) $designReviewMenu->id);
            $this->restoreReadOnlyPermissions($menuId);
        });
    }

    public function down()
    {
        if (! Schema::hasTable('menus')) {
            return;
        }

        $menu = DB::table('menus')
            ->where(function ($query) {
                if (Schema::hasColumn('menus', 'key')) {
                    $query->where('key', $this->menuKey);
                }
                if (Schema::hasColumn('menus', 'path')) {
                    $query->orWhere('path', $this->path);
                }
            })
            ->first();

        if (! $menu) {
            return;
        }

        if (Schema::hasTable('menu_permissions')) {
            $permissionQuery = DB::table('menu_permissions')->where('menu_id', $menu->id);
            if (Schema::hasColumn('menu_permissions', 'deleted_at')) {
                $permissionQuery->update([
                    'deleted_at' => now(),
                    'updated_at' => now(),
                ]);
            } else {
                $permissionQuery->delete();
            }
        }

        $menuQuery = DB::table('menus')->where('id', $menu->id);
        if (Schema::hasColumn('menus', 'deleted_at')) {
            $menuQuery->update([
                'deleted_at' => now(),
                'updated_at' => now(),
            ]);
        } else {
            $menuQuery->delete();
        }
    }

    private function designReviewMenu()
    {
        $query = DB::table('menus')
            ->where(function ($q) {
                if (Schema::hasColumn('menus', 'key')) {
                    $q->where('key', 'mm1.design_review');
                }
                $q->orWhere('name', '20 - FORM MTDD')
                    ->orWhere('name', 'Design Review');
            });

        if (Schema::hasColumn('menus', 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        return $query->orderBy('id')->first();
    }

    private function upsertMenu(int $mainMenuId, int $parentId): int
    {
        $target = DB::table('menus')
            ->where(function ($query) {
                if (Schema::hasColumn('menus', 'key')) {
                    $query->where('key', $this->menuKey);
                }
                if (Schema::hasColumn('menus', 'path')) {
                    $query->orWhere('path', $this->path);
                }
            })
            ->first();

        $values = [
            'main_menu_id' => $mainMenuId,
            'name' => 'Legacy Design Review Records',
            'updated_at' => now(),
        ];

        if (Schema::hasColumn('menus', 'parent_id')) {
            $values['parent_id'] = $parentId;
        }
        if (Schema::hasColumn('menus', 'key')) {
            $values['key'] = $this->menuKey;
        }
        if (Schema::hasColumn('menus', 'path')) {
            $values['path'] = $this->path;
        }
        if (Schema::hasColumn('menus', 'sort_order')) {
            $values['sort_order'] = 2;
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

    private function restoreReadOnlyPermissions(int $menuId): void
    {
        if (! Schema::hasTable('menu_permissions')) {
            return;
        }

        $sourceMenu = $this->sourcePermissionMenu();
        if (! $sourceMenu) {
            return;
        }

        $sourceRows = DB::table('menu_permissions')->where('menu_id', $sourceMenu->id)->get();
        foreach ($sourceRows as $sourceRow) {
            $this->upsertPermissionRow((int) $sourceRow->permission_id, $menuId, $this->readOnlyActionsFrom($sourceRow));
        }
    }

    private function sourcePermissionMenu()
    {
        $query = DB::table('menus')
            ->where(function ($query) {
                if (Schema::hasColumn('menus', 'key')) {
                    $query->where('key', 'mm1.design_review.design_workflow')
                        ->orWhere('key', 'mm1.design_review');
                }
                if (Schema::hasColumn('menus', 'path')) {
                    $query->orWhere('path', '/design-workflow');
                }
            });

        if (Schema::hasColumn('menus', 'path')) {
            $query->orderByRaw("CASE WHEN path = '/design-workflow' THEN 0 ELSE 1 END");
        }

        return $query->orderBy('id')->first();
    }

    private function readOnlyActionsFrom($sourceRow): array
    {
        $viewOwn = (int) ($sourceRow->view_own ?? 0);
        $viewAll = (int) ($sourceRow->view_all ?? 0);
        $view = (int) ($sourceRow->view ?? 0);
        $canView = ($viewOwn === 1 || $viewAll === 1 || $view === 1) ? 1 : 0;

        return [
            'view' => $canView,
            'view_own' => $viewOwn,
            'view_all' => $viewAll,
        ];
    }

    private function upsertPermissionRow(int $permissionId, int $menuId, array $actions): void
    {
        $values = [
            'permission_id' => $permissionId,
            'menu_id' => $menuId,
            'updated_at' => now(),
        ];

        if (Schema::hasColumn('menu_permissions', 'update_by')) {
            $values['update_by'] = 'completed-legacy-design-review-menu';
        }
        if (Schema::hasColumn('menu_permissions', 'create_by')) {
            $values['create_by'] = 'completed-legacy-design-review-menu';
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
}
