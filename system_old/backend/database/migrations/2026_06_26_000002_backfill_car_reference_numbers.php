<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class BackfillCarReferenceNumbers extends Migration
{
    private const REF_SEQUENCE_PAD_LENGTH = 3;

    public function up()
    {
        if (!Schema::hasTable('cars') || !Schema::hasColumn('cars', 'ref_no')) {
            return;
        }

        $rows = DB::table('cars')
            ->select('id', 'ref_no', 'date', 'created_at', 'updated_at')
            ->orderByRaw('COALESCE(`date`, DATE(`created_at`), DATE(`updated_at`), CURDATE()) ASC')
            ->orderBy('id')
            ->get();

        if ($rows->isEmpty()) {
            return;
        }

        $lastSequenceByYear = [];

        foreach ($rows as $row) {
            $year = $this->yearFromRow($row);
            $sequence = $this->sequenceFromReferenceNumber($row->ref_no, $year);

            if ($sequence !== null) {
                $lastSequenceByYear[$year] = max($lastSequenceByYear[$year] ?? 0, $sequence);
            }
        }

        foreach ($rows as $row) {
            $year = $this->yearFromRow($row);

            if ($this->sequenceFromReferenceNumber($row->ref_no, $year) !== null) {
                continue;
            }

            $lastSequenceByYear[$year] = ($lastSequenceByYear[$year] ?? 0) + 1;

            DB::table('cars')
                ->where('id', $row->id)
                ->update([
                    'ref_no' => $this->formatReferenceNumber($lastSequenceByYear[$year], $year),
                ]);
        }
    }

    public function down()
    {
        // Old free-text CAR reference numbers cannot be restored safely.
    }

    private function formatReferenceNumber(int $sequence, int $year): string
    {
        return str_pad((string) $sequence, self::REF_SEQUENCE_PAD_LENGTH, '0', STR_PAD_LEFT) . '/' . $year;
    }

    private function sequenceFromReferenceNumber($value, int $year): ?int
    {
        $value = trim((string) ($value ?? ''));

        if (!preg_match('/^(\d{' . self::REF_SEQUENCE_PAD_LENGTH . ',})\/' . preg_quote((string) $year, '/') . '$/', $value, $matches)) {
            return null;
        }

        return (int) $matches[1];
    }

    private function yearFromRow($row): int
    {
        $value = $row->date ?: ($row->created_at ?: $row->updated_at);

        if ($value) {
            try {
                return (int) Carbon::parse($value)->format('Y');
            } catch (\Throwable $e) {
                return (int) now()->format('Y');
            }
        }

        return (int) now()->format('Y');
    }
}
