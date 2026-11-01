<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddCurrencyCodeToCharitableContributionsTable extends Migration
{
    public function up()
    {
        if (!Schema::hasColumn('charitable_contributions', 'currency_code')) {
            Schema::table('charitable_contributions', function (Blueprint $table) {
                $table->string('currency_code', 10)->nullable()->default('THB')->after('value_amount');
            });
        }
    }

    public function down()
    {
        if (Schema::hasColumn('charitable_contributions', 'currency_code')) {
            Schema::table('charitable_contributions', function (Blueprint $table) {
                $table->dropColumn('currency_code');
            });
        }
    }
}
