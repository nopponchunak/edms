<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class DropFeeSheetTypeFromFeeSheetsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('fee_sheets', function (Blueprint $table) {
            $table->dropColumn('fee_sheet_type');
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
            $table->enum('fee_sheet_type', [
                'project',
                'facade',
                'lighting',
                'transportation',
            ])->default('project');
        });
    }
}
