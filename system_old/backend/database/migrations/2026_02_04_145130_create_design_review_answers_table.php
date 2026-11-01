<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateDesignReviewAnswersTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up(): void
    {
        Schema::create('design_review_answers', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('design_review_id');
            $table->tinyInteger('question_no'); // 1–5
            $table->string('answer');           // Yes | No | NA

            $table->timestamps();

            // Foreign key
            $table->foreign('design_review_id')
                  ->references('id')
                  ->on('design_reviews')
                  ->onDelete('cascade');

            // Ensure one answer per question per review
            $table->unique(['design_review_id', 'question_no']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('design_review_answers');
    }
}
