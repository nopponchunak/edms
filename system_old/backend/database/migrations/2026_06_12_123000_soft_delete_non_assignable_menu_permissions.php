<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SoftDeleteNonAssignableMenuPermissions extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('menus') || !Schema::hasTable('menu_permissions')) {
            return;
        }

        DB::transaction(function () {
            $menuIds = $this->nonAssignableMenuIds();
            if (empty($menuIds)) {
                return;
            }

            $query = DB::table('menu_permissions')->whereIn('menu_id', $menuIds);

            if (Schema::hasColumn('menu_permissions', 'deleted_at')) {
                $values = ['deleted_at' => now()];

                if (Schema::hasColumn('menu_permissions', 'updated_at')) {
                    $values['updated_at'] = now();
                }
                if (Schema::hasColumn('menu_permissions', 'update_by')) {
                    $values['update_by'] = 'non-assignable-menu-permission-cleanup';
                }

                $query->whereNull('deleted_at')->update($values);
                return;
            }

            $query->delete();
        });
    }

    public function down()
    {
        if (
            !Schema::hasTable('menu_permissions') ||
            !Schema::hasColumn('menu_permissions', 'deleted_at') ||
            !Schema::hasColumn('menu_permissions', 'update_by')
        ) {
            return;
        }

        $values = ['deleted_at' => null];
        if (Schema::hasColumn('menu_permissions', 'updated_at')) {
            $values['updated_at'] = now();
        }

        DB::table('menu_permissions')
            ->where('update_by', 'non-assignable-menu-permission-cleanup')
            ->whereNotNull('deleted_at')
            ->update($values);
    }

    private function nonAssignableMenuIds(): array
    {
        $hasMenuDeletedAt = Schema::hasColumn('menus', 'deleted_at');

        $query = DB::table('menus as m')
            ->leftJoin('menus as child', function ($join) use ($hasMenuDeletedAt) {
                $join->on('child.parent_id', '=', 'm.id');
                if ($hasMenuDeletedAt) {
                    $join->whereNull('child.deleted_at');
                }
            })
            ->where(function ($where) use ($hasMenuDeletedAt) {
                $where
                    ->whereNull('m.path')
                    ->orWhereRaw("TRIM(COALESCE(m.path, '')) = ''")
                    ->orWhereNotNull('child.id')
                    ->orWhere('m.key', 'mm6.audit_log_settings')
                    ->orWhere('m.path', '/settings/audit-logs');

                if ($hasMenuDeletedAt) {
                    $where->orWhereNotNull('m.deleted_at');
                }
            })
            ->select('m.id')
            ->distinct();

        return $query
            ->pluck('m.id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->toArray();
    }
}
