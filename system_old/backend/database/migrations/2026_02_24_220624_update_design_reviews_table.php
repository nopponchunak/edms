<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class UpdateDesignReviewsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        
        if (Schema::hasColumn('design_reviews', 'project_id')) {

         
            try {
                Schema::table('design_reviews', function (Blueprint $table) {
                    $table->dropForeign('design_reviews_project_id_foreign');
                });
            } catch (\Exception $e) {
                // Already dropped? No problem.
            }

            Schema::table('design_reviews', function (Blueprint $table) {
                $table->dropColumn('project_id');
            });
        }

       
        Schema::table('design_reviews', function (Blueprint $table) {
            if (! Schema::hasColumn('design_reviews', 'document_location')) {
                $table->string('document_location')->nullable()->after('discipline_id');
            }
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

            if (Schema::hasColumn('design_reviews', 'document_location')) {
                $table->dropColumn('document_location');
            }

            if (! Schema::hasColumn('design_reviews', 'project_id')) {
                $table->unsignedBigInteger('project_id')->nullable()->after('id');
                $table->foreign('project_id')->references('id')->on('project_types');
            }
        });
    }
}
