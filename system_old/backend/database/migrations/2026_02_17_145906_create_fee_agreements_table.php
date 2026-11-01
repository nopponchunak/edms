<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateFeeAgreementsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('fee_agreements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fee_sheet_id')->constrained('fee_sheets')->cascadeOnDelete();

            $table->integer('revision_no')->default(0);
            $table->decimal('gross_fee_excl_vat', 15, 2)->nullable();
            $table->string('less_subconsultants_name')->nullable();
            $table->decimal('less_subconsultants_number', 15, 2)->nullable();
            $table->decimal('less_other_expenses', 15, 2)->nullable();
            $table->decimal('net_fee_excl_vat', 15, 2)->nullable();
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
        Schema::dropIfExists('fee_agreements');
    }
}
