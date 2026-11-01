<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateCarsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('cars', function (Blueprint $table) {
            $table->increments('id');

            // ------- ข้อมูลหลัก -------
            $table->string('department', 255)->charset('utf8')->nullable();
            $table->string('project_name', 255)->charset('utf8')->nullable();
            $table->string('ref_no', 100)->charset('utf8')->nullable();
            $table->string('project_no', 100)->charset('utf8')->nullable();
            $table->string('to', 255)->charset('utf8')->nullable();

            $table->date('date')->nullable();

            $table->string('car_issued_by', 255)->charset('utf8')->nullable();

            // sources (array → JSON string)
            $table->text('sources')->nullable();
            $table->string('other_source_description', 255)->charset('utf8')->nullable();

            $table->string('severity', 50)->charset('utf8')->nullable();

            // non conformity
            $table->text('non_conformity_types')->nullable();
            $table->text('non_conformity_description')->nullable();

            // ------- CAR / IMR Detail -------
            $table->text('cause_of_non_conformity')->nullable();
            $table->text('remedial_action')->nullable();
            $table->text('corrective_action')->nullable();
            $table->text('imr_comments')->nullable();

            // ------- Workflow : ผู้ดำเนินการ -------
            $table->string('completed_by', 100)->nullable();
            $table->date('completed_by_date')->nullable();
            $table->string('completed_by_status', 50)->nullable();

            $table->string('acknowledged_by', 100)->nullable();
            $table->date('acknowledged_by_date')->nullable();
            $table->string('acknowledged_by_status', 50)->nullable();

            $table->string('verified_by', 100)->nullable();
            $table->date('verified_by_date')->nullable();
            $table->string('verified_by_status', 50)->nullable();

            $table->string('approved_by', 100)->nullable();
            $table->date('approved_by_date')->nullable();
            $table->string('approved_by_status', 50)->nullable();

            // ------- Boolean Flags (0/1) -------
            $table->tinyInteger('response_time_check')->default(0)
                ->comment('1 = true, 0 = false');

            $table->tinyInteger('ra_ca_satisfactory')->default(0)
                ->comment('1 = true, 0 = false');

            $table->tinyInteger('further_action_required')->default(0)
                ->comment('1 = true, 0 = false');

            // ผู้สร้าง / ผู้แก้ไข
            $table->string('create_by', 100)->charset('utf8')->nullable();
            $table->string('update_by', 100)->charset('utf8')->nullable();

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
        Schema::dropIfExists('cars');
    }
}
