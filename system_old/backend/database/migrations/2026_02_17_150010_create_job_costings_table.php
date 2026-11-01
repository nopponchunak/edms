<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateJobCostingsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('job_costings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fee_sheet_id')->constrained('fee_sheets')->cascadeOnDelete();

            $table->enum('phase', ['P', 'D', 'T', 'C']);
            $table->integer('percent')->nullable();
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
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
        Schema::dropIfExists('job_costings');
    }
}
