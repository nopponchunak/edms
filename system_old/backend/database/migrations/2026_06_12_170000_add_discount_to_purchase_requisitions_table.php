<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddDiscountToPurchaseRequisitionsTable extends Migration
{
    public function up()
    {
        if (!Schema::hasColumn('purchase_requisitions', 'discount')) {
            Schema::table('purchase_requisitions', function (Blueprint $table) {
                $table->decimal('discount', 15, 2)->default(0)->after('vat_value');
            });
        }
    }

    public function down()
    {
        if (Schema::hasColumn('purchase_requisitions', 'discount')) {
            Schema::table('purchase_requisitions', function (Blueprint $table) {
                $table->dropColumn('discount');
            });
        }
    }
}
