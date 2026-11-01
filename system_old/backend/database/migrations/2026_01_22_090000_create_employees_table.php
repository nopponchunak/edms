<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateEmployeesTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('employees', function (Blueprint $table) {
            $table->increments('id');

            $table->string('code', 255)->nullable()->unique();
            $table->string('username', 255)->nullable();
            $table->string('password', 255)->nullable();
            $table->string('firstname', 255);
            $table->string('lastname', 255);
            $table->string('email', 255)->nullable();
            $table->date('birth_date')->nullable();
            $table->date('register_date')->nullable();
            $table->date('pass_probation_date')->nullable();
            $table->string('sex', 50)->nullable();

            $table->integer('title_id')->nullable();
            $table->string('title_name', 255)->nullable();

            $table->integer('level_id')->nullable();
            $table->string('level_name', 255)->nullable();

            $table->integer('department_id')->nullable();
            $table->string('department_name', 255)->nullable();

            $table->integer('employee_type_id')->nullable();
            $table->string('employee_type_name', 255)->nullable();

            $table->integer('work_shift_id')->nullable();
            $table->string('work_shift_name', 255)->nullable();

            $table->integer('head_id')->nullable();
            $table->string('head_name', 255)->nullable();

            $table->string('initial', 50)->nullable();
            $table->boolean('is_approver')->default(false);
            $table->date('next_quota_update')->nullable();
            $table->string('employee_status', 50)->nullable();
            $table->string('active', 50)->nullable();
            $table->date('current_start_period')->nullable();
            $table->date('current_end_period')->nullable();

            $table->timestamps();
            $table->softDeletes();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('employees');
    }
}
