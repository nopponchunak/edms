<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

class ModifyFeeSheetTypeEnumInFeeSheetRevisions extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        DB::statement("
            ALTER TABLE fee_sheet_revisions
            MODIFY fee_sheet_type
            ENUM('project','facade','lighting','transportation')
            NOT NULL
        ");
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        DB::statement("
            ALTER TABLE fee_sheet_revisions
            MODIFY fee_sheet_type
            VARCHAR(255)
        ");
    }
}
