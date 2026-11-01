<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ExpandAllowanceAfter10pmDisciplineLength extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('allowance_after_10pm') || !Schema::hasColumn('allowance_after_10pm', 'discipline')) {
            return;
        }

        DB::statement('ALTER TABLE allowance_after_10pm MODIFY discipline VARCHAR(255) CHARACTER SET utf8 NOT NULL');
    }

    public function down()
    {
        if (!Schema::hasTable('allowance_after_10pm') || !Schema::hasColumn('allowance_after_10pm', 'discipline')) {
            return;
        }

        DB::statement('ALTER TABLE allowance_after_10pm MODIFY discipline VARCHAR(50) CHARACTER SET utf8 NOT NULL');
    }
}
