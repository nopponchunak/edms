<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddApproverBy2ToCharitableContributionsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('charitable_contributions', function (Blueprint $table) {
            $table->string('approver_by_2', 50)->nullable()->after('approver_by');
            $table->string('approver_by_2_status', 255)->nullable()->after('approver_by_status');
            $table->dateTime('approver_by_2_date')->nullable()->after('approver_by_date');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('charitable_contributions', function (Blueprint $table) {
            $table->dropColumn([
                'approver_by_2',
                'approver_by_2_status',
                'approver_by_2_date',
            ]);
        });
    }
}

