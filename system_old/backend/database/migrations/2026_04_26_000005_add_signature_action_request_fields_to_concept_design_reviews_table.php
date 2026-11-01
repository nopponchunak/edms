<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddSignatureActionRequestFieldsToConceptDesignReviewsTable extends Migration
{
    public function up()
    {
        Schema::table('concept_design_reviews', function (Blueprint $table) {
            $table->string('reviewed_by', 255)->nullable()->after('review_method');
            $table->date('reviewed_by_date')->nullable()->after('reviewed_by');
            $table->string('reviewed_by_status', 50)->nullable()->default('pending')->after('reviewed_by_date');

            $table->string('responded_by', 255)->nullable()->after('reviewed_by_status');
            $table->date('responded_by_date')->nullable()->after('responded_by');
            $table->string('responded_by_status', 50)->nullable()->default('pending')->after('responded_by_date');

            $table->string('signed_by_tl', 255)->nullable()->after('responded_by_status');
            $table->date('signed_by_tl_date')->nullable()->after('signed_by_tl');
            $table->string('signed_by_tl_status', 50)->nullable()->default('pending')->after('signed_by_tl_date');

            $table->string('signed_by_tl2', 255)->nullable()->after('signed_by_tl_status');
            $table->date('signed_by_tl2_date')->nullable()->after('signed_by_tl2');
            $table->string('signed_by_tl2_status', 50)->nullable()->default('pending')->after('signed_by_tl2_date');

            $table->string('acknowledged_by', 255)->nullable()->after('signed_by_tl2_status');
            $table->date('acknowledged_by_date')->nullable()->after('acknowledged_by');
            $table->string('acknowledged_by_status', 50)->nullable()->default('pending')->after('acknowledged_by_date');
        });
    }

    public function down()
    {
        Schema::table('concept_design_reviews', function (Blueprint $table) {
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
            ]);
        });
    }
}
