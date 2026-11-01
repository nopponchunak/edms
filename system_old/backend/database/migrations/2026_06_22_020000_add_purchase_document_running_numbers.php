<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AddPurchaseDocumentRunningNumbers extends Migration
{
    public function up()
    {
        if (Schema::hasTable('purchase_requisitions') && !Schema::hasColumn('purchase_requisitions', 'pr_no')) {
            Schema::table('purchase_requisitions', function (Blueprint $table) {
                $afterColumn = Schema::hasColumn('purchase_requisitions', 'status') ? 'status' : 'id';
                $table->string('pr_no', 100)->nullable()->after($afterColumn);
            });
        }

        $this->backfillDocumentNumbers('purchase_requisitions', 'pr_no', 'PR', ['date', 'created_at', 'updated_at']);
        $this->backfillDocumentNumbers('purchase_orders', 'po_no', 'PO', ['po_date', 'created_at', 'updated_at']);
    }

    public function down()
    {
        if (Schema::hasTable('purchase_requisitions') && Schema::hasColumn('purchase_requisitions', 'pr_no')) {
            Schema::table('purchase_requisitions', function (Blueprint $table) {
                $table->dropColumn('pr_no');
            });
        }
    }

    private function backfillDocumentNumbers(string $table, string $column, string $prefix, array $dateColumns): void
    {
        if (!Schema::hasTable($table) || !Schema::hasColumn($table, $column)) {
            return;
        }

        $selectColumns = array_values(array_unique(array_merge(['id'], array_filter($dateColumns, function ($dateColumn) use ($table) {
            return Schema::hasColumn($table, $dateColumn);
        }))));

        $documents = DB::table($table)
            ->select($selectColumns)
            ->get()
            ->sortBy(function ($row) use ($dateColumns) {
                $year = $this->yearFromRow($row, $dateColumns);
                $timestamp = $this->timestampFromRow($row, $dateColumns);

                return sprintf('%04d-%012d-%010d', $year, $timestamp, (int) $row->id);
            });

        $counters = [];

        foreach ($documents as $document) {
            $year = $this->yearFromRow($document, $dateColumns);
            $counters[$year] = ($counters[$year] ?? 0) + 1;

            DB::table($table)
                ->where('id', $document->id)
                ->update([
                    $column => $prefix . $year . str_pad((string) $counters[$year], 4, '0', STR_PAD_LEFT),
                ]);
        }
    }

    private function yearFromRow($row, array $dateColumns): int
    {
        foreach ($dateColumns as $dateColumn) {
            if (!isset($row->{$dateColumn}) || $row->{$dateColumn} === null || $row->{$dateColumn} === '') {
                continue;
            }

            $timestamp = strtotime((string) $row->{$dateColumn});
            if ($timestamp !== false) {
                return (int) date('Y', $timestamp);
            }
        }

        return (int) date('Y');
    }

    private function timestampFromRow($row, array $dateColumns): int
    {
        foreach ($dateColumns as $dateColumn) {
            if (!isset($row->{$dateColumn}) || $row->{$dateColumn} === null || $row->{$dateColumn} === '') {
                continue;
            }

            $timestamp = strtotime((string) $row->{$dateColumn});
            if ($timestamp !== false) {
                return $timestamp;
            }
        }

        return 0;
    }
}
