<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreatePurchasesOrderTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('purchase_orders', function (Blueprint $table) {
             $table->increments('id');

            // Header Information
            $table->string('to', 255)->charset('utf8');
            $table->string('company', 255)->charset('utf8');
            $table->string('fax', 255)->charset('utf8')->nullable();

            $table->string('from', 255)->charset('utf8');
            $table->string('cc', 255)->charset('utf8')->nullable();

            // PO Info
            $table->string('po_no', 100)->charset('utf8')->nullable();
            $table->date('po_date')->nullable();
            $table->date('requisition_date')->nullable();

            $table->integer('page')->nullable();
            $table->integer('total_page')->nullable();

            $table->string('circ', 255)->charset('utf8')->nullable();

            // General Information
            $table->string('quotation_no', 255)->charset('utf8')->nullable();
            $table->date('quotation_date')->nullable();

            $table->date('delivery_date')->nullable();
            $table->string('payment_term', 500)->charset('utf8')->nullable();
            $table->text('other_conditions')->nullable();

            // Approval and Review Block
            $table->string('purchase_request_by', 50)->charset('utf8')->nullable();
            $table->date('purchase_request_by_date')->nullable();
            $table->string('purchase_request_by_status', 50)->charset('utf8')->nullable();

            $table->string('verified_by', 50)->charset('utf8')->nullable(); // Spare Part case verified by
            $table->date('verified_by_date')->nullable();
            $table->string('verified_by_status', 50)->charset('utf8')->nullable();

            $table->string('approved_by', 50)->charset('utf8')->nullable(); // MD / DI / AD / TL
            $table->date('approved_by_date')->nullable();
            $table->string('approved_by_status', 50)->charset('utf8')->nullable();

            $table->string('signed_by', 50)->charset('utf8')->nullable(); // MD / DI / AD / TL
            $table->date('signed_by_date')->nullable();
            $table->string('signed_by_status', 50)->charset('utf8')->nullable();

            $table->string('acknowledged_by', 50)->charset('utf8')->nullable(); // MD / DI / AD / TL
            $table->date('acknowledged_by_date')->nullable();
            $table->string('acknowledged_by_status', 50)->charset('utf8')->nullable();

            // Checklist (Yes = 1 / No = 0)
            $table->boolean('delivery_on_time')->nullable();
            $table->boolean('meet_quality_requirement')->nullable();
            $table->boolean('meet_equipment_guidelines')->nullable();

            // Comments
            $table->text('comments')->nullable();

            // Control fields
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
        Schema::dropIfExists('order_purchases');
    }
}
