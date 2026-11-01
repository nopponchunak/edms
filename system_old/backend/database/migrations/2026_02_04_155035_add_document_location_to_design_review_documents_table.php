<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddDocumentLocationToDesignReviewDocumentsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('design_review_documents', function (Blueprint $table) {
            $table->string('document_location')->nullable()->after('document_type');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('design_review_documents', function (Blueprint $table) {
            $table->dropColumn('document_location');
        });
    }
}
