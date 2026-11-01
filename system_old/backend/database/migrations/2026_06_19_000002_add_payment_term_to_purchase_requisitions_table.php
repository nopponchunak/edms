<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AddPaymentTermToPurchaseRequisitionsTable extends Migration
{
    private const DEFAULT_PAYMENT_TERM = 'Accept invoices only at the end of each month. Payment will be made at the end of the following month after the invoice is received.';

    public function up()
    {
        if (!Schema::hasColumn('purchase_requisitions', 'payment_term')) {
            Schema::table('purchase_requisitions', function (Blueprint $table) {
                $table->string('payment_term', 500)->charset('utf8')->nullable()->after('other_conditions');
            });
        }

        DB::table('purchase_requisitions')
            ->where(function ($query) {
                $query->whereNull('payment_term')
                    ->orWhere('payment_term', '');
            })
            ->update(['payment_term' => self::DEFAULT_PAYMENT_TERM]);
    }

    public function down()
    {
        if (Schema::hasColumn('purchase_requisitions', 'payment_term')) {
            Schema::table('purchase_requisitions', function (Blueprint $table) {
                $table->dropColumn('payment_term');
            });
        }
    }
}
