<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateDesignReviewsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up(): void
    {
        Schema::create('design_reviews', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('project_id');
            $table->unsignedBigInteger('discipline_id');
            $table->unsignedInteger('prepared_by');
            $table->unsignedInteger('created_by');

            $table->string('document_location')->nullable();
            $table->text('comments')->nullable();

            $table->string('status')->default('Draft');

            $table->timestamps();

            // Foreign keys
            $table->foreign('project_id')->references('id')->on('project_types');
            $table->foreign('discipline_id')->references('id')->on('disciplines');
            $table->foreign('prepared_by')->references('id')->on('users');
            $table->foreign('created_by')->references('id')->on('users');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
     public function down(): void
    {
        Schema::dropIfExists('design_reviews');
    }
}
