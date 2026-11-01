<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::table('leed_reviews', function (Blueprint $table) {
            if (!Schema::hasColumn('leed_reviews', 'project_stage')) {
                $table->string('project_stage', 255)->nullable()->after('prepared_by');
            }
            if (!Schema::hasColumn('leed_reviews', 'reviewed_by')) {
                $table->string('reviewed_by', 255)->nullable()->after('status');
            }
            if (!Schema::hasColumn('leed_reviews', 'reviewed_by_date')) {
                $table->dateTime('reviewed_by_date')->nullable()->after('reviewed_by');
            }
            if (!Schema::hasColumn('leed_reviews', 'reviewed_by_status')) {
                $table->string('reviewed_by_status', 50)->nullable()->after('reviewed_by_date');
            }

            if (!Schema::hasColumn('leed_reviews', 'responded_by')) {
                $table->string('responded_by', 255)->nullable()->after('reviewed_by_status');
            }
            if (!Schema::hasColumn('leed_reviews', 'responded_by_date')) {
                $table->dateTime('responded_by_date')->nullable()->after('responded_by');
            }
            if (!Schema::hasColumn('leed_reviews', 'responded_by_status')) {
                $table->string('responded_by_status', 50)->nullable()->after('responded_by_date');
            }

            if (!Schema::hasColumn('leed_reviews', 'signed_by')) {
                $table->string('signed_by', 255)->nullable()->after('responded_by_status');
            }
            if (!Schema::hasColumn('leed_reviews', 'signed_by_date')) {
                $table->dateTime('signed_by_date')->nullable()->after('signed_by');
            }
            if (!Schema::hasColumn('leed_reviews', 'signed_by_status')) {
                $table->string('signed_by_status', 50)->nullable()->after('signed_by_date');
            }

            if (!Schema::hasColumn('leed_reviews', 'signed_by_tl')) {
                $table->string('signed_by_tl', 255)->nullable()->after('signed_by_status');
            }
            if (!Schema::hasColumn('leed_reviews', 'signed_by_tl_date')) {
                $table->dateTime('signed_by_tl_date')->nullable()->after('signed_by_tl');
            }
            if (!Schema::hasColumn('leed_reviews', 'signed_by_tl_status')) {
                $table->string('signed_by_tl_status', 50)->nullable()->after('signed_by_tl_date');
            }

            if (!Schema::hasColumn('leed_reviews', 'acknowledged_by')) {
                $table->string('acknowledged_by', 255)->nullable()->after('signed_by_tl_status');
            }
            if (!Schema::hasColumn('leed_reviews', 'acknowledged_by_date')) {
                $table->dateTime('acknowledged_by_date')->nullable()->after('acknowledged_by');
            }
            if (!Schema::hasColumn('leed_reviews', 'acknowledged_by_status')) {
                $table->string('acknowledged_by_status', 50)->nullable()->after('acknowledged_by_date');
            }
        });
    }

    public function down()
    {
        Schema::table('leed_reviews', function (Blueprint $table) {
            $columns = [
                'project_stage',
                'reviewed_by',
                'reviewed_by_date',
                'reviewed_by_status',
                'responded_by',
                'responded_by_date',
                'responded_by_status',
                'signed_by',
                'signed_by_date',
                'signed_by_status',
                'signed_by_tl',
                'signed_by_tl_date',
                'signed_by_tl_status',
                'acknowledged_by',
                'acknowledged_by_date',
                'acknowledged_by_status',
            ];

            foreach ($columns as $column) {
                if (Schema::hasColumn('leed_reviews', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
