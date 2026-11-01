<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateSupplierEvaluationsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('supplier_evaluations', function (Blueprint $table) {
            $table->increments('id'); // INT unsigned auto increment

            // Supplier and Project Information
            $table->string('supplier_name', 255)->charset('utf8');        // *required
            $table->string('project_name', 255)->charset('utf8')->nullable();
            $table->string('project_no', 255)->charset('utf8')->nullable();
            $table->string('department_value_duration', 255)->charset('utf8')->nullable();

            // Anti-Corruption Compliance (yes=1, no=0)
            $table->tinyInteger('anti_corruption_flag')->nullable();      // 1 = remove, 0 = proceed

            // Average rating
            $table->decimal('average_rating', 5, 2)->default(0);          // เช่น 7.50

            // Decision
            // maintain = supplier to be maintained in approved lists
            // remove   = supplier to be removed from approved lists
            $table->string('decision', 50)->charset('utf8')->nullable();

            // Sign-off Section
            $table->string('evaluated_by', 255)->charset('utf8')->nullable();
            $table->date('evaluated_by_date')->nullable();
            $table->string('evaluated_status', 255)->charset('utf8')->nullable();

            $table->string('approved_by', 255)->charset('utf8')->nullable();
            $table->date('approved_by_date')->nullable();
            $table->string('approved_by_status', 255)->charset('utf8')->nullable();

            $table->string('acknowledged_by', 255)->charset('utf8')->nullable();
            $table->date('acknowledged_by_date')->nullable();
            $table->string('acknowledged_by_status', 255)->charset('utf8')->nullable();

            // System fields ตามแบบเดิม
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
        Schema::dropIfExists('supplier_evaluations');
    }
}
