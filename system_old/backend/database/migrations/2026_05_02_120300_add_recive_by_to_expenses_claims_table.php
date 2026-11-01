<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddReciveByToExpensesClaimsTable extends Migration
{
    public function up()
    {
        if (!Schema::hasColumn('expenses_claims', 'recive_by')) {
            Schema::table('expenses_claims', function (Blueprint $table) {
                $table->string('recive_by', 100)->charset('utf8')->nullable()->after('claimant_name');
            });
        }
    }

    public function down()
    {
        if (Schema::hasColumn('expenses_claims', 'recive_by')) {
            Schema::table('expenses_claims', function (Blueprint $table) {
                $table->dropColumn('recive_by');
            });
        }
    }
}
