<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
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
        $table = 'single_source_justifications';

        if (!Schema::hasColumn($table, 'verify_by')) {
            Schema::table($table, function (Blueprint $t) {
                $t->string('verify_by', 255)->charset('utf8')->nullable();
            });
        }

        if (!Schema::hasColumn($table, 'verify_by_status')) {
            Schema::table($table, function (Blueprint $t) {
                $t->string('verify_by_status', 255)->charset('utf8')->nullable();
            });
        }

        if (!Schema::hasColumn($table, 'verify_by_date')) {
            Schema::table($table, function (Blueprint $t) {
                $t->dateTime('verify_by_date')->nullable();
            });
        } else {
            DB::statement('ALTER TABLE `single_source_justifications` MODIFY `verify_by_date` DATETIME NULL');
        }

        if (!Schema::hasColumn($table, 'verify_by_comment')) {
            Schema::table($table, function (Blueprint $t) {
                $t->text('verify_by_comment')->nullable();
            });
        }
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        $tname = 'single_source_justifications';
        $cols  = [];
        foreach (['verify_by_comment', 'verify_by_date', 'verify_by_status', 'verify_by'] as $c) {
            if (Schema::hasColumn($tname, $c)) {
                $cols[] = $c;
            }
        }
        if ($cols !== []) {
            Schema::table($tname, function (Blueprint $table) use ($cols) {
                $table->dropColumn($cols);
            });
        }
    }
};
