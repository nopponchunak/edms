<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateSubConsultantAssessmentsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('sub_consultant_assessments', function (Blueprint $table) {
            $table->increments('id');

            // -----------------------------
            // Document / Form Info
            // -----------------------------
            $table->string('form_code', 50)->charset('utf8')->nullable();   // MTSC-01
            $table->string('form_title', 255)->charset('utf8')->nullable(); // Sub-Consultant Assessment Form

            // -----------------------------
            // Header Information
            // -----------------------------
            $table->string('to', 255)->charset('utf8');
            $table->string('circ', 255)->charset('utf8');
            $table->text('scope_of_service')->nullable();

            // -----------------------------
            // Information used for Assessment (checkbox)
            // -----------------------------
            $table->boolean('info_company_profile_biodata')->nullable();
            $table->boolean('info_site_visit')->nullable();
            $table->boolean('info_previous_evaluation_record')->nullable();
            $table->boolean('info_project_reference_certificates')->nullable();
            $table->boolean('info_previous_assessment_record')->nullable();
            $table->boolean('info_iso_certificates')->nullable();

            // -----------------------------
            // Assessment (Item 1)
            // -----------------------------
            $table->string('company', 255)->charset('utf8')->nullable();

            $table->tinyInteger('score_experience_since_establishment')->nullable(); // 0-10
            $table->tinyInteger('score_fully_qualified_staff')->nullable();         // 0-10
            $table->tinyInteger('score_completed_similar_projects')->nullable();    // 0-10

            $table->smallInteger('item1_total_score')->nullable(); // optional (sum)

            // -----------------------------
            // Compliance to EMS and OHSMS (Item 2)
            // -----------------------------
            $table->boolean('ems_iso_14001')->nullable();
            $table->boolean('ems_ohsas_18001')->nullable();
            $table->boolean('ems_iso_45001')->nullable();

            // -----------------------------
            // Recommendation
            // -----------------------------
            $table->string('recommendation', 50)->charset('utf8')->nullable(); // accept | not_accept
            $table->text('recommendation_reason')->nullable();

            // -----------------------------
            // Decision #3: Sub-Consultant List
            // -----------------------------
            $table->boolean('decision_sub_consultant_list')->nullable(); // yes/no

            // -----------------------------
            // Remark
            // -----------------------------
            $table->text('remark')->nullable();

            // -----------------------------
            // Signatures / Approval Flow
            // (ตามแนวเดียวกับ PO: by + date + status)
            // -----------------------------
            $table->string('assessed_by', 100)->charset('utf8')->nullable();
            $table->date('assessed_date')->nullable();
            $table->string('assessed_by_status', 50)->charset('utf8')->nullable();

            $table->string('approved_by', 100)->charset('utf8')->nullable();
            $table->date('approved_date')->nullable();
            $table->string('approved_by_status', 50)->charset('utf8')->nullable();

            $table->string('acknowledged_by', 100)->charset('utf8')->nullable();
            $table->date('acknowledged_date')->nullable();
            $table->string('acknowledged_by_status', 50)->charset('utf8')->nullable();

            // -----------------------------
            // Overall Status
            // -----------------------------
            $table->string('status', 50)->charset('utf8')->nullable(); // draft/submitted/...

            // -----------------------------
            // Control fields
            // -----------------------------
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
        Schema::dropIfExists('sub_consultant_assessments');
    }
}
