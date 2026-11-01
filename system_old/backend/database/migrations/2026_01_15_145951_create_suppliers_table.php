<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateSuppliersTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('suppliers', function (Blueprint $table) {
           $table->increments('id');

            // =========================
            // Master Info (จาก Excel)
            // =========================
            $table->string('type', 255)
                ->comment('Supplier Type เช่น Instruments and Calibration Services, Software');

            $table->string('name', 255)
                ->comment('Supplier Name');

            // =========================
            // Contact Info
            // =========================
            $table->text('address')->nullable();
            $table->string('phone', 100)->nullable();
            $table->string('email', 255)->nullable();
            $table->string('contact_person', 255)->nullable();

            // =========================
            // Status
            // =========================
            $table->enum('status', ['Active', 'Inactive'])
                ->default('Active');

            // =========================
            // Audit
            // =========================
            $table->unsignedInteger('create_by')->nullable();
            $table->unsignedInteger('update_by')->nullable();

            $table->timestamps();
            $table->softDeletes();

            // (ถ้าต้องการกันชื่อ supplier ซ้ำใน type เดียวกัน เปิดใช้ได้)
            // $table->unique(['type', 'name']);
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('suppliers');
    }
}
