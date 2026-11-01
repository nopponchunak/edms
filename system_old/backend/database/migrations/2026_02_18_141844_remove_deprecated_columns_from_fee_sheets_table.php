<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class RemoveDeprecatedColumnsFromFeeSheetsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('fee_sheets', function (Blueprint $table) {
            $table->dropForeign(['discipline_id']);
            $table->dropForeign(['director_in_charge_id']);
            $table->dropForeign(['project_type_id']);
        });

        Schema::table('fee_sheets', function (Blueprint $table) {
            $table->dropColumn([
                'project_name',
                'discipline_id',
                'director_in_charge_id',
                'client_name',
                'location',
                'mtl_scope_detail',
                'contact_name',
                'comment',
                'project_type_id',
                'form_filled_by_id',
                'form_filled_by_date',
                'approved_by_ch_id',
                'approved_by_ch_date',
            ]);
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('fee_sheets', function (Blueprint $table) {
            $table->string('project_name')->nullable();
            $table->unsignedBigInteger('discipline_id')->nullable();
            $table->unsignedBigInteger('director_in_charge_id')->nullable();
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

            // Re-add Foreign Keys
            $table->foreign('discipline_id')->references('id')->on('disciplines');
            $table->foreign('director_in_charge_id')->references('id')->on('users');
            $table->foreign('project_type_id')->references('id')->on('project_types');
        });
    }
}
