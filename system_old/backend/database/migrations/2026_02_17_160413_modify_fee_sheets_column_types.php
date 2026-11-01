<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

class ModifyFeeSheetsColumnTypes extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        DB::statement('ALTER TABLE fee_sheets MODIFY project_id BIGINT UNSIGNED NULL');
        DB::statement('ALTER TABLE fee_sheets MODIFY discipline_id BIGINT UNSIGNED NULL');
        DB::statement('ALTER TABLE fee_sheets MODIFY project_type_id BIGINT UNSIGNED NULL');
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        DB::statement('ALTER TABLE fee_sheets MODIFY project_id INT UNSIGNED NULL');
        DB::statement('ALTER TABLE fee_sheets MODIFY discipline_id INT UNSIGNED NULL');
        DB::statement('ALTER TABLE fee_sheets MODIFY project_type_id INT UNSIGNED NULL');
    }
}
