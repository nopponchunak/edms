<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SoftDeleteOrphanMenuPermissions extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('menu_permissions') || !Schema::hasTable('permissions')) {
            return;
        }

        DB::transaction(function () {
            $orphanPermissionIds = DB::table('menu_permissions as mp')
                ->leftJoin('permissions as p', 'p.id', '=', 'mp.permission_id')
                ->whereNull('p.id')
                ->when(Schema::hasColumn('menu_permissions', 'deleted_at'), function ($query) {
                    $query->whereNull('mp.deleted_at');
                })
                ->pluck('mp.permission_id')
                ->map(function ($id) {
                    return (int) $id;
                })
                ->unique()
                ->values()
                ->toArray();

            foreach ($orphanPermissionIds as $permissionId) {
                if ($this->activeUserCountForPermission($permissionId) > 0) {
                    continue;
                }

                $query = DB::table('menu_permissions')->where('permission_id', $permissionId);
                if (Schema::hasColumn('menu_permissions', 'deleted_at')) {
                    $query->whereNull('deleted_at')->update([
                        'deleted_at' => now(),
                        'updated_at' => now(),
                        'update_by' => 'orphan-menu-permission-cleanup',
                    ]);
                    continue;
                }

                $query->delete();
            }
        });
    }

    public function down()
    {
        // Intentionally not restored: these rows point to missing permissions and cannot be used by active users.
    }

    private function activeUserCountForPermission(int $permissionId): int
    {
        if (!Schema::hasTable('users') || !Schema::hasColumn('users', 'permission_id')) {
            return 0;
        }

        $query = DB::table('users')->where('permission_id', $permissionId);
        if (Schema::hasColumn('users', 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        return (int) $query->count();
    }
}
