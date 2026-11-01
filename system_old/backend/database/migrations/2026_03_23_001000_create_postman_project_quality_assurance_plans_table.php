<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreatePostmanProjectQualityAssurancePlansTable extends Migration
{
    public function up()
    {
        Schema::create('postman_project_quality_assurance_plans', function (Blueprint $table) {
            $table->increments('id');
            $table->string('revision', 100)->nullable();
            $table->date('plan_date')->nullable();
            $table->string('project_name', 255)->nullable();
            $table->string('project_no', 100)->nullable();
            $table->string('prepared_by_tl', 100)->nullable();
            $table->string('approved_by_di', 100)->nullable();
            $table->string('acknowledged_by_vve', 100)->nullable();
            $table->string('status', 50)->nullable()->default('submitted');
            $table->longText('payload');
            $table->string('create_by', 100)->nullable();
            $table->string('update_by', 100)->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down()
    {
        Schema::dropIfExists('postman_project_quality_assurance_plans');
    }
}
