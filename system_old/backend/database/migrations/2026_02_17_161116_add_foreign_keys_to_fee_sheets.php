<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddForeignKeysToFeeSheets extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('fee_sheets', function (Blueprint $table) {

            $table->foreign('project_id')
                ->references('id')
                ->on('proposal_contract_reviews')
                ->cascadeOnDelete();

            $table->foreign('discipline_id')
                ->references('id')
                ->on('disciplines');

            $table->foreign('project_type_id')
                ->references('id')
                ->on('project_types');

            $table->foreign('director_in_charge_id')
                ->references('id')
                ->on('users');
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

            // Drop in reverse-safe way using column names
            $table->dropForeign(['project_id']);
            $table->dropForeign(['discipline_id']);
            $table->dropForeign(['project_type_id']);
            $table->dropForeign(['director_in_charge_id']);
        });
    }
}
