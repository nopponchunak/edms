<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('fee_sheet_revisions') && ! Schema::hasColumn('fee_sheet_revisions', 'mt_project_no')) {
            Schema::table('fee_sheet_revisions', function (Blueprint $table) {
                $table->string('mt_project_no')->nullable()->after('proposal_project_reference_id');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('fee_sheet_revisions') && Schema::hasColumn('fee_sheet_revisions', 'mt_project_no')) {
            Schema::table('fee_sheet_revisions', function (Blueprint $table) {
                $table->dropColumn('mt_project_no');
            });
        }
    }
};
