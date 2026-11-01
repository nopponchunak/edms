<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ChangeProcurementDateFieldsToDatetime extends Migration
{
    /**
     * Columns that should store datetime values.
     *
     * @var array<string, array<int, string>>
     */
    private $dateColumns = [
        'cars' => [
            'completed_by_date',
            'acknowledged_by_date',
            'verified_by_date',
            'approved_by_date',
        ],
        'charitable_contributions' => [
            'proposed_date',
            'acsc_by_date',
            'acsl_by_date',
            'approver_by_date',
        ],
        'gift_hospitalities' => [
            'proposed_date',
            'mtl_receiving_staff_by_date',
            'verified_by_date',
            'acknowledged_by_date',
            'approved_by_date',
        ],
        'gift_hospitality_offerings' => [
            'proposed_date',
            'verified_by_date',
            'acknowledged_by_date',
            'approved_by_date',
        ],
        'purchase_orders' => [
            'requisition_date',
            'purchase_request_by_date',
            'verified_by_date',
            'approved_by_date',
            'signed_by_date',
            'acknowledged_by_date',
        ],
        'supplier_evaluations' => [
            'evaluated_by_date',
            'approved_by_date',
            'acknowledged_by_date',
        ],
        'purchase_requisitions' => [
            'requested_date',
            'verified_is_date',
            'verified_date',
            'approved_date',
            'acknowledged_date',
            'action_by_admin_date',
        ],
        'supplier_assessments' => [
            'assessed_by_date',
            'approved_by_date',
            'acknowledged_by_date',
        ],
        'sub_consultant_assessments' => [
            'assessed_date',
            'approved_date',
            'acknowledged_date',
            'assessed_by_date',
            'approved_by_date',
            'acknowledged_by_date',
        ],
        'sub_consultant_evaluations' => [
            'evaluated_date',
            'approved_date',
            'acknowledged_date',
            'evaluated_by_date',
            'approved_by_date',
            'acknowledged_by_date',
        ],
    ];

    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        foreach ($this->dateColumns as $table => $columns) {
            foreach ($columns as $column) {
                if (!Schema::hasColumn($table, $column)) {
                    continue;
                }

                DB::statement(sprintf(
                    'ALTER TABLE `%s` MODIFY `%s` DATETIME NULL',
                    $table,
                    $column
                ));
            }
        }
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        foreach ($this->dateColumns as $table => $columns) {
            foreach ($columns as $column) {
                if (!Schema::hasColumn($table, $column)) {
                    continue;
                }

                DB::statement(sprintf(
                    'ALTER TABLE `%s` MODIFY `%s` DATE NULL',
                    $table,
                    $column
                ));
            }
        }
    }
}
