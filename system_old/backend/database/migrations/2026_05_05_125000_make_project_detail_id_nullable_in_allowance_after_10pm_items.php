<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('allowance_after_10pm_items') || !Schema::hasColumn('allowance_after_10pm_items', 'project_detail_id')) {
            return;
        }

        DB::statement('ALTER TABLE allowance_after_10pm_items MODIFY project_detail_id INT UNSIGNED NULL');
    }

    public function down()
    {
        if (!Schema::hasTable('allowance_after_10pm_items') || !Schema::hasColumn('allowance_after_10pm_items', 'project_detail_id')) {
            return;
        }

        DB::statement('ALTER TABLE allowance_after_10pm_items MODIFY project_detail_id INT UNSIGNED NOT NULL');
    }
};
