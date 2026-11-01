<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateSupplierAssessmentsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('supplier_assessments', function (Blueprint $table) {
            $table->increments('id'); // INT unsigned

            // ===== Assessment Details =====
            $table->string('items_supplied', 500)->charset('utf8')->nullable(); // Item(s) supplied

            // ข้อมูลบริษัทที่ถูกประเมิน (Assessment: 1. Company:)
            $table->string('company_name', 255)->charset('utf8')->nullable();

            // ===== Information used for Assessment (checkbox) =====
            $table->tinyInteger('info_company_profile')->default(0)
                ->comment('Company Profile / Biodata');
            $table->tinyInteger('info_project_reference')->default(0)
                ->comment('Project Reference / Certificates');
            $table->tinyInteger('info_site_visit')->default(0)
                ->comment('Site Visit');
            $table->tinyInteger('info_previous_assessment_record')->default(0)
                ->comment('Previous Assessment Record');
            $table->tinyInteger('info_previous_evaluation_record')->default(0)
                ->comment('Previous Evaluation Record');
            $table->tinyInteger('info_iso_certificates')->default(0)
                ->comment('ISO Certificates');

            // ===== Assessment Areas (Score 1–10) =====
            $table->unsignedTinyInteger('experience_score')->nullable()
                ->comment('Experience since establishment (1–10)');
            $table->unsignedTinyInteger('staff_score')->nullable()
                ->comment('Fully qualified staff (1–10)');
            $table->unsignedTinyInteger('product_compliance_score')->nullable()
                ->comment('Product compliances with accepted standards (1–10)');

            $table->unsignedTinyInteger('total_score')->nullable()
                ->comment('Total Score (must exceed 15)');

            // ===== References (a, b) =====
            $table->string('reference_a_name', 255)->charset('utf8')->nullable();
            $table->string('reference_a_opinion', 255)->charset('utf8')->nullable();
            $table->string('reference_b_name', 255)->charset('utf8')->nullable();
            $table->string('reference_b_opinion', 255)->charset('utf8')->nullable();

            // ===== Recommendation =====
            // accept / not_accept
            $table->string('recommendation', 50)->charset('utf8')->nullable();
            $table->text('recommendation_reason')->nullable(); // Reason

            // ===== Assessment & Approval Workflow =====
            $table->string('assessed_by', 255)->charset('utf8')->nullable();   // Assessed By (DI/TL)
            $table->date('assessed_by_date')->nullable();
            $table->string('assessed_by_status', 255)->charset('utf8')->nullable();

            // Is the above Supplier approved to go on the Approved Supplier List? (Yes/No)
            $table->tinyInteger('approved_to_supplier_list')->default(0); // 1 = Yes, 0 = No
            $table->text('remark')->nullable(); // Remark

            $table->string('approved_by', 255)->charset('utf8')->nullable();   // Approved By (MD/DI)
            $table->date('approved_by_date')->nullable();
            $table->string('approved_by_status', 255)->charset('utf8')->nullable();

            $table->string('acknowledged_by', 50)->charset('utf8')->nullable(); // Acknowledged By (IMR)
            $table->date('acknowledged_by_date')->nullable();
            $table->string('acknowledged_by_status', 255)->charset('utf8')->nullable();

            // ===== Audit fields =====
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
        Schema::dropIfExists('supplier_assessments');
    }
}
