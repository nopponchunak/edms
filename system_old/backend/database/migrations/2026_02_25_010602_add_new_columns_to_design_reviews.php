<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddNewColumnsToDesignReviews extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('design_reviews', function (Blueprint $table) {
            $table->string('project_name', 255)->charset('utf8')->after('project_no');

            $table->string('first_signed_by', 50)->charset('utf8')->nullable()->after('comments');
            $table->string('first_signed_status', 50)->charset('utf8')->nullable()->after('first_signed_by');
            $table->date('first_signed_date')->nullable()->after('first_signed_status');

            $table->string('responded_by', 50)->charset('utf8')->nullable()->after('first_signed_date');
            $table->string('recommended_action', 10)->nullable()->after('responded_by');
            $table->text('recommended_note')->nullable()->after('recommended_action');
            $table->date('responded_date')->nullable()->after('recommended_note');

            $table->string('second_signed_by', 50)->charset('utf8')->nullable()->after('responded_date');
            $table->string('second_signed_status', 50)->charset('utf8')->nullable()->after('second_signed_by');
            $table->date('second_signed_date')->nullable()->after('second_signed_status');

            $table->string('tl_mep_signed_by', 50)->charset('utf8')->nullable()->after('second_signed_date');
            $table->string('tl_mep_signed_status', 50)->charset('utf8')->nullable()->after('tl_mep_signed_by');
            $table->date('tl_mep_signed_date')->nullable()->after('tl_mep_signed_status');

            $table->string('tl_signed_by', 50)->charset('utf8')->nullable()->after('tl_mep_signed_date');
            $table->string('tl_signed_status', 50)->charset('utf8')->nullable()->after('tl_signed_by');
            $table->date('tl_signed_date')->nullable()->after('tl_signed_status');

            $table->string('acknowledged_by', 50)->charset('utf8')->nullable()->after('tl_signed_date');
            $table->string('acknowledged_status', 50)->charset('utf8')->nullable()->after('acknowledged_by');
            $table->date('acknowledged_date')->nullable()->after('acknowledged_status');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('design_reviews', function (Blueprint $table) {

            $table->dropColumn([
                'project_name',

                'first_signed_by',
                'first_signed_status',
                'first_signed_date',

                'responded_by',
                'recommended_action',
                'recommended_note',
                'responded_date',

                'second_signed_by',
                'second_signed_status',
                'second_signed_date',

                'tl_mep_signed_by',
                'tl_mep_signed_status',
                'tl_mep_signed_date',

                'tl_signed_by',
                'tl_signed_status',
                'tl_signed_date',

                'acknowledged_by',
                'acknowledged_status',
                'acknowledged_date',
            ]);

        });
    }
}
