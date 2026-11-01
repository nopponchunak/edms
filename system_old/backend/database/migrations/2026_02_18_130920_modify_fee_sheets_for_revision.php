<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class ModifyFeeSheetsForRevision extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('fee_sheets', function (Blueprint $table) {

            $table->foreignId('current_revision_id')
                ->nullable()
                ->after('id')
                ->constrained('fee_sheet_revisions')
                ->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('fee_sheets', function (Blueprint $table) {
            $table->dropForeign(['current_revision_id']);
            $table->dropColumn('current_revision_id');
        });
    }
}
