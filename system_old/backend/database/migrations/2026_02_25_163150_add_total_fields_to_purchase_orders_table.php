<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddTotalFieldsToPurchaseOrdersTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->decimal('sub_total', 15, 2)->nullable()->after('currency_code');
            $table->decimal('vat_value', 15, 2)->nullable()->after('sub_total');
            $table->decimal('grand_total', 15, 2)->nullable()->after('vat_value');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->dropColumn(['sub_total', 'vat_value', 'grand_total']);
        });
    }
}
