<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('fee_agreements', function (Blueprint $table) {
            if (!Schema::hasColumn('fee_agreements', 'agreement_received')) {
                $table->string('agreement_received')->nullable();
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
        Schema::table('fee_agreements', function (Blueprint $table) {
            $table->dropColumn('agreement_received');
        });
    }
};
