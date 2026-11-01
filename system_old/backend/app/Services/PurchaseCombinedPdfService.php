<?php

namespace App\Services;

use App\Exceptions\PdfMergeUserException;
use Mpdf\Mpdf;
use Mpdf\Output\Destination;
use RuntimeException;
use setasign\Fpdi\PdfParser\CrossReference\CrossReferenceException;

class PurchaseCombinedPdfService
{
    private const PDF_RENDER_DPI = 144;

    public function mergePdfSources(array $sources): string
    {
        if (empty($sources)) {
            throw new RuntimeException('No PDF sources were provided.');
        }

        $tempDir = $this->ensureWritableDirectory(storage_path('app/purchase-combined-pdf'));
        $mpdfTempDir = $this->ensureWritableDirectory($tempDir . '/mpdf');

        $tempFiles = [];
        $tempDirectories = [];
        $mpdf = new Mpdf([
            'mode' => 'utf-8',
            'tempDir' => $mpdfTempDir,
            'margin_left' => 0,
            'margin_right' => 0,
            'margin_top' => 0,
            'margin_bottom' => 0,
            'margin_header' => 0,
            'margin_footer' => 0,
        ]);
        $mpdf->SetDisplayMode('fullpage');

        try {
            foreach (array_values($sources) as $index => $source) {
                $path = $this->materializeSource($source, $index, $tempDir, $tempFiles);
                $this->appendPdfSource(
                    $mpdf,
                    $path,
                    $this->sourceDisplayName($source, $path),
                    $index,
                    $tempDir,
                    $tempFiles,
                    $tempDirectories
                );
            }

            return $mpdf->Output('', Destination::STRING_RETURN);
        } finally {
            foreach ($tempFiles as $tempFile) {
                if (is_file($tempFile)) {
                    @unlink($tempFile);
                }
            }
            foreach (array_reverse($tempDirectories) as $tempDirectory) {
                if (is_dir($tempDirectory)) {
                    @rmdir($tempDirectory);
                }
            }
        }
    }

    private function ensureWritableDirectory(string $directory): string
    {
        if ($this->ensureDirectoryIsWritable($directory)) {
            return $directory;
        }

        return $this->fallbackTempDirectory($directory);
    }

