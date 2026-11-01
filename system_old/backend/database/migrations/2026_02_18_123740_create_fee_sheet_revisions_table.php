<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateFeeSheetRevisionsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('fee_sheet_revisions', function (Blueprint $table) {
            $table->id();

            $table->foreignId('fee_sheet_id')
                ->constrained()
                ->cascadeOnDelete();

            $table->integer('rev_no');
            $table->boolean('is_latest')->default(true);

            
            $table->string('fee_sheet_type')->nullable();
            $table->unsignedBigInteger('project_id')->nullable();
            $table->string('project_name')->nullable();
            $table->unsignedBigInteger('discipline_id')->nullable();
            $table->unsignedInteger('director_in_charge_id')->nullable();
            $table->string('client_name')->nullable();
            $table->string('location')->nullable();
            $table->text('mtl_scope_detail')->nullable();
            $table->string('contact_name')->nullable();
            $table->text('comment')->nullable();
            $table->unsignedBigInteger('project_type_id')->nullable();
            $table->string('form_filled_by_id')->nullable();
            $table->date('form_filled_by_date')->nullable();
            $table->string('approved_by_ch_id')->nullable();
            $table->date('approved_by_ch_date')->nullable();

            $table->timestamps();

            $table->unique(['fee_sheet_id', 'rev_no']);
        });

    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('fee_sheet_revisions');
    }
}
