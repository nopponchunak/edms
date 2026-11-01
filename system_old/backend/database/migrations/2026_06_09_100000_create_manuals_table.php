<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateManualsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('manuals', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('title', 255)->charset('utf8');
            $table->text('description')->charset('utf8')->nullable();
            $table->string('original_file_name', 255)->charset('utf8')->nullable();
            $table->string('stored_file_name', 255)->charset('utf8')->nullable();
            $table->string('file_path', 500)->charset('utf8');
            $table->string('mime_type', 100)->charset('utf8')->nullable();
            $table->string('file_extension', 20)->charset('utf8')->nullable();
            $table->unsignedBigInteger('file_size')->nullable();
            $table->string('status', 20)->charset('utf8')->default('active')->index();
            $table->string('uploaded_by', 100)->charset('utf8')->nullable()->index();
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
        Schema::dropIfExists('manuals');
    }
}
