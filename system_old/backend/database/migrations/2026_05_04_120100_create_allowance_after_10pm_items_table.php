<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateAllowanceAfter10pmItemsTable extends Migration
{
    public function up()
    {
        Schema::create('allowance_after_10pm_items', function (Blueprint $table) {
            $table->increments('id');

            $table->unsignedInteger('allowance_after_10pm_id');
            $table->smallInteger('seq')->nullable();
            $table->date('work_date');
            $table->unsignedInteger('project_detail_id');
            $table->string('project_code', 100)->charset('utf8')->nullable();
            $table->string('project_name', 255)->charset('utf8')->nullable();
            $table->text('description');
            $table->time('time_from')->nullable();
            $table->time('time_to')->nullable();
            $table->decimal('baht', 15, 2)->default(0);

            $table->string('create_by', 100)->charset('utf8')->nullable();
            $table->string('update_by', 100)->charset('utf8')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('allowance_after_10pm_id')
                ->references('id')->on('allowance_after_10pm')
                ->onDelete('cascade');
        });
    }

    public function down()
    {
        Schema::dropIfExists('allowance_after_10pm_items');
    }
}
