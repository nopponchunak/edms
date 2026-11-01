<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddApprovedBy2ToGiftHospitalityOfferingsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('gift_hospitality_offerings', function (Blueprint $table) {
            $table->string('approved_by_2', 50)->nullable()->after('approved_by');
            $table->dateTime('approved_by_2_date')->nullable()->after('approved_by_date');
            $table->string('approved_by_2_status', 255)->nullable()->after('approved_by_status');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('gift_hospitality_offerings', function (Blueprint $table) {
            $table->dropColumn([
                'approved_by_2',
                'approved_by_2_date',
                'approved_by_2_status',
            ]);
        });
    }
}

