<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class DropColumnsFromDesignReviewAssignments extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('design_review_assignments', function (Blueprint $table) {

            $table->dropForeign('design_review_assignments_director_id_foreign');
            $table->dropForeign('design_review_assignments_reviewer_id_foreign');
            $table->dropForeign('design_review_assignments_team_lead_id_foreign');

            $table->dropColumn(['director_id', 'reviewer_id', 'team_lead_id']);
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
            $table->unsignedBigInteger('director_id')->nullable();
            $table->unsignedBigInteger('reviewer_id')->nullable();
            $table->unsignedBigInteger('team_lead_id')->nullable();

            
            $table->foreign('director_id', 'design_review_assignments_director_id_foreign')
                ->references('id')->on('users'); // Change 'users' to the actual table name

            $table->foreign('reviewer_id', 'design_review_assignments_reviewer_id_foreign')
                ->references('id')->on('users');

            $table->foreign('team_lead_id', 'design_review_assignments_team_lead_id_foreign')
                ->references('id')->on('users');
        });
    }
}
