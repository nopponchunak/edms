<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateControlledDocumentRequestsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('controlled_document_requests', function (Blueprint $table) {
            $table->increments('id');

            $table->string('to')->nullable();
            $table->string('from')->nullable();
            $table->date('date')->nullable();

            $table->string('cdr_no')->nullable();

            // ค่าที่เป็น multi select เช่น ims,master_tech_specs
            $table->string('categories')->nullable(); 

            // addition, amendment
            $table->string('request_for')->nullable();

            $table->string('document_name')->nullable();
            $table->string('current_revision')->nullable();
            $table->string('reason_description')->nullable();
            $table->date('effective_date_purpose')->nullable();
            $table->text('attach_document_note')->nullable();

            // Requested By
            $table->string('requested_by')->nullable();
            $table->date('requested_date')->nullable();

            // Reviewer
            $table->text('review_comments')->nullable();
            $table->string('reviewed_by')->nullable();
            $table->string('reviewed_by_status')->nullable(); // pending/approved/rejected
            $table->date('reviewed_by_date')->nullable();

            // Approver
            $table->text('approval_comments')->nullable();
            $table->string('approved_by')->nullable();
            $table->string('approved_by_status')->nullable(); // pending/approved/rejected
            $table->date('approved_by_date')->nullable();

            $table->string('new_revision')->nullable();
            $table->date('action_effective_date')->nullable();

            // Acknowledged
            $table->string('acknowledged_by')->nullable();
            $table->string('acknowledged_by_status')->nullable();
            $table->date('acknowledged_by_date')->nullable();

            $table->string('create_by')->nullable();
            $table->string('update_by')->nullable();

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
        Schema::dropIfExists('controlled_document_requests');
    }
}
