<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateGiftHospitalityOfferingsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('gift_hospitality_offerings', function (Blueprint $table) {
            $table->increments('id'); // INT unsigned auto-increment

            // Request Type (gift / hospitality)
            $table->string('request_type', 50)->charset('utf8'); // map จาก type

            // Offering Details
            $table->text('description')->nullable();  // Description of Gift/Hospitality
            $table->text('purpose')->nullable();      // Purpose of offering
            $table->decimal('value', 12, 2)->nullable(); // Value (THB)

            // Receiver & Date
            $table->string('receiver_name_and_company', 255)->charset('utf8')->nullable();
            $table->date('proposed_date')->nullable(); // แปลงวันที่ใน controller

            // Approval Workflow
            $table->string('verified_by', 50)->charset('utf8')->nullable();
            $table->date('verified_by_date')->nullable();
            $table->string('verified_by_status', 255)->charset('utf8')->nullable();
            $table->string('acknowledged_by', 50)->charset('utf8')->nullable();
            $table->date('acknowledged_by_date')->nullable();
            $table->string('acknowledged_by_status', 255)->charset('utf8')->nullable();
            $table->string('approved_by', 50)->charset('utf8')->nullable();
            $table->date('approved_by_date')->nullable();
            $table->string('approved_by_status', 255)->charset('utf8')->nullable();

            // ผู้สร้าง/ผู้แก้ไข ตามมาตรฐานคุณ
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
        Schema::dropIfExists('hift_hospitality_offerings');
    }
}
