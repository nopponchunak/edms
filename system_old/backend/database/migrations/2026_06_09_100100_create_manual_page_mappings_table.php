<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateManualPageMappingsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('manual_page_mappings', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('manual_id')->index();
            $table->integer('menu_id')->unsigned()->nullable()->index();
            $table->string('url_path', 500)->charset('utf8');
            $table->string('normalized_path', 500)->charset('utf8');
            $table->string('match_type', 20)->charset('utf8')->default('exact')->index();
            $table->unsignedInteger('display_order')->default(1)->index();
            $table->tinyInteger('is_active')->default(1)->index();
            $table->string('create_by', 100)->charset('utf8')->nullable();
            $table->string('update_by', 100)->charset('utf8')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('manual_id')->references('id')->on('manuals')->onDelete('cascade');
            $table->foreign('menu_id')->references('id')->on('menus')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('manual_page_mappings');
    }
}
