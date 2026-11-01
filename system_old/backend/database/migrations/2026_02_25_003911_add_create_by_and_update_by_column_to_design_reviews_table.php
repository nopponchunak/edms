<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddCreateByAndUpdateByColumnToDesignReviewsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('design_reviews', function (Blueprint $table) {
            $table->string('create_by', 100)->charset('utf8')->nullable()->after('comments');
            $table->string('update_by', 100)->charset('utf8')->nullable()->after('create_by');
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
            $table->dropColumn(['create_by', 'update_by']);
        });
    }
}
