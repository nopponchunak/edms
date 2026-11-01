<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CreateSupplierTypesTable extends Migration
{
    public function up()
    {
        Schema::create('supplier_types', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->text('detail')->nullable();
            $table->tinyInteger('is_active')->default(1);
            $table->timestamps();
            $table->softDeletes();
        });

        DB::table('supplier_types')->insert([
            [
                'code' => 'INSTRUMENTS_CALIBRATION',
                'name' => 'Instruments and Calibration Services',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'SOFTWARE',
                'name' => 'Software',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'OFFICE_EQUIPMENT_HARDWARE_ACCESSORIES',
                'name' => 'Office Equipment, Hardware and Accessories',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'ADVISORS',
                'name' => 'Advisors',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'LAWYER',
                'name' => 'Lawyer',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'AUDITORS',
                'name' => 'Auditors',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'INSTITUTE_MEMBERSHIPS',
                'name' => 'Institute Memberships',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'CAR_RENTAL_MAINTENANCES',
                'name' => 'Car, Car Rental and Car Maintenances',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'MEMBERSHIPS',
                'name' => 'Memberships',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'TRAVELLING',
                'name' => 'Travelling',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'INSURANCES',
                'name' => 'Insurances',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'IT_INTERNET_SYSTEMS',
                'name' => 'IT and Internet Systems',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'TRAINING',
                'name' => 'Training',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'EVENT_ORGANIZING_ENTERTAINMENT_AGENCIES',
                'name' => 'Event Organizing and Entertainment Agencies',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'OTHER_PRODUCTS_SERVICES',
                'name' => 'Other Products and Services',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }

    public function down()
    {
        Schema::dropIfExists('supplier_types');
    }
}