    private function fallbackTempDirectory(string $preferredDirectory): string
    {
        $hash = substr(sha1($preferredDirectory), 0, 12);
        $roots = array_filter([
            storage_path('app/tmp/efrom-purchase-combined-pdf'),
            rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'efrom-purchase-combined-pdf',
            DIRECTORY_SEPARATOR . 'tmp' . DIRECTORY_SEPARATOR . 'efrom-purchase-combined-pdf',
        ]);

        foreach ($roots as $root) {
            $fallback = rtrim($root, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $hash;
            if ($this->ensureDirectoryIsWritable($fallback)) {
                return $fallback;
            }
        }

        throw new RuntimeException('Unable to create writable temporary PDF directory.');
    }

    private function ensureDirectoryIsWritable(string $directory): bool
    {
        if (!is_dir($directory) && !@mkdir($directory, 0777, true) && !is_dir($directory)) {
            return false;
        }

        @chmod($directory, 0777);

        return is_writable($directory);
    }

    private function appendPdfSource(
        Mpdf $mpdf,
        string $path,
        string $sourceName,
        int $index,
        string $tempDir,
        array &$tempFiles,
        array &$tempDirectories
    ): void {
        try {
            $this->importPdfPages($mpdf, $path);
        } catch (CrossReferenceException $e) {
            if ((int) $e->getCode() === CrossReferenceException::ENCRYPTED) {
                $decryptedPath = $this->normalizeEncryptedPdfForFpdi($path, $index, $tempDir, $tempFiles);
                if ($decryptedPath) {
                    $this->importPdfPages($mpdf, $decryptedPath);
                    return;
                }

                throw new PdfMergeUserException(
                    'ไฟล์ PDF "' . $sourceName . '" ถูกเข้ารหัสหรือมีการป้องกัน ไม่สามารถรวมไฟล์ได้ ' .
                    'กรุณา Export/Print เป็น PDF ใหม่ที่ไม่มีรหัสผ่านหรือ security protection แล้วอัปโหลดอีกครั้ง',
                    0,
                    $e
                );
            }

            if ((int) $e->getCode() !== CrossReferenceException::COMPRESSED_XREF) {
                throw $e;
            }

            try {
                $normalizedPath = $this->normalizeCompressedPdfForFpdi(
                    $path,
                    $index,
                    $tempDir,
                    $tempFiles,
                    $tempDirectories
                );
                $this->importPdfPages($mpdf, $normalizedPath);
            } catch (\Throwable $normalizationException) {
                throw new PdfMergeUserException(
                    'ไฟล์ PDF "' . $sourceName . '" ไม่สามารถแปลงเพื่อรวมไฟล์ได้ ' .
                    'กรุณา Export/Print เป็น PDF ใหม่แล้วอัปโหลดอีกครั้ง',
                    0,
                    $normalizationException
                );
            }
        }
    }

    private function sourceDisplayName(array $source, string $path): string
    {
        $name = trim((string) ($source['name'] ?? ''));
        if ($name !== '') {
            return basename($name);
        }

        return basename($path);
    }

    private function importPdfPages(Mpdf $mpdf, string $path): void
    {
        $pageCount = $mpdf->setSourceFile($path);

        for ($pageNumber = 1; $pageNumber <= $pageCount; $pageNumber++) {
            $templateId = $mpdf->importPage($pageNumber);
            $mpdf->AddPage();
            $mpdf->useTemplate($templateId, 0, 0, null, null, true);
        }
    }

    private function normalizeCompressedPdfForFpdi(
        string $path,
        int $index,
        string $tempDir,
        array &$tempFiles,
        array &$tempDirectories
    ): string {
        $pdftocairo = $this->findPdftocairoBinary();
        if (!$pdftocairo) {
            throw new RuntimeException(
                'PDF attachment uses compressed cross-reference streams that FPDI cannot read. ' .
                'Install poppler pdftocairo or normalize the PDF before upload: ' . basename($path)
            );
        }

        $renderDir = $tempDir . '/' . uniqid('purchase-render-' . $index . '-', true);
        if (!is_dir($renderDir) && !mkdir($renderDir, 0775, true)) {
            throw new RuntimeException('Unable to create temporary PDF render directory.');
        }
        $tempDirectories[] = $renderDir;

        $outputPrefix = $renderDir . '/page';
        $this->runCommand([
            $pdftocairo,
            '-q',
            '-png',
            '-r',
            (string) self::PDF_RENDER_DPI,
            $path,
            $outputPrefix,
        ]);

        $imagePaths = glob($outputPrefix . '-*.png') ?: [];
        natsort($imagePaths);
        $imagePaths = array_values($imagePaths);

        if (empty($imagePaths)) {
            throw new RuntimeException('Unable to normalize PDF attachment for merging: ' . basename($path));
        }

        foreach ($imagePaths as $imagePath) {
            $tempFiles[] = $imagePath;
        }

        $normalizedPath = $tempDir . '/' . uniqid('purchase-normalized-' . $index . '-', true) . '.pdf';
        $this->createPdfFromRenderedImages($imagePaths, $normalizedPath, $tempDir);
        $tempFiles[] = $normalizedPath;

        return $normalizedPath;
    }

    private function normalizeEncryptedPdfForFpdi(
        string $path,
        int $index,
        string $tempDir,
        array &$tempFiles
    ): ?string {
        $qpdf = $this->findQpdfBinary();
        if (!$qpdf) {
            return null;
        }

        $normalizedPath = $tempDir . '/' . uniqid('purchase-decrypted-' . $index . '-', true) . '.pdf';

        try {
            $this->runCommand([
                $qpdf,
                '--decrypt',
                $path,
                $normalizedPath,
            ]);
        } catch (RuntimeException $e) {
            if (is_file($normalizedPath)) {
                @unlink($normalizedPath);
            }

            return null;
        }

        if (!is_file($normalizedPath) || filesize($normalizedPath) <= 0) {
            if (is_file($normalizedPath)) {
                @unlink($normalizedPath);
            }

            return null;
        }

        $tempFiles[] = $normalizedPath;

        return $normalizedPath;
    }

    private function createPdfFromRenderedImages(array $imagePaths, string $targetPath, string $tempDir): void
    {
        $mpdf = null;

        foreach ($imagePaths as $index => $imagePath) {
            $imageSize = getimagesize($imagePath);
            if (!$imageSize) {
                throw new RuntimeException('Unable to read rendered PDF page image: ' . basename($imagePath));
            }

            $widthMm = ($imageSize[0] / self::PDF_RENDER_DPI) * 25.4;
            $heightMm = ($imageSize[1] / self::PDF_RENDER_DPI) * 25.4;

            if ($mpdf === null) {
                $mpdf = new Mpdf([
                    'mode' => 'utf-8',
                    'format' => [$widthMm, $heightMm],
                    'orientation' => 'P',
                    'margin_left' => 0,
                    'margin_right' => 0,
                    'margin_top' => 0,
                    'margin_bottom' => 0,
                    'margin_header' => 0,
                    'margin_footer' => 0,
                    'tempDir' => $tempDir,
                ]);
            } elseif ($index > 0) {
                $mpdf->AddPageByArray([
                    'orientation' => 'P',
                    'sheet-size' => [$widthMm, $heightMm],
                    'margin-left' => 0,
                    'margin-right' => 0,
                    'margin-top' => 0,
                    'margin-bottom' => 0,
                    'margin-header' => 0,
                    'margin-footer' => 0,
                ]);
            }

            $escapedPath = htmlspecialchars($imagePath, ENT_QUOTES, 'UTF-8');
            $mpdf->WriteHTML(
                '<style>@page{margin:0;}body{margin:0;padding:0;}</style>' .
                '<img src="' . $escapedPath . '" style="display:block;width:' . $widthMm . 'mm;height:' . $heightMm . 'mm;margin:0;padding:0;" />'
            );
        }

        if ($mpdf === null) {
            throw new RuntimeException('No rendered PDF page images were provided.');
        }

        file_put_contents($targetPath, $mpdf->Output('', Destination::STRING_RETURN));
    }

    private function findPdftocairoBinary(): ?string
    {
        $configuredPath = env('PDFTOCAIRO_BINARY');
        if ($configuredPath && is_executable($configuredPath)) {
            return $configuredPath;
        }

        foreach ([
            '/opt/homebrew/bin/pdftocairo',
            '/usr/local/bin/pdftocairo',
            '/usr/bin/pdftocairo',
        ] as $candidate) {
            if (is_executable($candidate)) {
                return $candidate;
            }
        }

        return $this->findExecutableOnPath('pdftocairo');
    }

    private function findQpdfBinary(): ?string
    {
        $configuredPath = env('QPDF_BINARY');
        if ($configuredPath && is_executable($configuredPath)) {
            return $configuredPath;
        }

        foreach ([
            '/opt/homebrew/bin/qpdf',
            '/usr/local/bin/qpdf',
            '/usr/bin/qpdf',
        ] as $candidate) {
            if (is_executable($candidate)) {
                return $candidate;
            }
        }

        return $this->findExecutableOnPath('qpdf');
    }

    private function findExecutableOnPath(string $binary): ?string
    {
        $output = [];
        $exitCode = 1;
        @exec('command -v ' . escapeshellarg($binary) . ' 2>/dev/null', $output, $exitCode);

        if ($exitCode !== 0 || empty($output[0])) {
            return null;
        }

        $path = trim($output[0]);
        return is_executable($path) ? $path : null;
    }

    private function runCommand(array $command): void
    {
        if (!function_exists('proc_open')) {
            throw new RuntimeException('proc_open is required to normalize compressed PDF attachments.');
        }

        $process = proc_open($command, [
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ], $pipes);

        if (!is_resource($process)) {
            throw new RuntimeException('Unable to start PDF normalization command.');
        }

        $stdout = stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[2]);

        $exitCode = proc_close($process);
        if ($exitCode !== 0) {
            $message = trim($stderr ?: $stdout);
            throw new RuntimeException('PDF normalization command failed: ' . ($message ?: 'exit code ' . $exitCode));
        }
    }

