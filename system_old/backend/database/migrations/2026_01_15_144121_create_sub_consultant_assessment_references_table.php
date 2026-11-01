<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateSubConsultantAssessmentReferencesTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('sub_consultant_assessment_references', function (Blueprint $table) {
            $table->increments('id');

            $table->integer('assessment_id')->unsigned();
            $table->smallInteger('seq')->nullable(); // 1 = a, 2 = b

            $table->string('reference_name', 255)->charset('utf8')->nullable();
            $table->string('opinion', 100)->charset('utf8')->nullable(); // dropdown value

            // Control fields
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
        Schema::dropIfExists('sub_consultant_assessment_references');
    }
}
