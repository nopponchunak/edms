<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddColumnsToDesignReviewAssignments extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('design_review_assignments', function (Blueprint $table) {
            $table->string('reviewer_for_action', 50)->charset('utf8')->nullable()->after('design_review_id');
            $table->string('teamlead_for_action', 50)->charset('utf8')->nullable()->after('reviewer_for_action');
            $table->string('director_for_action', 50)->charset('utf8')->nullable()->after('teamlead_for_action');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('design_review_assignments', function (Blueprint $table) {
            $table->dropColumn(['reviewer_for_action', 'teamlead_for_action', 'director_for_action']);
        });
    }
}
