<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const TABLES = [
        'concept_design_reviews',
        'schematic_design_reviews',
        'submission_reviews',
        'tender_csa_reviews',
        'tender_csa_verifications',
        'tender_mep_reviews',
        'tender_mep_verifications',
        'construction_validations',
    ];

    public function up(): void
    {
        foreach (self::TABLES as $tableName) {
            if (! Schema::hasTable($tableName) || Schema::hasColumn($tableName, 'stage')) {
                continue;
            }

            Schema::table($tableName, function (Blueprint $table) {
                $table->string('stage', 255)->nullable()->after('project_number');
            });
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $tableName) {
            if (! Schema::hasTable($tableName) || ! Schema::hasColumn($tableName, 'stage')) {
                continue;
            }

            Schema::table($tableName, function (Blueprint $table) {
                $table->dropColumn('stage');
            });
        }
    }
};