    public function attachmentPdfPaths($attachments, bool $ignoreNonPdf = false): array
    {
        if (is_string($attachments)) {
            $decoded = json_decode($attachments, true);
            $attachments = json_last_error() === JSON_ERROR_NONE && is_array($decoded)
                ? $decoded
                : [$attachments];
        }

        if (!is_array($attachments)) {
            return [];
        }

        $paths = [];
        foreach ($attachments as $attachment) {
            $rawPath = $this->attachmentPath($attachment);
            if ($rawPath === '') {
                continue;
            }

            if (!$this->isPdfPath($rawPath)) {
                if ($ignoreNonPdf) {
                    continue;
                }

                throw new PdfMergeUserException(
                    'ไฟล์แนบ "' . basename($rawPath) . '" ไม่ใช่ PDF จึงไม่สามารถรวมไฟล์ได้'
                );
            }

            $resolvedPath = $this->resolveLocalPath($rawPath);
            if (!$resolvedPath) {
                throw new PdfMergeUserException(
                    'ไม่พบไฟล์แนบ "' . basename($rawPath) . '" จึงไม่สามารถรวมไฟล์ได้'
                );
            }

            $paths[] = $resolvedPath;
        }

        return array_values(array_unique($paths));
    }

    private function materializeSource(array $source, int $index, string $tempDir, array &$tempFiles): string
    {
        if (!empty($source['path'])) {
            $path = (string) $source['path'];
            if (!is_file($path)) {
                throw new RuntimeException('PDF source file was not found: ' . $path);
            }

            return $path;
        }

        if (!array_key_exists('content', $source)) {
            throw new RuntimeException('PDF source content is missing.');
        }

        $name = preg_replace('/[^a-zA-Z0-9_.-]+/', '-', (string) ($source['name'] ?? ('source-' . $index)));
        $path = $tempDir . '/' . uniqid('purchase-source-' . $index . '-', true) . '-' . $name . '.pdf';
        file_put_contents($path, (string) $source['content']);
        $tempFiles[] = $path;

        return $path;
    }

