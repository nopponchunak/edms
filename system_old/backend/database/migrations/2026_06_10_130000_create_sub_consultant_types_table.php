<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CreateSubConsultantTypesTable extends Migration
{
    public function up()
    {
        Schema::create('sub_consultant_types', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->text('detail')->nullable();
            $table->tinyInteger('is_active')->default(1);
            $table->timestamps();
            $table->softDeletes();
        });

        DB::table('sub_consultant_types')->insert([
            [
                'code' => 'ARCHITECTURE',
                'name' => 'Architecture',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'CIVIL_STRUCTURAL',
                'name' => 'Civil and Structural Engineering',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'MECHANICAL_ELECTRICAL',
                'name' => 'Mechanical and Electrical Engineering',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'QUANTITY_SURVEYING',
                'name' => 'Quantity Surveying',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'FACADE',
                'name' => 'Facade Consultant',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'GEOTECHNICAL',
                'name' => 'Geotechnical Consultant',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'SURVEYING',
                'name' => 'Surveying',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'ENVIRONMENTAL',
                'name' => 'Environmental Consultant',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'TRAFFIC_TRANSPORTATION',
                'name' => 'Traffic and Transportation',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'LIGHTING',
                'name' => 'Lighting Consultant',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'ACOUSTIC',
                'name' => 'Acoustic Consultant',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'FIRE_SAFETY',
                'name' => 'Fire Safety Consultant',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'BIM',
                'name' => 'BIM Consultant',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'OTHER_SERVICES',
                'name' => 'Other Services',
                'detail' => null,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }

    public function down()
    {
        Schema::dropIfExists('sub_consultant_types');
    }
}
