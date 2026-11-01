<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateAllowanceAfter10pmTable extends Migration
{
    public function up()
    {
        Schema::create('allowance_after_10pm', function (Blueprint $table) {
            $table->increments('id');

            $table->string('claimant_name', 255)->charset('utf8');
            $table->string('discipline', 50)->charset('utf8');
            $table->date('request_date');
            $table->decimal('total_baht', 15, 2)->default(0);
            $table->longText('attachments')->nullable();

            $table->string('tl_by', 100)->charset('utf8')->nullable();
            $table->string('tl_by_status', 50)->charset('utf8')->nullable();
            $table->dateTime('tl_by_date')->nullable();

            $table->string('di_by', 100)->charset('utf8')->nullable();
            $table->string('di_by_status', 50)->charset('utf8')->nullable();
            $table->dateTime('di_by_date')->nullable();

            $table->string('account_by', 100)->charset('utf8')->nullable();
            $table->string('account_by_status', 50)->charset('utf8')->nullable();
            $table->dateTime('account_by_date')->nullable();

            $table->string('notified_user', 100)->charset('utf8')->nullable();
            $table->string('notified_user_status', 50)->charset('utf8')->nullable();
            $table->dateTime('notified_user_date')->nullable();

            $table->string('status', 50)->charset('utf8')->nullable();
            $table->string('create_by', 100)->charset('utf8')->nullable();
            $table->string('update_by', 100)->charset('utf8')->nullable();

            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down()
    {
        Schema::dropIfExists('allowance_after_10pm');
    }
}
