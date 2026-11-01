<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class DropCreateByAndUpdateByColumnsFromDesignReviewsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        
        try {
            Schema::table('design_reviews', function (Blueprint $table) {
                $table->dropForeign('design_reviews_created_by_foreign');
            });
        } catch (\Exception $e) {
            // Log or ignore if already gone
        }

        
        try {
            Schema::table('design_reviews', function (Blueprint $table) {
                $table->dropForeign('design_reviews_prepared_by_foreign');
            });
        } catch (\Exception $e) {
            // Log or ignore if already gone
        }

       
        Schema::table('design_reviews', function (Blueprint $table) {
            $table->dropColumn(['created_by', 'prepared_by']);
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
            // Re-adding with types matching your original schema
            $table->unsignedInteger('created_by')->after('discipline_id');
            $table->unsignedInteger('prepared_by')->after('document_location');

            $table->foreign('created_by')->references('id')->on('users');
            $table->foreign('prepared_by')->references('id')->on('users');
        });
    }
}
