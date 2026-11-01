<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateFeeSheetsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('fee_sheets', function (Blueprint $table) {
            $table->id();
            $table->enum('fee_sheet_type', [
                'project',
                'facade',
                'lighting',
                'transportation',
            ])->default('project');

            $table->unsignedInteger('project_id')->nullable();
            $table->string('mt_project_no')->nullable();
            $table->string('project_name')->nullable();
            $table->unsignedInteger('discipline_id')->nullable();
            $table->unsignedInteger('director_in_charge_id')->nullable();
            $table->string('client_name')->nullable();
            $table->string('location')->nullable();
            $table->text('mtl_scope_detail')->nullable();
            $table->string('contact_name')->nullable();
            $table->text('comment')->nullable();
            $table->unsignedInteger('project_type_id')->nullable();
            $table->string('form_filled_by_id')->nullable();
            $table->date('form_filled_by_date')->nullable();
            $table->string('approved_by_ch_id')->nullable();
            $table->date('approved_by_ch_date')->nullable();
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
        Schema::dropIfExists('fee_sheets');
    }
}
