<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddDraftPayloadToExpensesClaimsAndAllowanceAfter10pm extends Migration
{
    public function up()
    {
        if (Schema::hasTable('expenses_claims') && !Schema::hasColumn('expenses_claims', 'draft_payload')) {
            Schema::table('expenses_claims', function (Blueprint $table) {
                $table->longText('draft_payload')->nullable()->after('status');
            });
        }

        if (Schema::hasTable('allowance_after_10pm') && !Schema::hasColumn('allowance_after_10pm', 'draft_payload')) {
            Schema::table('allowance_after_10pm', function (Blueprint $table) {
                $table->longText('draft_payload')->nullable()->after('status');
            });
        }
    }

    public function down()
    {
        if (Schema::hasTable('expenses_claims') && Schema::hasColumn('expenses_claims', 'draft_payload')) {
            Schema::table('expenses_claims', function (Blueprint $table) {
                $table->dropColumn('draft_payload');
            });
        }

        if (Schema::hasTable('allowance_after_10pm') && Schema::hasColumn('allowance_after_10pm', 'draft_payload')) {
            Schema::table('allowance_after_10pm', function (Blueprint $table) {
                $table->dropColumn('draft_payload');
            });
        }
    }
}
