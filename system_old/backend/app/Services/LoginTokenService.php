<?php

namespace App\Services;

use Carbon\Carbon;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWT;
use Illuminate\Http\Request;
use RuntimeException;

class LoginTokenService
{
    private const KEY = 'key';
    private const DEFAULT_LOGIN_TOKEN_TTL_SECONDS = 3600;

    public function key(): string
    {
        return self::KEY;
    }

    public function ttlSeconds(): int
    {
        $ttl = (int) config('auth.login_token_ttl_seconds', self::DEFAULT_LOGIN_TOKEN_TTL_SECONDS);

        return $ttl > 0 ? $ttl : self::DEFAULT_LOGIN_TOKEN_TTL_SECONDS;
    }

    public function validAfterTimestamp(): ?int
    {
        $value = config('auth.login_token_valid_after');

        if ($value === null || $value === '') {
            return null;
        }

        if (is_numeric($value)) {
            return (int) $value;
        }

        try {
            return Carbon::parse((string) $value, config('app.timezone', 'UTC'))->timestamp;
        } catch (\Exception $e) {
            throw new RuntimeException('Invalid token valid-after config');
        }
    }

    public function now(): int
    {
        return Carbon::now()->timestamp;
    }

    public function bearerTokenFromRequest(Request $request): string
    {
        $header = trim((string) $request->header('Authorization'));

        if ($header === '') {
            return '';
        }

        return stripos($header, 'Bearer ') === 0
            ? trim(substr($header, 7))
            : $header;
    }

    public function decodeAndValidate(string $token)
    {
        $payload = JWT::decode($token, $this->key(), ['HS256']);

        $this->validateConfiguredLifetime($payload);

        return $payload;
    }

    public function validateConfiguredLifetime($payload): void
    {
        if (! isset($payload->iat) || ! is_numeric($payload->iat)) {
            throw new RuntimeException('Token issued time not found');
        }

        if (! isset($payload->exp) || ! is_numeric($payload->exp)) {
            throw new RuntimeException('Token expiration not found');
        }

        $issuedAt = (int) $payload->iat;
        $validAfter = $this->validAfterTimestamp();

        if ($validAfter !== null && $issuedAt < $validAfter) {
            throw new RuntimeException('Token issued before valid window');
        }

        if ($this->now() >= $this->effectiveExpiresAt($payload)) {
            throw new ExpiredException('Expired token');
        }
    }

    public function effectiveExpiresAt($payload): int
    {
        $issuedAt = (int) $payload->iat;
        $expiresAt = (int) $payload->exp;
        $maxExpiresAt = $issuedAt + $this->ttlSeconds();

        return min($expiresAt, $maxExpiresAt);
    }

    public function timestampToIso(?int $timestamp): ?string
    {
        return $timestamp !== null
            ? Carbon::createFromTimestamp($timestamp)->toIso8601String()
            : null;
    }

    public function tokenStatusData($payload, ?int $now = null): array
    {
        $now = $now ?? $this->now();
        $issuedAt = isset($payload->iat) && is_numeric($payload->iat) ? (int) $payload->iat : null;
        $notBefore = isset($payload->nbf) && is_numeric($payload->nbf) ? (int) $payload->nbf : null;
        $expiresAt = isset($payload->exp) && is_numeric($payload->exp) ? (int) $payload->exp : null;
        $configuredTtlSeconds = $this->ttlSeconds();
        $maxExpiresAt = $issuedAt !== null ? $issuedAt + $configuredTtlSeconds : null;
        $effectiveExpiresAt = ($expiresAt !== null && $maxExpiresAt !== null)
            ? min($expiresAt, $maxExpiresAt)
            : null;
        $ttlSeconds = ($issuedAt !== null && $effectiveExpiresAt !== null)
            ? max(0, $effectiveExpiresAt - $issuedAt)
            : $configuredTtlSeconds;
        $remainingSeconds = $effectiveExpiresAt !== null ? max(0, $effectiveExpiresAt - $now) : 0;
        $validAfter = $this->validAfterTimestamp();

        return [
            'login_id'               => $payload->aud ?? null,
            'login_by'               => $payload->lun ?? null,
            'issued_at'              => $issuedAt,
            'issued_at_iso'          => $this->timestampToIso($issuedAt),
            'not_before'             => $notBefore,
            'not_before_iso'         => $this->timestampToIso($notBefore),
            'expires_at'             => $expiresAt,
            'expires_at_iso'         => $this->timestampToIso($expiresAt),
            'max_expires_at'         => $maxExpiresAt,
            'max_expires_at_iso'     => $this->timestampToIso($maxExpiresAt),
            'effective_expires_at'   => $effectiveExpiresAt,
            'effective_expires_at_iso' => $this->timestampToIso($effectiveExpiresAt),
            'server_time'            => $now,
            'server_time_iso'        => $this->timestampToIso($now),
            'valid_after'            => $validAfter,
            'valid_after_iso'        => $this->timestampToIso($validAfter),
            'configured_ttl_seconds' => $configuredTtlSeconds,
            'ttl_seconds'            => $ttlSeconds,
            'ttl_minutes'            => (int) ceil($ttlSeconds / 60),
            'remaining_seconds'      => $remainingSeconds,
            'remaining_minutes'      => (int) ceil($remainingSeconds / 60),
            'is_expired'             => $remainingSeconds <= 0,
        ];
    }

    public function expiredStatusData(): array
    {
        $now = $this->now();
        $validAfter = $this->validAfterTimestamp();

        return [
            'server_time'            => $now,
            'server_time_iso'        => $this->timestampToIso($now),
            'valid_after'            => $validAfter,
            'valid_after_iso'        => $this->timestampToIso($validAfter),
            'configured_ttl_seconds' => $this->ttlSeconds(),
            'remaining_seconds'      => 0,
            'remaining_minutes'      => 0,
            'is_expired'             => true,
        ];
    }
}
