<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddVoucherNoToAllowanceAfter10pmTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('allowance_after_10pm', function (Blueprint $table) {
            if (!Schema::hasColumn('allowance_after_10pm', 'voucher_no')) {
                $table->string('voucher_no', 100)->charset('utf8')->nullable()->after('id');
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
        Schema::table('allowance_after_10pm', function (Blueprint $table) {
            if (Schema::hasColumn('allowance_after_10pm', 'voucher_no')) {
                $table->dropColumn('voucher_no');
            }
        });
    }
}
