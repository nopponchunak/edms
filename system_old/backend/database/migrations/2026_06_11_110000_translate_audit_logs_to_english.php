<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class TranslateAuditLogsToEnglish extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('log')) {
            return;
        }

        DB::table('log')
            ->select('id', 'user_id', 'type', 'description')
            ->chunkById(200, function ($logs) {
                foreach ($logs as $log) {
                    [$description, $type] = $this->normalizeAuditLogPayload(
                        $log->user_id,
                        $log->description,
                        $log->type
                    );

                    if ($description === $log->description && $type === $log->type) {
                        continue;
                    }

                    DB::table('log')
                        ->where('id', $log->id)
                        ->update([
                            'description' => $description,
                            'type' => $type,
                        ]);
                }
            });
    }

    public function down()
    {
        // Irreversible: old Thai free-text descriptions cannot be restored reliably.
    }

    private function normalizeAuditLogPayload($userId, $description, $type)
    {
        $originalType = trim((string) $type);
        $originalDescription = trim((string) $description);
        $normalizedType = $this->normalizeAuditLogType($originalType, $originalDescription);
        $normalizedDescription = $this->normalizeAuditLogDescription(
            (string) $userId,
            $originalDescription,
            $originalType,
            $normalizedType
        );

        return [
            $this->limitAuditLogText($normalizedDescription),
            $this->limitAuditLogText($normalizedType),
        ];
    }

    private function normalizeAuditLogType($type, $description)
    {
        $exactMap = [
            'เข้าสู่ระบบ' => 'Login',
            'เข้าสู่ระบบ (LDAP)' => 'LDAP Login',
            'เพิ่มผู้ใช้งาน' => 'Create User',
            'แก้ไขผู้ใช้งาน' => 'Update User',
            'ลบผู้ใช้งาน' => 'Delete User',
            'เพิ่ม admin' => 'Create Admin User',
            'เพิ่มรายการ' => 'Create Item',
            'เพิ่มรายการผ่านอัปโหลด' => 'Import Records',
            'แก้ไข การทำรายการข่าววัด' => 'Update Menu Permission',
            'Setting Menu Permission' => 'Update Menu Permission',
            'ลบ Supplier' => 'Delete Supplier',
            'ลบ Sub-consultant' => 'Delete Sub-consultant',
            'ลบ Supplier Assessment' => 'Delete Supplier Assessment',
            'ลบข้อมูล sub_consultant_evaluations' => 'Delete Sub-consultant Evaluation',
            'ลบข้อมูล purchase_order' => 'Delete Purchase Order',
            'ลบข้อมูล gift_hospitality_offerings' => 'Delete Gift & Hospitality Offering',
            'ลบข้อมูล gift_hospitalities' => 'Delete Gift & Hospitality',
            'ลบข้อมูล single_source_justifications' => 'Delete Single Source Justification',
            'ลบคำขอสนับสนุนการกุศล' => 'Delete Charitable Contribution',
            'ลบแบบประเมินผู้รับเหมาช่วง' => 'Delete Sub-consultant Assessment',
            'ลบ Expenses Claim' => 'Delete Expenses Claim',
            'ลบ Allowance After 10.00 PM' => 'Delete Allowance After 10.00 PM',
            'Add Main Menu' => 'Create Main Menu',
        ];

        if (isset($exactMap[$type])) {
            return $exactMap[$type];
        }

        if (!$this->containsThaiText($type) && !$this->containsThaiText($description)) {
            return $type !== '' ? $type : 'Audit Log';
        }

        $formName = $this->inferAuditLogFormName($type . ' ' . $description);
        $action = $this->inferAuditLogAction($type, $description);

        if ($action === 'Login') {
            return $this->containsAuditText($type . ' ' . $description, 'LDAP') ? 'LDAP Login' : 'Login';
        }

        if ($action !== '' && $formName !== '') {
            return $action . ' ' . $formName;
        }

        if ($this->containsThaiText($type)) {
            return $action !== '' ? $action . ' Record' : 'Audit Log';
        }

        return $type !== '' ? $type : 'Audit Log';
    }

    private function normalizeAuditLogDescription($userId, $description, $originalType, $normalizedType)
    {
        if (!$this->containsThaiText($description)) {
            return $description !== '' ? $description : $normalizedType;
        }

        $actor = $this->extractAuditLogActor($userId, $description);

        if ($normalizedType === 'Login') {
            return 'User ' . $actor . ' logged in';
        }

        if ($normalizedType === 'LDAP Login') {
            return 'User ' . $actor . ' logged in with LDAP';
        }

        $target = $this->extractAuditLogTarget($description, $originalType);
        $formName = $this->auditLogFormNameFromType($normalizedType);
        $action = $this->auditLogActionVerb($normalizedType);

        if ($action !== '' && $formName !== '') {
            return 'User ' . $actor . ' ' . $action . ' ' . $this->auditLogDescriptionObjectName($formName) . $target;
        }

        if ($action !== '') {
            return 'User ' . $actor . ' ' . $action . ' a record' . $target;
        }

        return 'User ' . $actor . ' performed ' . $normalizedType . $target;
    }

    private function inferAuditLogAction($type, $description)
    {
        $text = $type . ' ' . $description;

        if ($this->containsAuditText($text, 'login') || $this->containsAuditText($text, 'เข้าสู่ระบบ')) {
            return 'Login';
        }

        if (
            $this->containsAuditText($text, 'delete') ||
            $this->containsAuditText($text, 'ลบ')
        ) {
            return 'Delete';
        }

        if (
            $this->containsAuditText($text, 'update') ||
            $this->containsAuditText($text, 'edit') ||
            $this->containsAuditText($text, 'setting') ||
            $this->containsAuditText($text, 'แก้ไข')
        ) {
            return 'Update';
        }

        if (
            $this->containsAuditText($text, 'upload') ||
            $this->containsAuditText($text, 'import') ||
            $this->containsAuditText($text, 'อัปโหลด')
        ) {
            return 'Import';
        }

        if (
            $this->containsAuditText($text, 'create') ||
            $this->containsAuditText($text, 'add') ||
            $this->containsAuditText($text, 'เพิ่ม')
        ) {
            return 'Create';
        }

        return '';
    }

    private function inferAuditLogFormName($text)
    {
        $normalized = strtolower(str_replace(['_', '-'], ' ', (string) $text));
        $forms = [
            'proposal contract review' => 'Proposal Contract Review',
            'purchase requisition' => 'Purchase Requisition',
            'project quality assurance plan' => 'Project Quality Assurance Plan',
            'pqa plan' => 'Project Quality Assurance Plan',
            'controlled document request' => 'Controlled Document Request',
            'cdr' => 'Controlled Document Request',
            'allowance after 10.00 pm' => 'Allowance After 10.00 PM',
            'allowance after 10pm' => 'Allowance After 10.00 PM',
            'expenses claim' => 'Expenses Claim',
            'gift hospitality offering' => 'Gift & Hospitality Offering',
            'gift hospitality offerings' => 'Gift & Hospitality Offering',
            'gift hospitality' => 'Gift & Hospitality',
            'single source justification' => 'Single Source Justification',
            'single source justifications' => 'Single Source Justification',
            'sub consultant assessment' => 'Sub-consultant Assessment',
            'sub consultant assessments' => 'Sub-consultant Assessment',
            'sub consultant evaluation' => 'Sub-consultant Evaluation',
            'sub consultant evaluations' => 'Sub-consultant Evaluation',
            'supplier assessment' => 'Supplier Assessment',
            'supplier assessments' => 'Supplier Assessment',
            'supplier evaluation' => 'Supplier Evaluation',
            'supplier evaluations' => 'Supplier Evaluation',
            'purchase order' => 'Purchase Order',
            'charitable contribution' => 'Charitable Contribution',
            'manual' => 'Manual',
            'main menu' => 'Main Menu',
            'menu permission' => 'Menu Permission',
            'menu' => 'Menu',
            'sub consultant' => 'Sub-consultant',
            'sub consultants' => 'Sub-consultant',
            'supplier' => 'Supplier',
            'user' => 'User',
        ];

        foreach ($forms as $needle => $formName) {
            if (strpos($normalized, $needle) !== false) {
                return $formName;
            }
        }

        if ($this->containsAuditText($text, 'คำขอสนับสนุนการกุศล')) {
            return 'Charitable Contribution';
        }

        if ($this->containsAuditText($text, 'แบบประเมินผู้รับเหมาช่วง')) {
            return 'Sub-consultant Assessment';
        }

        if ($this->containsAuditText($text, 'สิทธิเมนู')) {
            return 'Menu Permission';
        }

        if ($this->containsAuditText($text, 'ผู้ใช้งาน')) {
            return 'User';
        }

        return '';
    }

    private function auditLogActionVerb($type)
    {
        $lower = strtolower((string) $type);

        if (strpos($lower, 'create ') === 0) {
            return 'created';
        }
        if (strpos($lower, 'update ') === 0) {
            return 'updated';
        }
        if (strpos($lower, 'delete ') === 0) {
            return 'deleted';
        }
        if (strpos($lower, 'import ') === 0) {
            return 'imported';
        }

        return '';
    }

    private function auditLogFormNameFromType($type)
    {
        return trim(preg_replace('/^(Create|Update|Delete|Import)\s+/i', '', (string) $type));
    }

    private function auditLogDescriptionObjectName($formName)
    {
        if (in_array($formName, ['User', 'Admin User', 'Record', 'Records'], true)) {
            return lcfirst($formName);
        }

        return $formName;
    }

    private function extractAuditLogActor($fallbackUserId, $description)
    {
        if (preg_match('/ผู้ใช้งาน\s+(.+?)\s+ได้ทำการ/u', $description, $matches)) {
            $actor = trim($matches[1]);
            if ($actor !== '') {
                return $actor;
            }
        }

        $fallback = trim((string) $fallbackUserId);
        return $fallback !== '' ? $fallback : 'system';
    }

    private function extractAuditLogTarget($description, $originalType)
    {
        if (preg_match('/#\s*([A-Za-z0-9_\-]+)/', $description, $matches)) {
            return ' #' . $matches[1];
        }

        $target = preg_replace('/^ผู้ใช้งาน\s+.+?\s+ได้ทำการ\s*/u', '', (string) $description);
        $target = str_replace((string) $originalType, '', $target);
        $target = preg_replace('/^(เพิ่ม|แก้ไข|ลบ|ลบข้อมูล)\s*/u', '', $target);
        $target = trim($target);

        if ($target === '' || $this->containsThaiText($target)) {
            return '';
        }

        return ' ' . $target;
    }

    private function containsThaiText($text)
    {
        return preg_match('/[\x{0E00}-\x{0E7F}]/u', (string) $text) === 1;
    }

    private function containsAuditText($text, $needle)
    {
        return strpos(strtolower((string) $text), strtolower((string) $needle)) !== false;
    }

    private function limitAuditLogText($value)
    {
        $text = trim((string) $value);
        if (function_exists('mb_substr')) {
            return mb_substr($text, 0, 255, 'UTF-8');
        }

        return substr($text, 0, 255);
    }
}
