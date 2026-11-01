<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateSingleSourceJustificationsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('single_source_justifications', function (Blueprint $table) {
            $table->increments('id');

            // Basic Information
            $table->string('sub_consultant_supplier_name', 255)->charset('utf8'); // Sub-Consultant / Supplier Name*
            $table->string('items_supplied', 255)->charset('utf8');               // Item(s) Supplied*

            // Justification Type (Exclusive Selection) : single_source / price
            $table->string('justification_type', 50)->charset('utf8')->nullable();

            // Justification Details
            $table->text('circumstances_selection')->nullable();   // Circumstances leading to the selection*
            $table->boolean('alternatives_considered')->nullable(); // Any alternatives considered? (1 = Yes, 0 = No / null = not set)
            $table->text('reason_no_alternatives')->nullable();   // Reason for no alternatives
            $table->text('comments')->nullable();                 // Comments
            $table->text('rationale_selection')->nullable();      // Rationale for selecting the Sub-Consultant / Supplier*

            // Approval Workflow - Assessed by (ADM / Purchase)
            $table->string('assessed_by', 255)->charset('utf8')->nullable();
            $table->date('assessed_by_date')->nullable();
            $table->string('assessed_by_status', 255)->charset('utf8')->nullable();
            $table->string('corresponding_po_no', 100)->charset('utf8')->nullable();

            // Approval Workflow - Approved by (DI / MD)
            $table->string('approved_by', 255)->charset('utf8')->nullable();
            $table->date('approved_by_date')->nullable();
            $table->string('approved_by_status', 255)->charset('utf8')->nullable();
            $table->text('approved_by_comments')->nullable();

            // Approval Workflow - Acknowledged by (IMR)
            $table->string('acknowledged_by', 255)->charset('utf8')->nullable();
            $table->date('acknowledged_by_date')->nullable();
            $table->string('acknowledged_by_status', 255)->charset('utf8')->nullable();
            $table->text('acknowledged_by_comments')->nullable();

            // Standard fields ที่ใช้ทุกตาราง
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
        Schema::dropIfExists('single_source_justifications');
    }
}
