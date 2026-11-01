<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddRespondedStatusColumnToDesignReviews extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('design_reviews', function (Blueprint $table) {
            $table->string('responded_status', 50)->charset('utf8')->nullable()->after('responded_by');

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
            $table->dropColumn('responded_status');
        });
    }
}
