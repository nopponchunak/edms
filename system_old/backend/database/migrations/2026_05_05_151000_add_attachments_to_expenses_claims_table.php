<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddAttachmentsToExpensesClaimsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('expenses_claims', function (Blueprint $table) {
            if (!Schema::hasColumn('expenses_claims', 'attachments')) {
                $table->longText('attachments')->nullable()->after('total_baht');
            }
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('expenses_claims', function (Blueprint $table) {
            if (Schema::hasColumn('expenses_claims', 'attachments')) {
                $table->dropColumn('attachments');
            }
        });
    }
}
