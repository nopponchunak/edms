<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateCommitteeEmployeesTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('committee_employees', function (Blueprint $table) {
            $table->increments('id');

            $table->unsignedInteger('committee_id');
            $table->string('employee_code', 255);

            $table->timestamps();

            $table->unique(['committee_id', 'employee_code'], 'uq_committee_employee');
            $table->index('employee_code');

            $table->foreign('committee_id')
                ->references('id')
                ->on('committees')
                ->onUpdate('cascade')
                ->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('committee_employees');
    }
}
