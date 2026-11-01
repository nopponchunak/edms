<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreatePostmanFeeSheetsTable extends Migration
{
    public function up()
    {
        Schema::create('postman_fee_sheets', function (Blueprint $table) {
            $table->increments('id');
            $table->string('fee_sheet_type', 100)->nullable();
            $table->string('project_id', 50)->nullable();
            $table->string('mt_project_no', 100)->nullable();
            $table->string('project_name', 255)->nullable();
            $table->string('discipline_id', 50)->nullable();
            $table->string('director_in_charge_id', 50)->nullable();
            $table->string('project_type_id', 50)->nullable();
            $table->string('client_name', 255)->nullable();
            $table->string('location', 255)->nullable();
            $table->string('contact_name', 255)->nullable();
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
        Schema::dropIfExists('postman_fee_sheets');
    }
}
