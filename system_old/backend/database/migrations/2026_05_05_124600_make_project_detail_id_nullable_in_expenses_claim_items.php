<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('expenses_claim_items') || !Schema::hasColumn('expenses_claim_items', 'project_detail_id')) {
            return;
        }

        DB::statement('ALTER TABLE expenses_claim_items MODIFY project_detail_id INT UNSIGNED NULL');
    }

    public function down()
    {
        if (!Schema::hasTable('expenses_claim_items') || !Schema::hasColumn('expenses_claim_items', 'project_detail_id')) {
            return;
        }

        DB::statement('ALTER TABLE expenses_claim_items MODIFY project_detail_id INT UNSIGNED NOT NULL');
    }
};
