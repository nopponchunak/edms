<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddApprovedBy2ToPurchaseRequisitionsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        if (Schema::hasColumn('purchase_requisitions', 'approved_by_2')) {
            return;
        }

        Schema::table('purchase_requisitions', function (Blueprint $table) {
            $table->string('approved_by_2', 50)->charset('utf8')->nullable()->after('approved_by');
            $table->string('approved_by_2_status', 50)->charset('utf8')->nullable()->after('approved_by_status');
            $table->dateTime('approved_by_2_date')->nullable()->after('approved_date');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        if (!Schema::hasColumn('purchase_requisitions', 'approved_by_2')) {
            return;
        }

        Schema::table('purchase_requisitions', function (Blueprint $table) {
            $table->dropColumn([
                'approved_by_2',
                'approved_by_2_status',
                'approved_by_2_date',
            ]);
        });
    }
}
