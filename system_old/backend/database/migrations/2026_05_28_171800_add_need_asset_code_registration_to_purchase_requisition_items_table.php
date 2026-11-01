<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddNeedAssetCodeRegistrationToPurchaseRequisitionItemsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        if (Schema::hasColumn('purchase_requisition_items', 'need_asset_code_registration')) {
            return;
        }

        Schema::table('purchase_requisition_items', function (Blueprint $table) {
            $table->boolean('need_asset_code_registration')->default(false)->after('amount');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        if (!Schema::hasColumn('purchase_requisition_items', 'need_asset_code_registration')) {
            return;
        }

        Schema::table('purchase_requisition_items', function (Blueprint $table) {
            $table->dropColumn('need_asset_code_registration');
        });
    }
}
