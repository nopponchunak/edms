<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateProposalContractReviewsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('proposal_contract_reviews', function (Blueprint $table) {
            $table->increments('id');

            // ===== Header Information =====
            $table->string('copies_to', 255)->charset('utf8')->nullable();      // Copies to
            $table->string('circ_adm', 255)->charset('utf8')->nullable();       // Circ: ADM/
            $table->string('ch_file', 255)->charset('utf8')->nullable();        // CH/File

            // ===== Project Identification =====
            $table->string('project_name', 255)->charset('utf8');               // Project Name*
            $table->string('project_no', 255)->charset('utf8');                 // Project No.*
            $table->boolean('proposal_attached')->nullable();                   // Proposal Attached (Yes/No)

            // ===== Location =====
            $table->string('city', 255)->charset('utf8');                       // City*
            $table->string('country', 255)->charset('utf8');                    // Country*

            // ===== Client Information =====
            $table->string('client_name', 255)->charset('utf8');                // Client*
            $table->string('client_contact_name', 255)->charset('utf8');        // Contact Name*
            $table->text('client_address')->nullable();                         // Address*
            $table->string('client_tel_no', 100)->charset('utf8')->nullable();  // Tel. No.
            $table->string('client_fax_no', 100)->charset('utf8')->nullable();  // Fax No.

            // ===== Architect Information (Optional) =====
            $table->string('architect_name', 255)->charset('utf8')->nullable();         // Architect
            $table->string('architect_contact_name', 255)->charset('utf8')->nullable(); // Contact Name
            $table->text('architect_address')->nullable();                              // Address
            $table->string('architect_tel_no', 100)->charset('utf8')->nullable();       // Tel. No.
            $table->string('architect_fax_no', 100)->charset('utf8')->nullable();       // Fax No.

            // ===== Project Details =====
            $table->boolean('enquiry_from')->nullable();                        // Enquiry From (Yes/No)

            // Project Details – Checkbox
            $table->boolean('pd_concept_detail_design')->nullable();            // Concept & Detail Design
            $table->boolean('pd_value_engineering')->nullable();                // Value Engineering
            $table->boolean('pd_engineering_audit')->nullable();                // Engineering Audit
            $table->boolean('pd_construction_supervision')->nullable();         // Construction Supervision
            $table->boolean('pd_tender_evaluation')->nullable();                // Tender Evaluation
            $table->boolean('pd_others_flag')->nullable();                      // Others (checkbox)
            $table->string('pd_others_text', 255)->charset('utf8')->nullable(); // Others text (ถ้ามี)

            // Discipline – Checkbox
            $table->boolean('disc_cs')->nullable();                             // C&S
            $table->boolean('disc_facade')->nullable();                         // Façade
            $table->boolean('disc_transportation')->nullable();                // Transportation
            $table->boolean('disc_me')->nullable();                             // M&E
            $table->boolean('disc_lighting')->nullable();                       // Lighting
            $table->boolean('disc_others_flag')->nullable();                    // Others (checkbox)
            $table->string('disc_others_text', 255)->charset('utf8')->nullable(); // Others text

            // Project Type / Fees
            $table->string('project_type', 255)->charset('utf8');               // Project Type*
            $table->boolean('fee_calculation_attached')->nullable();            // Fee Calculation Attached (Yes/No)
            $table->decimal('estimated_total_fees', 15, 2)->nullable();         // Estimated Value of total fees*
            $table->string('currency', 50)->charset('utf8');                    // Currency*

            // ===== Scope and Resources =====
            $table->boolean('scope_clearly_defined')->nullable();               // Is scope of work clearly defined?
            $table->boolean('staff_resources_available')->nullable();           // Are adequate staff and other resources available?
            $table->boolean('help_from_other_offices')->nullable();             // Is help from any other Meinhardt's offices required?
            $table->boolean('sub_consultants_required')->nullable();            // Sub-consultants / Sub-contractors required?

            // ===== Quality and Considerations =====
            $table->text('qa_requirements')->nullable();                        // Any special Quality Assurance requirement...
            $table->text('special_considerations')->nullable();                 // Any special considerations?
            $table->text('quality_comments')->nullable();                       // Comments

            // ===== Project Classification =====
            $table->boolean('is_government_project')->nullable();               // Government Project
            $table->boolean('is_mmcl_project')->nullable();                     // MMCL Project
            $table->boolean('is_mtl_project')->nullable();                      // MTL

            // ===== Administrative Details =====
            $table->string('filled_in_by', 255)->charset('utf8');               // Filled in by*
            $table->date('filled_in_date')->nullable();                         // Date*

            // ===== Conclusion of Proposal Review =====
            $table->boolean('proposal_to_be_submitted')->nullable();            // Proposal to be submitted
            $table->boolean('proposal_decline')->nullable();                    // Decline
            $table->unsignedInteger('win_probability')->nullable();            // % Win probability (0–100)

            // Reviewers (Proposal) – Maximum 3
            $table->string('proposal_reviewer1', 255)->charset('utf8')->nullable();
            $table->date('proposal_reviewer1_date')->nullable();
            $table->string('proposal_reviewer2', 255)->charset('utf8')->nullable();
            $table->date('proposal_reviewer2_date')->nullable();
            $table->string('proposal_reviewer3', 255)->charset('utf8')->nullable();
            $table->date('proposal_reviewer3_date')->nullable();

            // ===== Conclusion of Contract Review =====
            $table->boolean('contract_agreed_to_proceed')->nullable();          // Contract Agreed to Proceed
            $table->boolean('contract_decline')->nullable();                    // Decline
            $table->string('lead_tl', 255)->charset('utf8')->nullable();        // Lead TL
            $table->string('tl_name', 255)->charset('utf8')->nullable();        // TL
            $table->boolean('need_quality_plan_pqp')->nullable();               // Need to proceed a project Quality Plan (PQP)

            // Reviewers (Contract) – Maximum 3
            $table->string('contract_reviewer1', 255)->charset('utf8')->nullable();
            $table->date('contract_reviewer1_date')->nullable();
            $table->string('contract_reviewer2', 255)->charset('utf8')->nullable();
            $table->date('contract_reviewer2_date')->nullable();
            $table->string('contract_reviewer3', 255)->charset('utf8')->nullable();
            $table->date('contract_reviewer3_date')->nullable();

            // ===== Standard fields (เหมือนทุกตาราง) =====
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
        Schema::dropIfExists('proposal_contract_reviews');
    }
}
