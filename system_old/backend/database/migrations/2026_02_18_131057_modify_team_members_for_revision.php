<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class ModifyTeamMembersForRevision extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('fee_sheet_team_members', function (Blueprint $table) {

            $table->dropForeign(['fee_sheet_id']);
            $table->dropColumn('fee_sheet_id');

            $table->foreignId('revision_id')
                ->constrained('fee_sheet_revisions')
                ->cascadeOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('fee_sheet_team_members', function (Blueprint $table) {
           
            $table->dropForeign(['revision_id']);
            $table->dropColumn('revision_id');
            $table->foreignId('fee_sheet_id')
                ->constrained('fee_sheets')
                ->cascadeOnDelete();
        });
    }
}
