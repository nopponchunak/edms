<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddDepartmentToDesignReviewV2Tables extends Migration
{
    public function up()
    {
        $tables = [
            'concept_design_reviews',
            'schematic_design_reviews',
            'submission_reviews',
            'tender_reviews',
            'engineering_audit_reviews',
        ];

        foreach ($tables as $tableName) {
            if (! Schema::hasColumn($tableName, 'department')) {
                Schema::table($tableName, function (Blueprint $table) {
                    $table->string('department', 255)->nullable()->after('prepared_by');
                });
            }
        }
    }

    public function down()
    {
        $tables = [
            'concept_design_reviews',
            'schematic_design_reviews',
            'submission_reviews',
            'tender_reviews',
            'engineering_audit_reviews',
        ];

        foreach ($tables as $tableName) {
            if (Schema::hasColumn($tableName, 'department')) {
                Schema::table($tableName, function (Blueprint $table) {
                    $table->dropColumn('department');
                });
            }
        }
    }
}

