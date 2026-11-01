<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateCharitableContributionsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('charitable_contributions', function (Blueprint $table) {
            $table->increments('id'); // INT unsigned

            // ข้อมูลคำขอ
            $table->string('request_type', 100)->charset('utf8');           // ex. "charitable_contribution"
            $table->text('event_description')->nullable();                  // รายละเอียดกิจกรรม
            $table->text('event_purpose')->nullable();                      // วัตถุประสงค์
            $table->string('organizer_name', 255)->charset('utf8');         // ผู้จัด
            $table->text('contribution_description')->nullable();           // รายละเอียดการสนับสนุน

            // มูลค่า/ภาษี/วันที่เสนอ
            $table->decimal('value_amount', 12, 2)->nullable();             // ex. 12
            $table->decimal('vat_amount', 12, 2)->nullable();               // ex. 0.84
            $table->date('proposed_date')->nullable();                      // ex. 0099-12-31

            // อ้างอิง master / approver
            $table->string('acsc_by', 50)->charset('utf8')->nullable();      // selectedAcscId
            $table->date('acsc_by_date')->nullable();
            $table->string('acsc_by_status', 255)->charset('utf8')->nullable();
            $table->string('acsl_by', 50)->charset('utf8')->nullable();        // selectedAcslId
            $table->date('acsl_by_date')->nullable();
            $table->string('acsl_by_status', 255)->charset('utf8')->nullable();
            $table->string('approver_by', 50)->charset('utf8')->nullable();    // selectedApproverId
            $table->date('approver_by_date')->nullable();
            $table->string('approver_by_status', 255)->charset('utf8')->nullable();

            // ผู้สร้าง/ผู้แก้ไข
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
        Schema::dropIfExists('charitable_contributions');
    }
}
