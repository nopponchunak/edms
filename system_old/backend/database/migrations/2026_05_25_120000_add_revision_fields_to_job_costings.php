<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('job_costings', function (Blueprint $table) {
            if (!Schema::hasColumn('job_costings', 'revision_no')) {
                $table->integer('revision_no')->default(0)->after('revision_id');
            }
            if (!Schema::hasColumn('job_costings', 'revision_label')) {
                $table->string('revision_label')->nullable()->after('revision_no');
            }
        });

        // Change phase from enum to string to support Transportation 'S' phase
        DB::statement("ALTER TABLE job_costings MODIFY COLUMN phase VARCHAR(10) NULL");

        // Set default revision_label for existing rows
        DB::table('job_costings')
            ->whereNull('revision_label')
            ->update(['revision_label' => 'Original', 'revision_no' => 0]);
    }

    public function down(): void
    {
        Schema::table('job_costings', function (Blueprint $table) {
            if (Schema::hasColumn('job_costings', 'revision_no')) {
                $table->dropColumn('revision_no');
            }
            if (Schema::hasColumn('job_costings', 'revision_label')) {
                $table->dropColumn('revision_label');
            }
        });
    }
};