    private function attachmentPath($attachment): string
    {
        if (is_string($attachment)) {
            return trim($attachment);
        }

        if (is_object($attachment)) {
            $attachment = (array) $attachment;
        }

        if (is_array($attachment)) {
            foreach (['file_path', 'path', 'file_url', 'url', 'fileName', 'file_name', 'name'] as $key) {
                $path = $this->extractAttachmentPathValue($attachment[$key] ?? null);
                if ($path !== '') {
                    return $path;
                }
            }

            return $this->extractAttachmentPathValue($attachment);
        }

        return '';
    }

    private function extractAttachmentPathValue($value, int $depth = 0): string
    {
        if ($depth > 3 || $value === null) {
            return '';
        }

        if (is_string($value)) {
            return trim($value);
        }

        if (is_scalar($value)) {
            return trim((string) $value);
        }

        if (is_object($value)) {
            $value = (array) $value;
        }

        if (!is_array($value)) {
            return '';
        }

        foreach (['file_path', 'path', 'file_url', 'url', 'fileName', 'file_name', 'name'] as $key) {
            if (!array_key_exists($key, $value)) {
                continue;
            }

            $path = $this->extractAttachmentPathValue($value[$key], $depth + 1);
            if ($path !== '') {
                return $path;
            }
        }

        foreach ($value as $item) {
            if (!is_array($item) && !is_object($item)) {
                continue;
            }

            $path = $this->extractAttachmentPathValue($item, $depth + 1);
            if ($path !== '') {
                return $path;
            }
        }

        return '';
    }

    private function isPdfPath(string $path): bool
    {
        $parsedPath = parse_url($path, PHP_URL_PATH);
        return strtolower(pathinfo((string) ($parsedPath ?: $path), PATHINFO_EXTENSION)) === 'pdf';
    }

    private function resolveLocalPath(string $path): ?string
    {
        $parsedPath = parse_url($path, PHP_URL_PATH);
        $cleanPath = urldecode((string) ($parsedPath ?: $path));

        if (is_file($cleanPath)) {
            return $cleanPath;
        }

        $relativePath = ltrim($cleanPath, '/\\');
        $candidates = [
            public_path($relativePath),
            base_path($relativePath),
            storage_path('app/' . $relativePath),
        ];

        foreach ($candidates as $candidate) {
            if (is_file($candidate)) {
                return $candidate;
            }
        }

        return null;
    }
}
