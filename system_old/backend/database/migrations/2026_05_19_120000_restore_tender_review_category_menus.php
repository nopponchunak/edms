<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class RestoreTenderReviewCategoryMenus extends Migration
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

    private $menus = [
        [
            'name' => 'Tender CSA',
            'key' => 'mm1.design_review.tender_csa',
            'path' => null,
            'sort_order' => 1,
            'children' => [
                [
                    'name' => 'Tender CSA Review',
                    'key' => 'mm1.design_review.tender_csa_review',
                    'path' => '/tender/csa/review',
                    'sort_order' => 1,
                ],
                [
                    'name' => 'Tender CSA Verification',
                    'key' => 'mm1.design_review.tender_csa_verification',
                    'path' => '/tender/csa/verification',
                    'sort_order' => 2,
                ],
            ],
        ],
        [
            'name' => 'Tender MEP',
            'key' => 'mm1.design_review.tender_mep',
            'path' => null,
            'sort_order' => 2,
            'children' => [
                [
                    'name' => 'Tender MEP Review',
                    'key' => 'mm1.design_review.tender_mep_review',
                    'path' => '/tender/mep/review',
                    'sort_order' => 1,
                ],
                [
                    'name' => 'Tender MEP Verification',
                    'key' => 'mm1.design_review.tender_mep_verification',
                    'path' => '/tender/mep/verification',
                    'sort_order' => 2,
                ],
            ],
        ],
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

            $tenderReviewId = $this->upsertTenderReviewMenu((int) $projects->id, (int) $designReview->id);
            $menuIds = [$tenderReviewId];

            foreach ($this->menus as $group) {
                $groupId = $this->upsertMenu((int) $projects->id, $tenderReviewId, $group);
                $menuIds[] = $groupId;

                foreach ($group['children'] as $child) {
                    $menuIds[] = $this->upsertMenu((int) $projects->id, $groupId, $child);
                }
            }

            $this->copyTenderPermissions($tenderReviewId, array_values(array_diff($menuIds, [$tenderReviewId])));
        });
    }

    public function down()
    {
        if (!Schema::hasTable('menus')) {
            return;
        }

        $keys = [
            'mm1.design_review.tender_csa',
            'mm1.design_review.tender_csa_review',
            'mm1.design_review.tender_csa_verification',
            'mm1.design_review.tender_mep',
            'mm1.design_review.tender_mep_review',
            'mm1.design_review.tender_mep_verification',
        ];

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

    private function upsertTenderReviewMenu($projectsMainMenuId, $designReviewMenuId)
    {
        $target = DB::table('menus')
            ->where(function ($query) {
                if (Schema::hasColumn('menus', 'key')) {
                    $query->where('key', 'mm1.design_review.tender_review');
                }
                $query->orWhere('path', '/tender-review')
                    ->orWhere('name', 'Tender Review');
            })
            ->orderBy('id')
            ->first();

        $values = [
            'main_menu_id' => $projectsMainMenuId,
            'name' => 'Tender Review',
            'updated_at' => now(),
        ];

        if (Schema::hasColumn('menus', 'parent_id')) {
            $values['parent_id'] = $designReviewMenuId;
        }
        if (Schema::hasColumn('menus', 'sort_order')) {
            $values['sort_order'] = 4;
        }
        if (Schema::hasColumn('menus', 'key')) {
            $values['key'] = 'mm1.design_review.tender_review';
        }
        if (Schema::hasColumn('menus', 'path')) {
            $values['path'] = '/tender-review';
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

    private function upsertMenu($mainMenuId, $parentId, array $menu)
    {
        $target = DB::table('menus')->where('key', $menu['key'])->orderBy('id')->first();

        if (!$target) {
            $target = DB::table('menus')
                ->where('main_menu_id', $mainMenuId)
                ->where('parent_id', $parentId)
                ->where('name', $menu['name'])
                ->orderBy('id')
                ->first();
        }

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

    private function copyTenderPermissions($sourceMenuId, array $targetMenuIds)
    {
        if (!Schema::hasTable('permissions') || !Schema::hasTable('menu_permissions') || empty($targetMenuIds)) {
            return;
        }

        $sourceRows = DB::table('menu_permissions')->where('menu_id', $sourceMenuId)->get();
        foreach ($sourceRows as $sourceRow) {
            if (!$this->permissionExists($sourceRow->permission_id)) {
                continue;
            }

            foreach ($targetMenuIds as $targetMenuId) {
                $this->upsertPermissionRow($sourceRow, $targetMenuId);
            }
        }
    }

    private function upsertPermissionRow($sourceRow, $targetMenuId)
    {
        $existing = DB::table('menu_permissions')
            ->where('permission_id', $sourceRow->permission_id)
            ->where('menu_id', $targetMenuId)
            ->first();

        $values = [
            'permission_id' => $sourceRow->permission_id,
            'menu_id' => $targetMenuId,
            'create_by' => $sourceRow->create_by ?? 'tender-menu-sync',
            'update_by' => 'tender-menu-sync',
            'deleted_at' => null,
            'updated_at' => now(),
        ];

        foreach ($this->permissionColumns as $column) {
            if (Schema::hasColumn('menu_permissions', $column)) {
                $values[$column] = $sourceRow->{$column} ?? 0;
            }
        }

        if ($existing) {
            DB::table('menu_permissions')->where('id', $existing->id)->update($values);
            return;
        }

        $values['created_at'] = now();
        DB::table('menu_permissions')->insert($values);
    }

    private function permissionExists($permissionId)
    {
        if (!$permissionId || !Schema::hasTable('permissions')) {
            return false;
        }

        return DB::table('permissions')->where('id', $permissionId)->exists();
    }
}
