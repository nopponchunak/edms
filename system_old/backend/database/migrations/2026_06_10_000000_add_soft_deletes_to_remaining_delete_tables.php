<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddSoftDeletesToRemainingDeleteTables extends Migration
{
    private array $tables = [
        'committee_employees',
        'design_reviews',
        'design_review_answers',
        'design_review_assignments',
        'design_review_documents',
        'design_review_signatures',
        'disciplines',
        'order_purchases',
        'order_purchase_items',
        'project_details',
        'project_quality_assurance_plan_documents',
        'project_quality_assurance_plan_schedules',
        'project_types',
        'purchase_order_items',
    ];

    public function up()
    {
        foreach ($this->tables as $tableName) {
            if (! Schema::hasTable($tableName) || Schema::hasColumn($tableName, 'deleted_at')) {
                continue;
            }

            Schema::table($tableName, function (Blueprint $table) {
                $table->softDeletes();
            });
        }
    }

    public function down()
    {
        foreach ($this->tables as $tableName) {
            if (! Schema::hasTable($tableName) || ! Schema::hasColumn($tableName, 'deleted_at')) {
                continue;
            }

            Schema::table($tableName, function (Blueprint $table) {
                $table->dropSoftDeletes();
            });
        }
    }
}
