<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateSignatureSettingsTable extends Migration
{
    public function up()
    {
        if (Schema::hasTable('signature_settings')) {
            return;
        }

        Schema::create('signature_settings', function (Blueprint $table) {
            $table->id();
            $table->string('employee_code', 255)->unique();
            $table->tinyInteger('is_active')->default(1);
            $table->string('create_by', 100)->nullable();
            $table->string('update_by', 100)->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down()
    {
        Schema::dropIfExists('signature_settings');
    }
}
