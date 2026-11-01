<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateExpensesClaimItemsTable extends Migration
{
    public function up()
    {
        Schema::create('expenses_claim_items', function (Blueprint $table) {
            $table->increments('id');

            $table->unsignedInteger('expenses_claim_id');
            $table->smallInteger('seq')->nullable();
            $table->date('item_date');
            $table->unsignedInteger('project_detail_id');
            $table->string('project_code', 100)->charset('utf8')->nullable();
            $table->string('project_name', 255)->charset('utf8')->nullable();
            $table->text('details');
            $table->decimal('baht', 15, 2)->default(0);

            $table->string('create_by', 100)->charset('utf8')->nullable();
            $table->string('update_by', 100)->charset('utf8')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('expenses_claim_id')
                ->references('id')->on('expenses_claims')
                ->onDelete('cascade');
        });
    }

    public function down()
    {
        Schema::dropIfExists('expenses_claim_items');
    }
}
