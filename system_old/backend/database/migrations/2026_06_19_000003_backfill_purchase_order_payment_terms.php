<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class BackfillPurchaseOrderPaymentTerms extends Migration
{
    private const DEFAULT_PAYMENT_TERM = 'Accept invoices only at the end of each month. Payment will be made at the end of the following month after the invoice is received.';

    public function up()
    {
        if (!Schema::hasColumn('purchase_orders', 'payment_term')) {
            return;
        }

        DB::table('purchase_orders')
            ->where(function ($query) {
                $query->whereNull('payment_term')
                    ->orWhere('payment_term', '');
            })
            ->update(['payment_term' => self::DEFAULT_PAYMENT_TERM]);
    }

    public function down()
    {
        // Keep document text as-is on rollback.
    }
}
