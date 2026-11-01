<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateDesignReviewSignaturesTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up(): void
    {
        Schema::create('design_review_signatures', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('design_review_id');
            $table->string('role');                 // Reviewer | TeamLead | Director | PE | DI
            $table->unsignedInteger('user_id');
            $table->string('action_status');        // Pending | Approved | Returned | Acknowledged
            $table->text('note')->nullable();
            $table->timestamp('action_at')->nullable();

            $table->timestamps();

            // Foreign keys
            $table->foreign('design_review_id')
                  ->references('id')
                  ->on('design_reviews')
                  ->onDelete('cascade');

            $table->foreign('user_id')
                  ->references('id')
                  ->on('users');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down(): void
    {
        Schema::dropIfExists('design_review_signatures');
    }
}
