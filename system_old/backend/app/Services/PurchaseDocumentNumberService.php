<?php

namespace App\Services;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\SoftDeletes;

class PurchaseDocumentNumberService
{
    private const SEQUENCE_PAD_LENGTH = 4;

    public function yearFromDate($value): int
    {
        if ($value instanceof \DateTimeInterface) {
            return (int) $value->format('Y');
        }

        $value = trim((string) ($value ?? ''));

        if ($value === '') {
            return (int) now()->format('Y');
        }

        if (preg_match('/^\d{4}$/', $value)) {
            return (int) $value;
        }

        try {
            return (int) Carbon::parse($value)->format('Y');
        } catch (\Throwable $e) {
            return (int) now()->format('Y');
        }
    }

    public function next(string $modelClass, string $column, string $prefix, int $year, bool $lock = false): string
    {
        $query = $this->queryForModel($modelClass)
            ->whereNotNull($column)
            ->where($column, 'like', $this->formatPrefix($prefix, $year) . '%');

        if ($lock) {
            $query->lockForUpdate();
        }

        $maxSequence = 0;

        foreach ($query->pluck($column) as $number) {
            $sequence = $this->sequenceFromNumber($number, $prefix, $year);
            if ($sequence !== null) {
                $maxSequence = max($maxSequence, $sequence);
            }
        }

        return $this->format($prefix, $year, $maxSequence + 1);
    }

    public function format(string $prefix, int $year, int $sequence): string
    {
        return $this->formatPrefix($prefix, $year)
            . str_pad((string) $sequence, self::SEQUENCE_PAD_LENGTH, '0', STR_PAD_LEFT);
    }

    public function isFormattedNumber($number, string $prefix, ?int $year = null): bool
    {
        $number = strtoupper(trim((string) ($number ?? '')));
        $prefixPattern = preg_quote(strtoupper($prefix), '/');

        if ($year !== null) {
            return (bool) preg_match('/^' . $prefixPattern . preg_quote((string) $year, '/') . '\d{' . self::SEQUENCE_PAD_LENGTH . ',}$/', $number);
        }

        return (bool) preg_match('/^' . $prefixPattern . '\d{4}\d{' . self::SEQUENCE_PAD_LENGTH . ',}$/', $number);
    }

    private function sequenceFromNumber($number, string $prefix, int $year): ?int
    {
        $number = strtoupper(trim((string) ($number ?? '')));
        $pattern = '/^' . preg_quote($this->formatPrefix($prefix, $year), '/') . '(\d{' . self::SEQUENCE_PAD_LENGTH . ',})$/';

        if (!preg_match($pattern, $number, $matches)) {
            return null;
        }

        return (int) $matches[1];
    }

    private function formatPrefix(string $prefix, int $year): string
    {
        return strtoupper($prefix) . $year;
    }

    private function queryForModel(string $modelClass)
    {
        $model = new $modelClass();
        $uses = class_uses_recursive($model);

        if (in_array(SoftDeletes::class, $uses, true)) {
            return $modelClass::withTrashed();
        }

        return $modelClass::query();
    }
}
