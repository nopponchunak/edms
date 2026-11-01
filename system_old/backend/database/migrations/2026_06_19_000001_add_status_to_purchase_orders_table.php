<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AddStatusToPurchaseOrdersTable extends Migration
{
    public function up()
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            if (!Schema::hasColumn('purchase_orders', 'status')) {
                $table->string('status', 50)->default('submitted')->after('po_no')->index();
            }
        });

        DB::table('purchase_orders')
            ->whereNull('status')
            ->orWhere('status', '')
            ->update(['status' => 'submitted']);
    }

    public function down()
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            if (Schema::hasColumn('purchase_orders', 'status')) {
                $table->dropColumn('status');
            }
        });
    }
}
