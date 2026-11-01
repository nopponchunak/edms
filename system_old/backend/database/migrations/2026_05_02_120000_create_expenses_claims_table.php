<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateExpensesClaimsTable extends Migration
{
    public function up()
    {
        Schema::create('expenses_claims', function (Blueprint $table) {
            $table->increments('id');

            $table->string('voucher_no', 100)->charset('utf8')->unique();
            $table->string('claimant_name', 255)->charset('utf8');
            $table->string('recive_by', 100)->charset('utf8')->nullable();
            $table->date('claim_date');
            $table->decimal('total_baht', 15, 2)->default(0);

            $table->string('verified_by', 100)->charset('utf8')->nullable();
            $table->string('verified_by_status', 50)->charset('utf8')->nullable();
            $table->dateTime('verified_by_date')->nullable();

            $table->string('approved_by', 100)->charset('utf8')->nullable();
            $table->string('approved_by_status', 50)->charset('utf8')->nullable();
            $table->dateTime('approved_by_date')->nullable();

            $table->string('status', 50)->charset('utf8')->nullable();
            $table->string('create_by', 100)->charset('utf8')->nullable();
            $table->string('update_by', 100)->charset('utf8')->nullable();

            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down()
    {
        Schema::dropIfExists('expenses_claims');
    }
}
