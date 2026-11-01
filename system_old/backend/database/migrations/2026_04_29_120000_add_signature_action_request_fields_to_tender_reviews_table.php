<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tender_reviews', function (Blueprint $table) {
            if (!Schema::hasColumn('tender_reviews', 'reviewed_by')) {
                $table->string('reviewed_by', 255)->nullable()->after('review_method');
            }
            if (!Schema::hasColumn('tender_reviews', 'reviewed_by_date')) {
                $table->dateTime('reviewed_by_date')->nullable()->after('reviewed_by');
            }
            if (!Schema::hasColumn('tender_reviews', 'reviewed_by_status')) {
                $table->string('reviewed_by_status', 50)->nullable()->after('reviewed_by_date');
            }

            if (!Schema::hasColumn('tender_reviews', 'responded_by')) {
                $table->string('responded_by', 255)->nullable()->after('reviewed_by_status');
            }
            if (!Schema::hasColumn('tender_reviews', 'responded_by_date')) {
                $table->dateTime('responded_by_date')->nullable()->after('responded_by');
            }
            if (!Schema::hasColumn('tender_reviews', 'responded_by_status')) {
                $table->string('responded_by_status', 50)->nullable()->default('pending')->after('responded_by_date');
            }

            if (!Schema::hasColumn('tender_reviews', 'signed_by_vve')) {
                $table->string('signed_by_vve', 255)->nullable()->after('responded_by_status');
            }
            if (!Schema::hasColumn('tender_reviews', 'signed_by_vve_date')) {
                $table->dateTime('signed_by_vve_date')->nullable()->after('signed_by_vve');
            }
            if (!Schema::hasColumn('tender_reviews', 'signed_by_vve_status')) {
                $table->string('signed_by_vve_status', 50)->nullable()->default('pending')->after('signed_by_vve_date');
            }

            if (!Schema::hasColumn('tender_reviews', 'signed_by_tl')) {
                $table->string('signed_by_tl', 255)->nullable()->after('signed_by_vve_status');
            }
            if (!Schema::hasColumn('tender_reviews', 'signed_by_tl_date')) {
                $table->dateTime('signed_by_tl_date')->nullable()->after('signed_by_tl');
            }
            if (!Schema::hasColumn('tender_reviews', 'signed_by_tl_status')) {
                $table->string('signed_by_tl_status', 50)->nullable()->default('pending')->after('signed_by_tl_date');
            }

            if (!Schema::hasColumn('tender_reviews', 'acknowledged_by')) {
                $table->string('acknowledged_by', 255)->nullable()->after('signed_by_tl_status');
            }
            if (!Schema::hasColumn('tender_reviews', 'acknowledged_by_date')) {
                $table->dateTime('acknowledged_by_date')->nullable()->after('acknowledged_by');
            }
            if (!Schema::hasColumn('tender_reviews', 'acknowledged_by_status')) {
                $table->string('acknowledged_by_status', 50)->nullable()->default('pending')->after('acknowledged_by_date');
            }
        });
    }

    public function down(): void
    {
        Schema::table('tender_reviews', function (Blueprint $table) {
            $columns = [
                'reviewed_by',
                'reviewed_by_date',
                'reviewed_by_status',
                'responded_by',
                'responded_by_date',
                'responded_by_status',
                'signed_by_vve',
                'signed_by_vve_date',
                'signed_by_vve_status',
                'signed_by_tl',
                'signed_by_tl_date',
                'signed_by_tl_status',
                'acknowledged_by',
                'acknowledged_by_date',
                'acknowledged_by_status',
            ];

            foreach ($columns as $column) {
                if (Schema::hasColumn('tender_reviews', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
