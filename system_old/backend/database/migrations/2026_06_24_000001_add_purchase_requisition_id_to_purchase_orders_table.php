<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddPurchaseRequisitionIdToPurchaseOrdersTable extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('purchase_orders') || Schema::hasColumn('purchase_orders', 'purchase_requisition_id')) {
            return;
        }

        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->unsignedInteger('purchase_requisition_id')->nullable()->after('id')->index();
        });
    }

    public function down()
    {
        if (!Schema::hasTable('purchase_orders') || !Schema::hasColumn('purchase_orders', 'purchase_requisition_id')) {
            return;
        }

        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->dropColumn('purchase_requisition_id');
        });
    }
}
