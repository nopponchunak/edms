<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class RelaxPurchaseCurrencyCodeColumns extends Migration
{
    public function up()
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        foreach (['purchase_requisitions', 'purchase_orders'] as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, 'currency_code')) {
                DB::statement("ALTER TABLE `{$table}` MODIFY `currency_code` VARCHAR(10) NULL DEFAULT 'THB'");
            }
        }
    }

    public function down()
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        foreach (['purchase_requisitions', 'purchase_orders'] as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, 'currency_code')) {
                DB::table($table)
                    ->whereNull('currency_code')
                    ->orWhere('currency_code', '')
                    ->orWhereNotIn('currency_code', ['THB', 'USD'])
                    ->update(['currency_code' => 'THB']);

                DB::statement("ALTER TABLE `{$table}` MODIFY `currency_code` ENUM('THB', 'USD') NOT NULL DEFAULT 'THB'");
            }
        }
    }
}
