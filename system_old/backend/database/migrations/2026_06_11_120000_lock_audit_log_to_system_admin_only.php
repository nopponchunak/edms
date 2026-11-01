<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class LockAuditLogToSystemAdminOnly extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('menus') || !Schema::hasTable('menu_permissions')) {
            return;
        }

        $menuIds = DB::table('menus')
            ->where('key', 'mm6.audit_log_settings')
            ->orWhere('path', '/settings/audit-logs')
            ->pluck('id')
            ->unique()
            ->values()
            ->toArray();

        if (empty($menuIds)) {
            return;
        }

        if (Schema::hasColumn('menu_permissions', 'deleted_at')) {
            $values = ['deleted_at' => now()];

            if (Schema::hasColumn('menu_permissions', 'updated_at')) {
                $values['updated_at'] = now();
            }
            if (Schema::hasColumn('menu_permissions', 'update_by')) {
                $values['update_by'] = 'audit-log-admin-lock';
            }

            DB::table('menu_permissions')
                ->whereIn('menu_id', $menuIds)
                ->whereNull('deleted_at')
                ->update($values);

            return;
        }

        DB::table('menu_permissions')->whereIn('menu_id', $menuIds)->delete();
    }

    public function down()
    {
        // Intentionally no-op. Audit Log access must not be restored from permissions.
    }
}
