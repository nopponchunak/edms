<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('expenses_claims')) {
            return;
        }

        Schema::table('expenses_claims', function (Blueprint $table) {
            if (!Schema::hasColumn('expenses_claims', 'account_by')) {
                $table->string('account_by', 100)->charset('utf8')->nullable()->after('approved_by_date');
            }
            if (!Schema::hasColumn('expenses_claims', 'account_by_status')) {
                $table->string('account_by_status', 50)->charset('utf8')->nullable()->after('account_by');
            }
            if (!Schema::hasColumn('expenses_claims', 'account_by_date')) {
                $table->dateTime('account_by_date')->nullable()->after('account_by_status');
            }
        });
    }

    public function down()
    {
        if (!Schema::hasTable('expenses_claims')) {
            return;
        }

        $columns = array_values(array_filter(
            ['account_by_date', 'account_by_status', 'account_by'],
            fn ($column) => Schema::hasColumn('expenses_claims', $column)
        ));

        if (empty($columns)) {
            return;
        }

        Schema::table('expenses_claims', function (Blueprint $table) use ($columns) {
            $table->dropColumn($columns);
        });
    }
};
