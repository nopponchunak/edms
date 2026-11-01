<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddSignatureActionRequestFieldsToSubmissionReviewsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('submission_reviews', function (Blueprint $table) {
            if (!Schema::hasColumn('submission_reviews', 'reviewed_by')) {
                $table->string('reviewed_by', 255)->nullable()->after('review_method');
            }
            if (!Schema::hasColumn('submission_reviews', 'reviewed_by_date')) {
                $table->datetime('reviewed_by_date')->nullable()->after('reviewed_by');
            }
            if (!Schema::hasColumn('submission_reviews', 'reviewed_by_status')) {
                $table->string('reviewed_by_status', 50)->nullable()->default('pending')->after('reviewed_by_date');
            }

            if (!Schema::hasColumn('submission_reviews', 'responded_by')) {
                $table->string('responded_by', 255)->nullable()->after('reviewed_by_status');
            }
            if (!Schema::hasColumn('submission_reviews', 'responded_by_date')) {
                $table->datetime('responded_by_date')->nullable()->after('responded_by');
            }
            if (!Schema::hasColumn('submission_reviews', 'responded_by_status')) {
                $table->string('responded_by_status', 50)->nullable()->default('pending')->after('responded_by_date');
            }

            if (!Schema::hasColumn('submission_reviews', 'signed_by_tl')) {
                $table->string('signed_by_tl', 255)->nullable()->after('responded_by_status');
            }
            if (!Schema::hasColumn('submission_reviews', 'signed_by_tl_date')) {
                $table->datetime('signed_by_tl_date')->nullable()->after('signed_by_tl');
            }
            if (!Schema::hasColumn('submission_reviews', 'signed_by_tl_status')) {
                $table->string('signed_by_tl_status', 50)->nullable()->default('pending')->after('signed_by_tl_date');
            }

            if (!Schema::hasColumn('submission_reviews', 'signed_by_tl2')) {
                $table->string('signed_by_tl2', 255)->nullable()->after('signed_by_tl_status');
            }
            if (!Schema::hasColumn('submission_reviews', 'signed_by_tl2_date')) {
                $table->datetime('signed_by_tl2_date')->nullable()->after('signed_by_tl2');
            }
            if (!Schema::hasColumn('submission_reviews', 'signed_by_tl2_status')) {
                $table->string('signed_by_tl2_status', 50)->nullable()->default('pending')->after('signed_by_tl2_date');
            }

            if (!Schema::hasColumn('submission_reviews', 'acknowledged_by')) {
                $table->string('acknowledged_by', 255)->nullable()->after('signed_by_tl2_status');
            }
            if (!Schema::hasColumn('submission_reviews', 'acknowledged_by_date')) {
                $table->datetime('acknowledged_by_date')->nullable()->after('acknowledged_by');
            }
            if (!Schema::hasColumn('submission_reviews', 'acknowledged_by_status')) {
                $table->string('acknowledged_by_status', 50)->nullable()->default('pending')->after('acknowledged_by_date');
            }

            // Standardize column names if they exist with different casing from schematic pattern
            if (!Schema::hasColumn('submission_reviews', 'signed_by_t_l')) {
                 $table->string('signed_by_t_l', 255)->nullable()->after('acknowledged_by_status');
            }
            if (!Schema::hasColumn('submission_reviews', 'signed_by_t_l_date')) {
                $table->datetime('signed_by_t_l_date')->nullable()->after('signed_by_t_l');
            }
            if (!Schema::hasColumn('submission_reviews', 'signed_by_t_l_status')) {
                $table->string('signed_by_t_l_status', 50)->nullable()->default('pending')->after('signed_by_t_l_date');
            }
            if (!Schema::hasColumn('submission_reviews', 'signed_by_t_l2')) {
                 $table->string('signed_by_t_l2', 255)->nullable()->after('signed_by_t_l_status');
            }
            if (!Schema::hasColumn('submission_reviews', 'signed_by_t_l2_date')) {
                $table->datetime('signed_by_t_l2_date')->nullable()->after('signed_by_t_l2');
            }
            if (!Schema::hasColumn('submission_reviews', 'signed_by_t_l2_status')) {
                $table->string('signed_by_t_l2_status', 50)->nullable()->default('pending')->after('signed_by_t_l2_date');
            }
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('submission_reviews', function (Blueprint $table) {
            $table->dropColumn([
                'reviewed_by',
                'reviewed_by_date',
                'reviewed_by_status',
                'responded_by',
                'responded_by_date',
                'responded_by_status',
                'signed_by_tl',
                'signed_by_tl_date',
                'signed_by_tl_status',
                'signed_by_tl2',
                'signed_by_tl2_date',
                'signed_by_tl2_status',
                'acknowledged_by',
                'acknowledged_by_date',
                'acknowledged_by_status',
                'signed_by_t_l',
                'signed_by_t_l_date',
                'signed_by_t_l_status',
                'signed_by_t_l2',
                'signed_by_t_l2_date',
                'signed_by_t_l2_status',
            ]);
        });
    }
}
