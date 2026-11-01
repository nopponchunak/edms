<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddSecondaryApprovalFieldsToCarsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('cars', function (Blueprint $table) {
            $table->string('approve_by_status_2', 255)->nullable()->after('approved_by_status');
            $table->dateTime('approve_by_date_2')->nullable()->after('approved_by_date');
            $table->string('verified_by_status_2', 255)->nullable()->after('verified_by_status');
            $table->dateTime('verified_by_date_2')->nullable()->after('verified_by_date');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('cars', function (Blueprint $table) {
            $table->dropColumn([
                'approve_by_status_2',
                'approve_by_date_2',
                'verified_by_status_2',
                'verified_by_date_2',
            ]);
        });
    }
}
