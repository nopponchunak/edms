<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateUpdateStatusLogsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('update_status_logs', function (Blueprint $table) {
            $table->increments('id');

            // ตารางที่ถูกเปลี่ยน
            $table->string('table_name', 100)->charset('utf8');

            // id ของ record ในตารางนั้น
            $table->unsignedInteger('record_id')->index();

            // ชื่อฟิลด์ที่เปลี่ยน เช่น status, approver_by
            $table->string('field_name', 100)->charset('utf8');

            // ค่าเดิม / ค่าใหม่
            $table->string('old_value', 255)->charset('utf8')->nullable();
            $table->string('new_value', 255)->charset('utf8')->nullable();

            // ข้อมูลผู้เปลี่ยน
            $table->unsignedInteger('changed_by')->nullable();         // user_id
            $table->string('changed_by_name', 255)->charset('utf8')->nullable();

            // หมายเหตุเพิ่มเติม
            $table->string('remark', 255)->charset('utf8')->nullable();

            // standard
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
        Schema::dropIfExists('update_status_logs');
    }
}
