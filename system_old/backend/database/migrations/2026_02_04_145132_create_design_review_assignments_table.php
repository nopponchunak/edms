<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateDesignReviewAssignmentsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up(): void
    {
        Schema::create('design_review_assignments', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('design_review_id');
            $table->unsignedInteger('reviewer_id');
            $table->unsignedInteger('team_lead_id');
            $table->unsignedInteger('director_id');

            $table->timestamps();

            // Foreign keys
            $table->foreign('design_review_id')
                  ->references('id')
                  ->on('design_reviews')
                  ->onDelete('cascade');

            $table->foreign('reviewer_id')->references('id')->on('users');
            $table->foreign('team_lead_id')->references('id')->on('users');
            $table->foreign('director_id')->references('id')->on('users');

            // Ensure one assignment set per review
            $table->unique('design_review_id');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
     public function down(): void
    {
        Schema::dropIfExists('design_review_assignments');
    }
}
