<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateSubConsultantEvaluationsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('sub_consultant_evaluations', function (Blueprint $table) {
            $table->increments('id');

            // ----- Evaluation Details -----
            $table->string('to', 255)->charset('utf8')->nullable();
            $table->string('circ', 255)->charset('utf8')->nullable();

            $table->string('sub_consultant_name', 255)->charset('utf8');
            $table->string('project_name', 255)->charset('utf8');
            $table->string('project_no', 255)->charset('utf8')->nullable();

            $table->text('department_value_duration')->charset('utf8')->nullable();
            $table->text('scope_of_services')->charset('utf8')->nullable();

            // ----- Anti-Corruption compliance -----
            // true = Yes (remove from approved list), false = No (proceed)
            $table->boolean('anti_corruption_is_violation')->nullable();

            // สำหรับ Architectural / Interior Design: CAD Software ถูกต้องตามลิขสิทธิ์หรือไม่
            // true = Yes (proceed), false = No (remove)
            $table->boolean('cad_software_confirmed')->nullable();

            // ----- Decision -----
            $table->boolean('is_maintained')->nullable(); // maintain in approved list (avg >= 5)
            $table->boolean('is_removed')->nullable();    // remove from approved list (avg < 5)

            // ----- Signatures / Approval -----
            $table->string('evaluated_by', 255)->charset('utf8')->nullable();
            $table->date('evaluated_date')->nullable();

            $table->string('approved_by', 255)->charset('utf8')->nullable();
            $table->date('approved_date')->nullable();

            $table->string('acknowledged_by', 255)->charset('utf8')->nullable();
            $table->date('acknowledged_date')->nullable();

            // ----- System Fields -----
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
        Schema::dropIfExists('sub_consultant_evaluations');
    }
}
