<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddCircWorkflowFieldsToPurchaseOrdersTable extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('purchase_orders')) {
            return;
        }

        if (!Schema::hasColumn('purchase_orders', 'circ_status')) {
            Schema::table('purchase_orders', function (Blueprint $table) {
                $table->string('circ_status', 50)->charset('utf8')->nullable()->after('approved_by_status');
            });
        }

        if (!Schema::hasColumn('purchase_orders', 'circ_date')) {
            $afterColumn = Schema::hasColumn('purchase_orders', 'circ_status') ? 'circ_status' : 'approved_by_status';

            Schema::table('purchase_orders', function (Blueprint $table) use ($afterColumn) {
                $table->date('circ_date')->nullable()->after($afterColumn);
            });
        }
    }

    public function down()
    {
        if (!Schema::hasTable('purchase_orders')) {
            return;
        }

        if (Schema::hasColumn('purchase_orders', 'circ_date')) {
            Schema::table('purchase_orders', function (Blueprint $table) {
                $table->dropColumn('circ_date');
            });
        }

        if (Schema::hasColumn('purchase_orders', 'circ_status')) {
            Schema::table('purchase_orders', function (Blueprint $table) {
                $table->dropColumn('circ_status');
            });
        }
    }
}
