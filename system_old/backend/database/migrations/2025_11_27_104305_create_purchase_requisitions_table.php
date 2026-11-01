<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreatePurchaseRequisitionsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('purchase_requisitions', function (Blueprint $table) {
            $table->increments('id');

            // Header
            $table->string('to', 255)->charset('utf8');
            $table->date('date');
            $table->date('deadline')->nullable();
            $table->string('recommended_by', 255)->charset('utf8')->nullable();
            $table->string('received_from', 255)->charset('utf8')->nullable();
            $table->text('reasons_for_purchase')->charset('utf8')->nullable();

            // Other conditions / attachment
            $table->text('other_conditions')->charset('utf8')->nullable();
            $table->boolean('quotation_attached')->nullable(); // 1 = yes, 0 = no

            // Workflow fields
            $table->string('requested_by', 50)->charset('utf8')->nullable();
            $table->string('requested_by_status', 50)->charset('utf8')->nullable();
            $table->date('requested_date')->nullable();

            $table->string('verified_by_is', 50)->charset('utf8')->nullable();
            $table->string('verified_by_is_status', 50)->charset('utf8')->nullable();
            $table->date('verified_is_date')->nullable();

            $table->string('verified_by', 50)->charset('utf8')->nullable();
            $table->string('verified_by_status', 50)->charset('utf8')->nullable();
            $table->date('verified_date')->nullable();

            $table->string('approved_by', 50)->charset('utf8')->nullable();
            $table->string('approved_by_status', 50)->charset('utf8')->nullable();
            $table->date('approved_date')->nullable();

            $table->string('acknowledged_by', 50)->charset('utf8')->nullable();
            $table->string('acknowledged_by_status', 50)->charset('utf8')->nullable();
            $table->date('acknowledged_date')->nullable();

            // Asset registration
            $table->boolean('need_asset_code_registration')->nullable();
            $table->string('action_by_admin', 50)->charset('utf8')->nullable();
            $table->date('action_by_admin_date')->nullable();

            // Standard
            $table->string('create_by', 100)->charset('utf8')->nullable();
            $table->string('update_by', 100)->charset('utf8')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('purchase_requisitions');
    }
}
