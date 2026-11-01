<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddAssetCodeFieldsToPurchaseOrderItemsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        if (!Schema::hasColumn('purchase_order_items', 'need_asset_code_registration')) {
            Schema::table('purchase_order_items', function (Blueprint $table) {
                $table->boolean('need_asset_code_registration')->default(false)->after('amount');
            });
        }

        if (!Schema::hasColumn('purchase_order_items', 'asset_code')) {
            Schema::table('purchase_order_items', function (Blueprint $table) {
                $table->string('asset_code', 255)->nullable()->after('need_asset_code_registration');
            });
        }
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        $columns = [];

        if (Schema::hasColumn('purchase_order_items', 'asset_code')) {
            $columns[] = 'asset_code';
        }

        if (Schema::hasColumn('purchase_order_items', 'need_asset_code_registration')) {
            $columns[] = 'need_asset_code_registration';
        }

        if (!empty($columns)) {
            Schema::table('purchase_order_items', function (Blueprint $table) use ($columns) {
                $table->dropColumn($columns);
            });
        }
    }
}
