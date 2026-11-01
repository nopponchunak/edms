<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateSupplierEvaluationItemsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('supplier_evaluation_items', function (Blueprint $table) {
            $table->increments('id'); // INT unsigned auto increment

            $table->unsignedInteger('supplier_evaluation_id')->index();

            $table->string('item_name', 255)->charset('utf8');   // เช่น "Quality and Accuracy of Document"
            $table->integer('rating')->default(0);               // 0–10
            $table->text('comment')->nullable();                 // comment ของแต่ละข้อ

            // standard fields
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
        Schema::dropIfExists('supplier_evaluation_items');
    }
}
