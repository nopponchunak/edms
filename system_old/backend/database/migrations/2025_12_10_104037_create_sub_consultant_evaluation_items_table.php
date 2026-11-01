<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateSubConsultantEvaluationItemsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('sub_consultant_evaluation_items', function (Blueprint $table) {
            $table->increments('id');

            $table->unsignedInteger('sub_consultant_eva_id');

            $table->integer('item_no')->default(0); // 1..8
            $table->string('item_name', 255)->charset('utf8'); // ชื่อหัวข้อ
            $table->decimal('rating', 5, 2)->nullable();       // คะแนน 0 - 10
            $table->text('comment')->charset('utf8')->nullable();

            $table->string('create_by', 100)->charset('utf8')->nullable();
            $table->string('update_by', 100)->charset('utf8')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('sub_consultant_eva_id')
                ->references('id')->on('sub_consultant_evaluations')
                ->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('sub_consultant_evaluation_items');
    }
}
