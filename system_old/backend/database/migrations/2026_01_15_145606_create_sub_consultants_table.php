<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateSubConsultantsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('sub_consultants', function (Blueprint $table) {
            $table->increments('id');

            // Master Info
            $table->string('type', 255)->comment('Sub-consultant type');
            $table->string('name', 255)->comment('Sub-consultant name');

            // Contact Info
            $table->text('address')->nullable();
            $table->string('phone', 100)->nullable();
            $table->string('email', 255)->nullable();
            $table->string('contact_person', 255)->nullable();

            // Status
            $table->enum('status', ['Active', 'Inactive'])
                  ->default('Active');

            // Audit
            $table->unsignedInteger('create_by')->nullable();
            $table->unsignedInteger('update_by')->nullable();

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
        Schema::dropIfExists('sub_consultants');
    }
}
