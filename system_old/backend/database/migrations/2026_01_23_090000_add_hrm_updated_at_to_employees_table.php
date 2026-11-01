<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddHrmUpdatedAtToEmployeesTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        if (Schema::hasColumn('employees', 'hrm_updated_at')) {
            return;
        }

        Schema::table('employees', function (Blueprint $table) {
            $table->dateTime('hrm_updated_at')->nullable()->after('current_end_period')->index();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        if (!Schema::hasColumn('employees', 'hrm_updated_at')) {
            return;
        }

        Schema::table('employees', function (Blueprint $table) {
            $table->dropIndex(['hrm_updated_at']);
            $table->dropColumn('hrm_updated_at');
        });
    }
}
