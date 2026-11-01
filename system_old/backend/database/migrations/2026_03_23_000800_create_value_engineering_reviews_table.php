<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateValueEngineeringReviewsTable extends Migration
{
    public function up()
    {
        Schema::create('value_engineering_reviews', function (Blueprint $table) {
            $table->increments('id');
            $table->string('form_type', 100)->nullable();
            $table->string('project_id', 50)->nullable();
            $table->string('project_name', 255)->nullable();
            $table->string('project_number', 100)->nullable();
            $table->string('prepared_by', 255)->nullable();
            $table->string('discipline', 255)->nullable();
            $table->text('document_location')->nullable();
            $table->string('review_method', 50)->nullable();
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
        Schema::dropIfExists('value_engineering_reviews');
    }
}
