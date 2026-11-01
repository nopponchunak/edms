<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateSubConsultantAssessmentFilesTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('sub_consultant_assessment_files', function (Blueprint $table) {
            $table->increments('id');

            $table->unsignedInteger('assessment_id');

            $table->string('name', 255)->charset('utf8')->nullable();
            $table->string('path', 500)->charset('utf8')->nullable();

            $table->string('create_by', 100)->charset('utf8')->nullable();
            $table->string('update_by', 100)->charset('utf8')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('assessment_id')
                ->references('id')->on('sub_consultant_assessments')
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
        Schema::dropIfExists('sub_consultant_assessment_files');
    }
}
