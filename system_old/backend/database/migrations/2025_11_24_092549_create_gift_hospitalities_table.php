<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateGiftHospitalitiesTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('gift_hospitalities', function (Blueprint $table) {
            $table->increments('id'); // INT unsigned auto-increment

            // Request Type (gift / hospitality)
            $table->string('request_type', 50)->charset('utf8');

            // Request Details
            $table->text('description')->nullable();   // description of gift/hospitality
            $table->text('purpose')->nullable();       // purpose of receiving
            $table->decimal('value', 12, 2)->nullable(); // THB value

            // Company and Date Information
            $table->string('company_of_giver', 255)->charset('utf8')->nullable();
            $table->date('proposed_date')->nullable();  // dd-mm-yyyy → convert in controller

            $table->string('mtl_receiving_staff_by', 50)->charset('utf8')->nullable();
            $table->date('mtl_receiving_staff_by_date')->nullable();
            $table->string('mtl_receiving_staff_by_status', 255)->charset('utf8')->nullable();

            // Workflow Approvers
            $table->string('verified_by', 50)->charset('utf8')->nullable();
            $table->date('verified_by_date')->nullable();
            $table->string('verified_by_status', 255)->charset('utf8')->nullable();
            $table->string('acknowledged_by', 50)->charset('utf8')->nullable();
            $table->date('acknowledged_by_date')->nullable();
            $table->string('acknowledged_by_status', 255)->charset('utf8')->nullable();
            $table->string('approved_by', 50)->charset('utf8')->nullable();
            $table->date('approved_by_date')->nullable();
            $table->string('approved_by_status', 255)->charset('utf8')->nullable();

            // Create/Update By
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
        Schema::dropIfExists('gift_hospitalities');
    }
}
