<?php

namespace App\Services;

use App\Models\PostmanProposalContractReview;
use App\Models\PostmanProposalContractReviewProject;

class ProposalContractReviewNumberService
{
    private const GENERAL = 'general';
    private const FACADE = 'facade';
    private const LIGHTING = 'lighting';
    private const TRANSPORTATION = 'transportation';

    private const SERIES = [
        self::GENERAL => ['proposal' => 'P', 'contract' => 'MT'],
        self::FACADE => ['proposal' => 'FP', 'contract' => 'MFT'],
        self::LIGHTING => ['proposal' => 'LP', 'contract' => 'LMT'],
        self::TRANSPORTATION => ['proposal' => 'TP', 'contract' => 'TMT'],
    ];

    public function normalizeDiscipline(?string $discipline, array $payload = []): string
    {
        $value = $this->normalizeText($discipline);

        if ($value === '') {
            $value = $this->inferDisciplineFromPayload($payload);
        }

        if (in_array($value, ['facade', 'façade', 'fascade', 'disc_facade'], true)) {
            return self::FACADE;
        }

        if (in_array($value, ['lighting', 'light', 'disc_lighting'], true)) {
            return self::LIGHTING;
        }

        if (in_array($value, ['transport', 'transportation', 'traffic', 'disc_transport', 'disc_transportation'], true)) {
            return self::TRANSPORTATION;
        }

        return self::GENERAL;
    }

    public function seriesFor(string $discipline): array
    {
        $normalized = $this->normalizeDiscipline($discipline);

        return self::SERIES[$normalized];
    }

    public function nextProposalNumber(string $discipline): string
    {
        return $this->nextNumber($this->seriesFor($discipline)['proposal'], 'proposal_number');
    }

    public function nextContractNumber(string $discipline): string
    {
        return $this->nextNumber($this->seriesFor($discipline)['contract'], 'mt_project_no');
    }

    private function nextNumber(string $prefix, string $column): string
    {
        $numbers = PostmanProposalContractReview::query()
            ->where($column, 'like', $prefix . '%')
            ->lockForUpdate()
            ->pluck($column)
            ->all();

        if ($column === 'mt_project_no') {
            $projectNumbers = PostmanProposalContractReviewProject::query()
                ->where('mt_project_no', 'like', $prefix . '%')
                ->lockForUpdate()
                ->pluck('mt_project_no')
                ->all();

            $numbers = array_merge($numbers, $projectNumbers);
        }

        $lastSequence = 0;

        foreach ($numbers as $number) {
            if (is_string($number) && preg_match('/^' . preg_quote($prefix, '/') . '(\d+)$/', $number, $matches)) {
                $lastSequence = max($lastSequence, (int) $matches[1]);
            }
        }

        return $prefix . str_pad((string) ($lastSequence + 1), 4, '0', STR_PAD_LEFT);
    }

    private function inferDisciplineFromPayload(array $payload): string
    {
        $candidates = [];

        foreach (['primary_discipline', 'primaryDiscipline', 'discipline', 'disciplines'] as $key) {
            if (! array_key_exists($key, $payload)) {
                continue;
            }

            $value = $payload[$key];

            if (is_string($value)) {
                $candidates[] = $value;
                continue;
            }

            if (is_array($value)) {
                foreach ($value as $itemKey => $itemValue) {
                    if (is_bool($itemValue) && $itemValue) {
                        $candidates[] = (string) $itemKey;
                    } elseif (is_string($itemValue) && trim($itemValue) !== '') {
                        $candidates[] = $itemValue;
                    }
                }
            }
        }

        foreach ($candidates as $candidate) {
            $normalized = $this->normalizeText($candidate);
            if (in_array($normalized, ['facade', 'façade', 'fascade', 'disc_facade'], true)) {
                return self::FACADE;
            }
            if (in_array($normalized, ['lighting', 'light', 'disc_lighting'], true)) {
                return self::LIGHTING;
            }
            if (in_array($normalized, ['transport', 'transportation', 'traffic', 'disc_transport', 'disc_transportation'], true)) {
                return self::TRANSPORTATION;
            }
        }

        return self::GENERAL;
    }

    private function normalizeText(?string $value): string
    {
        return strtolower(trim((string) $value));
    }
}
