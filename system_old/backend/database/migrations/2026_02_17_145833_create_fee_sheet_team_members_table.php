<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateFeeSheetTeamMembersTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('fee_sheet_team_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fee_sheet_id')->constrained('fee_sheets')->cascadeOnDelete();
            $table->string('employee_code');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('fee_sheet_team_members');
    }
}
