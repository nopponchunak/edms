<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddActionByAdminStatusToPurchaseRequisitionsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        if (Schema::hasColumn('purchase_requisitions', 'action_by_admin_status')) {
            return;
        }

        Schema::table('purchase_requisitions', function (Blueprint $table) {
            $table->string('action_by_admin_status', 50)
                ->charset('utf8')
                ->nullable()
                ->after('action_by_admin');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        if (!Schema::hasColumn('purchase_requisitions', 'action_by_admin_status')) {
            return;
        }

        Schema::table('purchase_requisitions', function (Blueprint $table) {
            $table->dropColumn('action_by_admin_status');
        });
    }
}
