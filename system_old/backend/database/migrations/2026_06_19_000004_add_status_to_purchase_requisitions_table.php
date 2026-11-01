<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AddStatusToPurchaseRequisitionsTable extends Migration
{
    public function up()
    {
        Schema::table('purchase_requisitions', function (Blueprint $table) {
            if (!Schema::hasColumn('purchase_requisitions', 'status')) {
                $table->string('status', 50)->default('submitted')->after('id')->index();
            }
        });

        DB::table('purchase_requisitions')
            ->whereNull('status')
            ->orWhere('status', '')
            ->update(['status' => 'submitted']);
    }

    public function down()
    {
        Schema::table('purchase_requisitions', function (Blueprint $table) {
            if (Schema::hasColumn('purchase_requisitions', 'status')) {
                $table->dropColumn('status');
            }
        });
    }
}
