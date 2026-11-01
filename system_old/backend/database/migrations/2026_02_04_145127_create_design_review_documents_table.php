<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateDesignReviewDocumentsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up(): void
    {
        Schema::create('design_review_documents', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('design_review_id');
            $table->string('document_type');

            $table->timestamps();

            // Foreign key
            $table->foreign('design_review_id')
                  ->references('id')
                  ->on('design_reviews')
                  ->onDelete('cascade');

            // Prevent duplicate document types per review
            $table->unique(['design_review_id', 'document_type']);
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down(): void
    {
        Schema::dropIfExists('design_review_documents');
    }
}
