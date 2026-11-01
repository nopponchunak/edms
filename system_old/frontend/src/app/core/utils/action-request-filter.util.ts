/**
 * Utility functions for filtering action requests based on user code and workflow sequence
 */

/**
 * Get current user code from localStorage
 */
export function getCurrentUserCode(): string | null {
    try {
        const userRawData = localStorage.getItem('user_raw_data');
        if (userRawData) {
            const userData = JSON.parse(userRawData);
            // รองรับหลายรูปแบบจาก backend จริง
            const raw =
                userData.code ??
                userData.employeeCode ??
                userData.employee_code ??
                userData.username ??
                userData.userName ??
                userData.id ??
                userData.user_id ??
                null;

            if (raw !== null && raw !== undefined) {
                const code = String(raw).trim();
                return code !== '' ? code : null;
            }
        }
    } catch (error) {
        console.error('Error getting user code from localStorage:', error);
    }
    return null;
}

/**
 * Generic helper: check if a request "belongs" to current user
 * - ใช้ code จาก localStorage (getCurrentUserCode)
 * - ไม่ผูกกับชื่อฟิลด์เฉพาะ (createdBy, requestedBy, *_by ฯลฯ)
 * - พยายามเช็คทั้งค่า string/number ที่ระดับบน และ object ทั่วไป (เช่น requestedBy.id)
 */
export function isMyRequestByUserCode(item: any, userCode: string | null): boolean {
    if (!item || !userCode) {
        return false;
    }

    const target = String(userCode).trim().toLowerCase();

    // ฟิลด์ที่มักใช้เก็บ code ของคน (ทั้ง camelCase / snake_case)
    const commonKeys = [
        'createBy', 'createdBy', 'create_by', 'created_by',
        'updateBy', 'updatedBy', 'update_by', 'updated_by',
        'reciveBy', 'recive_by',
        'requestedBy', 'requested_by', 'requestBy', 'request_by',
        'assessed_by', 'approvedBy', 'approved_by', 'approvedBy2', 'approved_by_2', 'acknowledged_by',
        'verifiedBy', 'verified_by',
        'tlBy', 'tl_by', 'diBy', 'di_by', 'accountBy', 'account_by',
        'notifiedUser', 'notified_user',
        'mtlReceivingStaffBy', 'mtl_receiving_staff_by',
        'evaluatedBy', 'evaluated_by',
        'completedBy', 'completed_by',
        'reviewedBy', 'reviewed_by',
        'supplierCode', 'supplier_code',
        'carIssuedBy', 'car_issued_by', 'issuedBy', 'issued_by',
        'issuerId', 'issuer_id',
        'code', 'id', 'user_id'
    ];

    const equalsTarget = (value: unknown): boolean => {
        if (value === null || value === undefined) {
            return false;
        }
        if (typeof value === 'string' || typeof value === 'number') {
            return String(value).trim().toLowerCase() === target;
        }
        if (typeof value === 'object') {
            const obj: any = value as any;
            const candidate = obj.code ?? obj.id ?? obj.employeeCode ?? obj.employee_code;
            if (candidate !== undefined && candidate !== null) {
                return String(candidate).trim().toLowerCase() === target;
            }
        }
        return false;
    };

    // 1) เช็คตามชื่อ key ที่พบบ่อยก่อน
    for (const key of commonKeys) {
        if (key in item) {
            if (equalsTarget((item as any)[key])) {
                return true;
            }
        }
    }

    // 2) Fallback: loop ค่า top-level ทั้งหมด (string/number)
    for (const value of Object.values(item)) {
        if (equalsTarget(value)) {
            return true;
        }
    }

    return false;
}

/**
 * Normalize status to lowercase for comparison (รองรับทั้งตัวเล็กตัวใหญ่ของ approved/pending/reject)
 * Treats null, undefined, and empty string as null (pending)
 */
export function normalizeStatus(status: string | null | undefined): string | null {
    if (status === null || status === undefined || status === '') {
        return null;
    }
    const s = String(status).toLowerCase().trim();
    return s === '' ? null : s;
}

/**
 * Check if status is pending
 * Treats null, undefined, empty string, and 'pending' as pending
 */
export function isPending(status: string | null | undefined): boolean {
    if (status === null || status === undefined || status === '') {
        return true;
    }
    const normalized = normalizeStatus(status);
    return normalized === 'pending' || normalized === null;
}

/**
 * Check if status is approved (รองรับทั้ง 'approve', 'approved', 'Approved', 'APPROVED')
 */
export function isApproved(status: string | null | undefined): boolean {
    const normalized = normalizeStatus(status);
    return normalized === 'approve' || normalized === 'approved';
}

/**
 * Check if status is rejected
 */
export function isRejected(status: string | null | undefined): boolean {
    const normalized = normalizeStatus(status);
    return normalized === 'reject' || normalized === 'rejected';
}

/**
 * Filter action requests for Charitable Contribution
 * Logic:
 * 1. Check if user code matches acscBy, approverBy, or acslBy
 * 2. Check if workflow sequence has reached the step where user needs to act
 * 3. Support both camelCase and snake_case from API (เหมือนโมดูลอื่น)
 */
export function filterCharitableContributionActionRequests(
    requests: any[],
    userCode: string | null
): Array<{ id: string; request: any; actionType: 'acsc_by_status' | 'approver_by_status' | 'approver_by_2_status' | 'ims_acknowledged_by_status' | 'acsl_by_status'; currentStatus: string | null }> {
    if (!userCode) {
        console.warn('No user code found, returning empty action requests');
        return [];
    }

    const actionRequests: Array<{ id: string; request: any; actionType: 'acsc_by_status' | 'approver_by_status' | 'approver_by_2_status' | 'ims_acknowledged_by_status' | 'acsl_by_status'; currentStatus: string | null }> = [];

    requests.forEach((req) => {
        // Support both camelCase and snake_case from API (เหมือนโมดูลอื่น)
        const acscBy = req.acscBy ?? req.acsc_by ?? null;
        const acscByStatus = req.acscByStatus ?? req.acsc_by_status ?? null;
        const approverBy = req.approverBy ?? req.approver_by ?? null;
        const approverByStatus = req.approverByStatus ?? req.approver_by_status ?? null;
        const approverBy2 = req.approverBy2 ?? req.approver_by_2 ?? null;
        const approverBy2Status = req.approverBy2Status ?? req.approver_by_2_status ?? null;
        const acslBy = req.acslBy ?? req.acsl_by ?? null;
        const acslByStatus = req.acslByStatus ?? req.acsl_by_status ?? null;
        const imsBy = req.imsAcknowledgedBy ?? req.ims_acknowledged_by ?? null;
        const imsStatus = req.imsAcknowledgedByStatus ?? req.ims_acknowledged_by_status ?? null;

        // ถ้า step ใดถูก reject แล้ว ไม่แสดง action (เหมือนโมดูลอื่น)
        if (isRejected(acscByStatus) || isRejected(approverByStatus) || isRejected(approverBy2Status) || isRejected(imsStatus) || isRejected(acslByStatus)) {
            return;
        }

        // ลำดับที่ 1: ACSC Verifier
        if (acscBy === userCode) {
            if (isPending(acscByStatus)) {
                actionRequests.push({
                    id: req.id,
                    request: req,
                    actionType: 'acsc_by_status' as const,
                    currentStatus: acscByStatus || null
                });
                return;
            }
        }

        // Final step: Accounts Acknowledger (CA), after ACSL and every assigned approver.
        if (acslBy === userCode) {
            const allApproversApproved = isApproved(approverByStatus) &&
                (!approverBy2 || isApproved(approverBy2Status));
            if (isApproved(acscByStatus) && allApproversApproved && isApproved(imsStatus) && isPending(acslByStatus)) {
                actionRequests.push({
                    id: req.id,
                    request: req,
                    actionType: 'acsl_by_status' as const,
                    currentStatus: acslByStatus || null
                });
                return;
            }
        }

        // Step 3: Final Approver (MD/DI), after ACSC verification and ACSL acknowledgment.
        if (approverBy === userCode) {
            if (isApproved(acscByStatus) && isApproved(imsStatus) && isPending(approverByStatus)) {
                actionRequests.push({
                    id: req.id,
                    request: req,
                    actionType: 'approver_by_status' as const,
                    currentStatus: approverByStatus || null
                });
                return;
            }
        }

        // Step 4 (optional): Final Approver 2, after Approver 1.
        if (approverBy2 === userCode) {
            if (isApproved(acscByStatus) && isApproved(imsStatus) && isApproved(approverByStatus) && isPending(approverBy2Status)) {
                actionRequests.push({
                    id: req.id,
                    request: req,
                    actionType: 'approver_by_2_status' as const,
                    currentStatus: approverBy2Status || null
                });
                return;
            }
        }

        if (imsBy === userCode) {
            if (isApproved(acscByStatus) && isPending(imsStatus)) {
                actionRequests.push({ id: req.id, request: req, actionType: 'ims_acknowledged_by_status', currentStatus: imsStatus || null });
            }
        }
    });

    return actionRequests;
}

/**
 * Filter action requests for Gift Hospitality
 * Workflow: ACSC Verify -> ACSL Acknowledge -> TL/DI/MD Approve -> Accounts Acknowledge (CA)
 */
export function filterGiftHospitalityActionRequests(
    requests: any[],
    userCode: string | null
): Array<{ id: string; request: any; actionType: 'approved_by_status' | 'ims_acknowledged_by_status' | 'acknowledged_by_status' | 'verified_by_status'; currentStatus: string | null }> {
    if (!userCode) {
        console.warn('[filterGiftHospitalityActionRequests] No user code found, returning empty action requests');
        return [];
    }



    const actionRequests: Array<{ id: string; request: any; actionType: 'approved_by_status' | 'ims_acknowledged_by_status' | 'acknowledged_by_status' | 'verified_by_status'; currentStatus: string | null }> = [];

    requests.forEach((req, index) => {
        // Support both camelCase and snake_case field names
        // Handle null, undefined, and empty string - treat as null (pending)
        // Use nullish coalescing (??) to properly handle null vs undefined
        const approvedBy = req.approvedBy ?? req.approved_by ?? null;
        const approvedByStatus = req.approvedByStatus ?? req.approved_by_status ?? null;
        const acknowledgedBy = req.acknowledgedBy ?? req.acknowledged_by ?? null;
        const acknowledgedByStatus = req.acknowledgedByStatus ?? req.acknowledged_by_status ?? null;
        const verifiedBy = req.verifiedBy ?? req.verified_by ?? null;
        const verifiedByStatus = req.verifiedByStatus ?? req.verified_by_status ?? null;
        const imsBy = req.imsAcknowledgedBy ?? req.ims_acknowledged_by ?? null;
        const imsStatus = req.imsAcknowledgedByStatus ?? req.ims_acknowledged_by_status ?? null;

        // Debug logging for first request
        if (index === 0) {

        }

        // ถ้า step ใดถูก reject แล้ว ไม่ต้องแสดง action
        if (isRejected(verifiedByStatus) || isRejected(acknowledgedByStatus) || isRejected(approvedByStatus) || isRejected(imsStatus)) {
            return;
        }

        // ลำดับที่ 1: Verify (ขั้นแรก)
        if (verifiedBy === userCode) {
            const isVerifiedPending = isPending(verifiedByStatus);
            if (index === 0) {

            }
            if (isVerifiedPending) {
                actionRequests.push({
                    id: req.id,
                    request: req,
                    actionType: 'verified_by_status' as const,
                    currentStatus: verifiedByStatus || null
                });
                if (index === 0) {

                }
                return;
            }
        }

        // Step 2: ACSL acknowledgment after ACSC verification.
        if (imsBy === userCode && isApproved(verifiedByStatus) && isPending(imsStatus)) {
            actionRequests.push({ id: req.id, request: req, actionType: 'ims_acknowledged_by_status', currentStatus: imsStatus || null });
            return;
        }

        // Final workflow step: Accounts acknowledgment (CA), after ACSL and approval.
        if (acknowledgedBy === userCode) {
            const isVerifiedApproved = isApproved(verifiedByStatus);
            const isAcknowledgedPending = isPending(acknowledgedByStatus);
            if (index === 0) {

            }
            if (isVerifiedApproved && isApproved(approvedByStatus) && isApproved(imsStatus) && isAcknowledgedPending) {
                actionRequests.push({
                    id: req.id,
                    request: req,
                    actionType: 'acknowledged_by_status' as const,
                    currentStatus: acknowledgedByStatus || null
                });
                if (index === 0) {

                }
                return;
            }
        }

        // Step 3: Approve after ACSC verification and ACSL acknowledgment.
        if (approvedBy === userCode) {
            const isVerifiedApproved = isApproved(verifiedByStatus);
            const isApprovedPending = isPending(approvedByStatus);
            if (index === 0) {

            }
            if (isVerifiedApproved && isApproved(imsStatus) && isApprovedPending) {
                actionRequests.push({
                    id: req.id,
                    request: req,
                    actionType: 'approved_by_status' as const,
                    currentStatus: approvedByStatus || null
                });
                if (index === 0) {

                }
                return;
            }
        }

        // Debug: ถ้าไม่ match กับ step ไหนเลย
        if (index === 0) {

        }
    });



    return actionRequests;
}

/**
 * Filter action requests for Gift Hospitality Offering
 * Workflow: ACSC Verify -> ACSL Acknowledge -> Approve -> optional Approve 2 -> Accounts Acknowledge (CA)
 */
export function filterGiftHospitalityOfferingActionRequests(
    requests: any[],
    userCode: string | null
): Array<{ id: string; request: any; actionType: 'verified_by_status' | 'acknowledged_by_status' | 'approved_by_status' | 'approved_by_2_status' | 'ims_acknowledged_by_status'; currentStatus: string | null }> {
    if (!userCode) {
        console.warn('No user code found, returning empty action requests');
        return [];
    }

    const actionRequests: Array<{ id: string; request: any; actionType: 'verified_by_status' | 'acknowledged_by_status' | 'approved_by_status' | 'approved_by_2_status' | 'ims_acknowledged_by_status'; currentStatus: string | null }> = [];

    requests.forEach((req) => {
        const verifiedBy = req.verifiedBy || req.verified_by;
        const verifiedByStatus = req.verifiedByStatus || req.verified_by_status;
        const acknowledgedBy = req.acknowledgedBy || req.acknowledged_by;
        const acknowledgedByStatus = req.acknowledgedByStatus || req.acknowledged_by_status;
        const approvedBy = req.approvedBy || req.approved_by;
        const approvedByStatus = req.approvedByStatus || req.approved_by_status;
        const approvedBy2 = req.approvedBy2 || req.approved_by_2;
        const approvedBy2Status = req.approvedBy2Status || req.approved_by_2_status;
        const imsBy = req.imsAcknowledgedBy || req.ims_acknowledged_by;
        const imsStatus = req.imsAcknowledgedByStatus || req.ims_acknowledged_by_status;

        if (isRejected(verifiedByStatus) || isRejected(acknowledgedByStatus) || isRejected(approvedByStatus) || isRejected(approvedBy2Status) || isRejected(imsStatus)) {
            return;
        }

        // ลำดับที่ 1: Verified By
        if (verifiedBy === userCode) {
            if (isPending(verifiedByStatus)) {
                actionRequests.push({
                    id: req.id,
                    request: req,
                    actionType: 'verified_by_status' as const,
                    currentStatus: verifiedByStatus || null
                });
                return;
            }
        }

        // Step 2: ACSL acknowledgement (stored in the legacy IMS columns).
        if (imsBy === userCode) {
            if (isApproved(verifiedByStatus) && isPending(imsStatus)) {
                actionRequests.push({ id: req.id, request: req, actionType: 'ims_acknowledged_by_status', currentStatus: imsStatus || null });
                return;
            }
        }

        // Final step: Accounts acknowledgment (CA), after every assigned approver.
        if (acknowledgedBy === userCode) {
            const allApproversApproved = isApproved(approvedByStatus) &&
                (!approvedBy2 || isApproved(approvedBy2Status));
            if (isApproved(verifiedByStatus) && allApproversApproved && isApproved(imsStatus) && isPending(acknowledgedByStatus)) {
                actionRequests.push({
                    id: req.id,
                    request: req,
                    actionType: 'acknowledged_by_status' as const,
                    currentStatus: acknowledgedByStatus || null
                });
                return;
            }
        }

        // Step 3: Approve after ACSL acknowledgement.
        if (approvedBy === userCode) {
            if (isApproved(verifiedByStatus) && isApproved(imsStatus) && isPending(approvedByStatus)) {
                actionRequests.push({
                    id: req.id,
                    request: req,
                    actionType: 'approved_by_status' as const,
                    currentStatus: approvedByStatus || null
                });
                return;
            }
        }

        // Step 4 (optional): Approve By 2, after Approver 1.
        if (approvedBy2 === userCode) {
            if (isApproved(verifiedByStatus) && isApproved(imsStatus) && isApproved(approvedByStatus) && isPending(approvedBy2Status)) {
                actionRequests.push({
                    id: req.id,
                    request: req,
                    actionType: 'approved_by_2_status' as const,
                    currentStatus: approvedBy2Status || null
                });
                return;
            }
        }

    });

    return actionRequests;
}

/**
 * Filter action requests for CAR (Corrective Action Request)
 * Workflow: Approve By -> Completed By -> Acknowledged By -> Verified By -> Approve 2 By
 */
export function filterCarActionRequests(
    requests: any[],
    userCode: string | null
): Array<{ id: string; car: any; actionType: 'approved_by_status' | 'completed_by_status' | 'acknowledged_by_status' | 'verified_by_status' | 'approved_by_status_2'; currentStatus: string | null }> {
    if (!userCode) {
        console.warn('No user code found, returning empty action requests');
        return [];
    }

    const actionRequests: Array<{ id: string; car: any; actionType: 'approved_by_status' | 'completed_by_status' | 'acknowledged_by_status' | 'verified_by_status' | 'approved_by_status_2'; currentStatus: string | null }> = [];

    requests.forEach((car) => {
        // Normalize fields (handle both camelCase and snake_case)
        const v1Status = car.verifiedByStatus ?? car.verified_by_status ?? null;
        const v1By = car.verifiedBy ?? car.verified_by ?? null;

        const cStatus = car.completedByStatus ?? car.completed_by_status ?? null;
        const cBy = car.completedBy ?? car.completed_by ?? null;

        const aStatus = car.acknowledgedByStatus ?? car.acknowledged_by_status ?? null;
        const aBy = car.acknowledgedBy ?? car.acknowledged_by ?? null;

        const pStatus = car.approvedByStatus ?? car.approved_by_status ?? null;
        const pBy = car.approvedBy ?? car.approved_by ?? null;

        const p2Status = car.approvedByStatus2 ?? car.approvedBy2Status ?? car.approved_by_status_2 ?? car.approve_by_status_2 ?? null;
        const p2By = car.approvedBy ?? car.approvedBy2 ?? car.approved_by_2 ?? car.approve_by_2 ?? null; // Reuse approvedBy or specific field

        // ลำดับที่ 1: approved_by_status
        if (pBy === userCode && isPending(pStatus)) {
            actionRequests.push({ id: car.id, car, actionType: 'approved_by_status', currentStatus: pStatus });
            return;
        }

        // ลำดับที่ 2: completed_by_status (ต้องผ่าน approve)
        if (isApproved(pStatus) && cBy === userCode && isPending(cStatus)) {
            actionRequests.push({ id: car.id, car, actionType: 'completed_by_status', currentStatus: cStatus });
            return;
        }

        // ลำดับที่ 3: acknowledged_by_status (ต้องผ่าน c)
        if (isApproved(cStatus) && aBy === userCode && isPending(aStatus)) {
            actionRequests.push({ id: car.id, car, actionType: 'acknowledged_by_status', currentStatus: aStatus });
            return;
        }

        // ลำดับที่ 4: verified_by_status (ต้องผ่าน acknowledge)
        if (isApproved(aStatus) && v1By === userCode && isPending(v1Status)) {
            actionRequests.push({ id: car.id, car, actionType: 'verified_by_status', currentStatus: v1Status });
            return;
        }

        // ลำดับที่ 5: approved_by_status_2 (ต้องผ่าน verify)
        if (isApproved(v1Status) && p2By === userCode && isPending(p2Status)) {
            actionRequests.push({ id: car.id, car, actionType: 'approved_by_status_2', currentStatus: p2Status });
            return;
        }
    });

    return actionRequests;
}

/**
 * Filter action requests for Single Source Justification
 * Workflow: Assessed By -> Verified By -> Approved By -> Acknowledged By
 */
export function filterSingleSourceJustificationActionRequests(
    requests: any[],
    userCode: string | null
): Array<{ id: number; request: any; actionType: 'verify_by_status' | 'approved_by_status' | 'acknowledged_by_status'; currentStatus: string | null }> {
    if (!userCode) {
        console.warn('No user code found, returning empty action requests');
        return [];
    }

    const actionRequests: Array<{ id: number; request: any; actionType: 'verify_by_status' | 'approved_by_status' | 'acknowledged_by_status'; currentStatus: string | null }> = [];

    requests.forEach((req) => {
        if (isRejected(req.verify_by_status) || isRejected(req.approved_by_status) || isRejected(req.acknowledged_by_status)) {
            return;
        }

        if (req.verify_by === userCode) {
            if (isPending(req.verify_by_status)) {
                actionRequests.push({
                    id: Number(req.id),
                    request: req,
                    actionType: 'verify_by_status' as const,
                    currentStatus: req.verify_by_status || null
                });
                return;
            }
        }

        if (req.approved_by === userCode) {
            if (isApproved(req.verify_by_status) && isPending(req.approved_by_status)) {
                actionRequests.push({
                    id: Number(req.id),
                    request: req,
                    actionType: 'approved_by_status' as const,
                    currentStatus: req.approved_by_status || null
                });
                return;
            }
        }

        if (req.acknowledged_by === userCode) {
            if (isApproved(req.verify_by_status) && isApproved(req.approved_by_status) && isPending(req.acknowledged_by_status)) {
                actionRequests.push({
                    id: Number(req.id),
                    request: req,
                    actionType: 'acknowledged_by_status' as const,
                    currentStatus: req.acknowledged_by_status || null
                });
                return;
            }
        }
    });

    return actionRequests;
}

/**
 * Filter action requests for Purchase Order
 * Workflow: Verified By -> Approved By -> Circ (optional) -> Signed By -> Acknowledged By
 */
export function filterPurchaseOrderActionRequests(
    requests: any[],
    userCode: string | null
): Array<{ id: string; request: any; actionType: 'verified_by_status' | 'approved_by_status' | 'circ_status' | 'signed_by_status' | 'acknowledged_by_status'; currentStatus: string | null }> {
    if (!userCode) {
        console.warn('No user code found, returning empty action requests');
        return [];
    }

    const actionRequests: Array<{ id: string; request: any; actionType: 'verified_by_status' | 'approved_by_status' | 'circ_status' | 'signed_by_status' | 'acknowledged_by_status'; currentStatus: string | null }> = [];

    requests.forEach((req) => {
        const documentStatus = String(req.status ?? '').trim().toLowerCase();
        if (documentStatus === 'draft') {
            return;
        }

        // Support both camelCase and snake_case from API
        const verifiedBy = req.verifiedBy ?? req.verified_by ?? null;
        const verifiedByStatus = req.verifiedByStatus ?? req.verified_by_status ?? null;
        const approvedBy = req.approvedBy ?? req.approved_by ?? null;
        const approvedByStatus = req.approvedByStatus ?? req.approved_by_status ?? null;
        const circ = req.circ ?? req.circ_by ?? null;
        const circStatus = req.circStatus ?? req.circ_status ?? req.circ_by_status ?? null;
        const signedBy = req.signedBy ?? req.signed_by ?? null;
        const signedByStatus = req.signedByStatus ?? req.signed_by_status ?? null;
        const acknowledgedBy = req.acknowledgedBy ?? req.acknowledged_by ?? null;
        const acknowledgedByStatus = req.acknowledgedByStatus ?? req.acknowledged_by_status ?? null;

        // ถ้า step ใดถูก reject แล้ว ไม่แสดง action
        if (isRejected(verifiedByStatus) || isRejected(approvedByStatus) || isRejected(circStatus) || isRejected(signedByStatus) || isRejected(acknowledgedByStatus)) {
            return;
        }

        const isEmptyStatus = (s: string | null | undefined): boolean =>
            s === null || s === undefined || s === '';

        // ==== ลำดับขั้นแบบบนลงล่าง ====

        // STEP 1: Verified By
        const verifiedStepUsed = hasStepAssignee(verifiedBy) || !isEmptyStatus(verifiedByStatus);
        if (verifiedStepUsed) {
            if (!isApproved(verifiedByStatus)) {
                if (hasStepAssignee(verifiedBy) && verifiedBy === userCode && isPending(verifiedByStatus)) {
                    actionRequests.push({
                        id: req.id,
                        request: req,
                        actionType: 'verified_by_status' as const,
                        currentStatus: verifiedByStatus || null
                    });
                }
                return; // ตัวบล็อก: ถ้าขั้นนี้ยังไม่ผ่าน ห้ามไปขั้นถัดไป
            }
        }

        // STEP 2: Approved By
        const approvedStepUsed = hasStepAssignee(approvedBy) || !isEmptyStatus(approvedByStatus);
        if (approvedStepUsed) {
            if (!isApproved(approvedByStatus)) {
                if (hasStepAssignee(approvedBy) && approvedBy === userCode && isPending(approvedByStatus)) {
                    actionRequests.push({
                        id: req.id,
                        request: req,
                        actionType: 'approved_by_status' as const,
                        currentStatus: approvedByStatus || null
                    });
                }
                return; // ตัวบล็อก
            }
        }

        // STEP 3: Circ (optional)
        const circStepUsed = hasStepAssignee(circ) || !isEmptyStatus(circStatus);
        if (circStepUsed) {
            if (!isApproved(circStatus)) {
                if (hasStepAssignee(circ) && circ === userCode && isPending(circStatus)) {
                    actionRequests.push({
                        id: req.id,
                        request: req,
                        actionType: 'circ_status' as const,
                        currentStatus: circStatus || null
                    });
                }
                return; // ตัวบล็อก
            }
        }

        // STEP 4: Signed By
        const signedStepUsed = hasStepAssignee(signedBy) || !isEmptyStatus(signedByStatus);
        if (signedStepUsed) {
            if (!isApproved(signedByStatus)) {
                if (hasStepAssignee(signedBy) && signedBy === userCode && isPending(signedByStatus)) {
                    actionRequests.push({
                        id: req.id,
                        request: req,
                        actionType: 'signed_by_status' as const,
                        currentStatus: signedByStatus || null
                    });
                }
                return; // ตัวบล็อก
            }
        }

        // STEP 5: Acknowledged By
        const acknowledgedStepUsed = hasStepAssignee(acknowledgedBy) || !isEmptyStatus(acknowledgedByStatus);
        if (acknowledgedStepUsed) {
            if (hasStepAssignee(acknowledgedBy) && acknowledgedBy === userCode && isPending(acknowledgedByStatus)) {
                actionRequests.push({
                    id: req.id,
                    request: req,
                    actionType: 'acknowledged_by_status' as const,
                    currentStatus: acknowledgedByStatus || null
                });
            }
        }
    });

    return actionRequests;
}

/**
 * เช็คว่ามีการกำหนดผู้รับผิดชอบขั้นนี้หรือไม่ (มีค่าไม่ null/ว่าง)
 */
function hasStepAssignee(by: string | null | undefined): boolean {
    if (by == null) return false;
    return String(by).trim() !== '';
}

function hasWorkflowStatus(status: string | null | undefined): boolean {
    return normalizeStatus(status) !== null;
}

/**
 * Filter action requests for Purchase Requisition
 * Workflow: Verified By IS (optional) -> Verified By -> Approved By -> Acknowledged By
 * - Verified By IS อาจมีหรือไม่มี: ถ้ามีต้องขึ้นมาให้ทำก่อน ถ้าไม่มีก็ข้ามไปทำ Verified By ได้เลย
 */
export function filterPurchaseRequisitionActionRequests(
    requests: any[],
    userCode: string | null
): Array<{ id: string; request: any; actionType: 'verified_by_is_status' | 'verified_by_status' | 'approved_by_status' | 'approved_by_2_status' | 'acknowledged_by_status' | 'action_by_admin'; currentStatus: string | null }> {
    if (!userCode) {
        console.warn('No user code found, returning empty action requests');
        return [];
    }

    const actionRequests: Array<{ id: string; request: any; actionType: 'verified_by_is_status' | 'verified_by_status' | 'approved_by_status' | 'approved_by_2_status' | 'acknowledged_by_status' | 'action_by_admin'; currentStatus: string | null }> = [];

    requests.forEach((req) => {
        const documentStatus = String(req.status ?? '').trim().toLowerCase();
        if (documentStatus === 'draft') {
            return;
        }

        // Support both camelCase and snake_case from API
        const verifiedByIs = req.verifiedByIs ?? req.verified_by_is ?? null;
        const verifiedByIsStatus = req.verifiedByIsStatus ?? req.verified_by_is_status ?? null;
        const verifiedBy = req.verifiedBy ?? req.verified_by ?? null;
        const verifiedByStatus = req.verifiedByStatus ?? req.verified_by_status ?? null;
        const approvedBy = req.approvedBy ?? req.approved_by ?? null;
        const approvedByStatus = req.approvedByStatus ?? req.approved_by_status ?? null;
        const approvedBy2 = req.approvedBy2 ?? req.approved_by_2 ?? null;
        const approvedBy2Status = req.approvedBy2Status ?? req.approved_by_2_status ?? null;
        const acknowledgedBy = req.acknowledgedBy ?? req.acknowledged_by ?? null;
        const acknowledgedByStatus = req.acknowledgedByStatus ?? req.acknowledged_by_status ?? null;
        const actionByAdmin = req.actionByAdmin ?? req.action_by_admin ?? null;
        const actionByAdminStatus = req.actionByAdminStatus ?? req.action_by_admin_status ?? null;
        const actionByAdminDate = req.actionByAdminDate ?? req.action_by_admin_date ?? null;

        // ถ้า step ใดถูก reject แล้ว ไม่แสดง action
        if (isRejected(verifiedByIsStatus) || isRejected(verifiedByStatus) || isRejected(approvedByStatus) || isRejected(approvedBy2Status) || isRejected(acknowledgedByStatus) || isRejected(actionByAdminStatus)) {
            return;
        }

        // ==== ลำดับขั้นแบบบนลงล่าง ====
        const isEmptyStatus = (s: string | null | undefined): boolean =>
            s === null || s === undefined || s === '';

        // STEP 1: Verified By IS (optional)
        // - ถ้ามี code (assignee) และ status ยังไม่ approved:
        //   - ถ้า user ปัจจุบัน = assignee และสถานะ pending -> ให้ action แค่ขั้นนี้
        //   - ถ้าไม่ใช่ -> หยุดที่นี่ ไม่ไปขั้นถัดไป
        // - ถ้าไม่มี code เลย -> ถือว่า "ไม่มีขั้นนี้" ข้ามไป STEP 2 โดยไม่สน status
        if (hasStepAssignee(verifiedByIs)) {
            if (!isApproved(verifiedByIsStatus)) {
                if (verifiedByIs === userCode && isPending(verifiedByIsStatus)) {
                    actionRequests.push({
                        id: req.id,
                        request: req,
                        actionType: 'verified_by_is_status' as const,
                        currentStatus: verifiedByIsStatus || null
                    });
                }
                return;
            }
            // ถ้า approved แล้ว -> ไป STEP 2
        }

        // STEP 2: Verified By (ต้องมาก่อน Approved By เสมอ)
        // - ถือว่า "มีขั้นนี้" ถ้ามี code หรือมี status ใด ๆ
        // - ถ้าขั้นนี้ยังไม่ approved:
        //   - ถ้า user = assignee และ pending -> ให้ action ที่นี่
        //   - ถ้าไม่ใช่ / ไม่มี code แต่ status ยัง pending -> หยุด ไม่ไป Approved By
        const verifiedStepUsed = hasStepAssignee(verifiedBy) || !isEmptyStatus(verifiedByStatus);
        if (verifiedStepUsed) {
            if (!isApproved(verifiedByStatus)) {
                if (hasStepAssignee(verifiedBy) && verifiedBy === userCode && isPending(verifiedByStatus)) {
                    actionRequests.push({
                        id: req.id,
                        request: req,
                        actionType: 'verified_by_status' as const,
                        currentStatus: verifiedByStatus || null
                    });
                }
                return;
            }
            // ถ้า approved แล้ว -> ไป STEP 3
        }

        // STEP 3: Approved By
        // - ถือว่า "มีขั้นนี้" ถ้ามี code หรือมี status ใด ๆ
        // - ถ้ายังไม่ approved:
        //   - ถ้า user = assignee และ pending -> ให้ action
        //   - ถ้าไม่ใช่ / ไม่มี code แต่ status ยัง pending -> หยุด ไม่ไป Acknowledged By
        const approvedStepUsed = hasStepAssignee(approvedBy) || !isEmptyStatus(approvedByStatus);
        if (approvedStepUsed) {
            if (!isApproved(approvedByStatus)) {
                if (hasStepAssignee(approvedBy) && approvedBy === userCode && isPending(approvedByStatus)) {
                    actionRequests.push({
                        id: req.id,
                        request: req,
                        actionType: 'approved_by_status' as const,
                        currentStatus: approvedByStatus || null
                    });
                }
                return;
            }
            // ถ้า approved แล้ว -> ไป STEP 4
        }

        // STEP 4: Approved By 2 (required only when assigned by high-value PR policy)
        const approvedBy2StepUsed = hasStepAssignee(approvedBy2) || !isEmptyStatus(approvedBy2Status);
        if (approvedBy2StepUsed) {
            if (!isApproved(approvedBy2Status)) {
                if (hasStepAssignee(approvedBy2) && approvedBy2 === userCode && isPending(approvedBy2Status)) {
                    actionRequests.push({
                        id: req.id,
                        request: req,
                        actionType: 'approved_by_2_status' as const,
                        currentStatus: approvedBy2Status || null
                    });
                }
                return;
            }
            // ถ้า approved แล้ว -> ไป STEP 5
        }

        // STEP 5: Acknowledged By
        // - ถือว่า "มีขั้นนี้" ถ้ามี code หรือมี status ใด ๆ
        const acknowledgedStepUsed = hasStepAssignee(acknowledgedBy) || !isEmptyStatus(acknowledgedByStatus);
        if (!acknowledgedStepUsed) {
            return;
        }

        if (hasStepAssignee(acknowledgedBy) && isPending(acknowledgedByStatus) && acknowledgedBy === userCode) {
            actionRequests.push({
                id: req.id,
                request: req,
                actionType: 'acknowledged_by_status' as const,
                currentStatus: acknowledgedByStatus || null
            });
        }

        if (!isApproved(acknowledgedByStatus)) {
            return;
        }

        if (hasStepAssignee(actionByAdmin) && actionByAdmin === userCode && isPending(actionByAdminStatus) && !actionByAdminDate) {
            actionRequests.push({
                id: req.id,
                request: req,
                actionType: 'action_by_admin' as const,
                currentStatus: actionByAdminStatus || 'pending'
            });
        }
        return;
    });

    return actionRequests;
}

/**
 * Filter action requests for Supplier Assessment
 * Workflow: Assessed By -> Approved By -> Acknowledged By
 */
export function filterSupplierAssessmentActionRequests(
    requests: any[],
    userCode: string | null
): Array<{ id: string; request: any; actionType: 'approved_by_status' | 'acknowledged_by_status'; currentStatus: string | null }> {
    if (!userCode) {
        console.warn('No user code found, returning empty action requests');
        return [];
    }

    const actionRequests: Array<{ id: string; request: any; actionType: 'approved_by_status' | 'acknowledged_by_status'; currentStatus: string | null }> = [];

    requests.forEach((req) => {
        if (isRejected(req.approvedByStatus) || isRejected(req.acknowledgedByStatus)) {
            return;
        }

        if (req.approvedBy === userCode) {
            if (isPending(req.approvedByStatus)) {
                actionRequests.push({
                    id: req.id,
                    request: req,
                    actionType: 'approved_by_status' as const,
                    currentStatus: req.approvedByStatus || null
                });
                return;
            }
        }

        if (req.acknowledgedBy === userCode) {
            if (isApproved(req.approvedByStatus) && isPending(req.acknowledgedByStatus)) {
                actionRequests.push({
                    id: req.id,
                    request: req,
                    actionType: 'acknowledged_by_status' as const,
                    currentStatus: req.acknowledgedByStatus || null
                });
                return;
            }
        }
    });

    return actionRequests;
}

/**
 * Filter action requests for Supplier Evaluation
 * Workflow: Evaluated By -> Approved By -> Acknowledged By
 */
export function filterSupplierEvaluationActionRequests(
    requests: any[],
    userCode: string | null
): Array<{ id: string; request: any; actionType: 'acknowledged_by_status' | 'approved_by_status'; currentStatus: string | null }> {
    if (!userCode) {
        console.warn('No user code found, returning empty action requests');
        return [];
    }

    const actionRequests: Array<{ id: string; request: any; actionType: 'acknowledged_by_status' | 'approved_by_status'; currentStatus: string | null }> = [];

    requests.forEach((req) => {
        if (isRejected(req.approvedByStatus) || isRejected(req.acknowledgedByStatus)) {
            return;
        }

        if (req.approvedBy === userCode) {
            if (isPending(req.approvedByStatus)) {
                actionRequests.push({
                    id: req.id,
                    request: req,
                    actionType: 'approved_by_status' as const,
                    currentStatus: req.approvedByStatus || null
                });
                return;
            }
        }

        if (req.acknowledgedBy === userCode) {
            if (isApproved(req.approvedByStatus) && isPending(req.acknowledgedByStatus)) {
                actionRequests.push({
                    id: req.id,
                    request: req,
                    actionType: 'acknowledged_by_status' as const,
                    currentStatus: req.acknowledgedByStatus || null
                });
                return;
            }
        }
    });

    return actionRequests;
}

/**
 * Filter action requests for Sub Consultant Assessment
 * Workflow: Assessed By -> Approved By -> Acknowledged By
 * แสดง action ตามลำดับ: เฉพาะขั้นที่ยัง pending จริง ถ้า assessed_by_status = APPROVED แล้ว จะไปแสดง approved_by (ถ้า user เป็น approved_by และ approved_by_status ยัง pending)
 */
export function filterSubConsultantAssessmentActionRequests(
    requests: any[],
    userCode: string | null
): Array<{ id: string; request: any; actionType: 'approved_by_status' | 'acknowledged_by_status'; currentStatus: string | null }> {
    if (!userCode) {
        console.warn('No user code found, returning empty action requests');
        return [];
    }

    const actionRequests: Array<{ id: string; request: any; actionType: 'approved_by_status' | 'acknowledged_by_status'; currentStatus: string | null }> = [];

    requests.forEach((req) => {
        // Support both snake_case from API
        const approvedByStatus = req.approved_by_status ?? req.approvedByStatus ?? null;
        const acknowledgedByStatus = req.acknowledged_by_status ?? req.acknowledgedByStatus ?? null;

        if (isRejected(approvedByStatus) || isRejected(acknowledgedByStatus)) {
            return;
        }

        if (req.approved_by === userCode) {
            if (isPending(approvedByStatus)) {
                actionRequests.push({
                    id: String(req.id),
                    request: req,
                    actionType: 'approved_by_status' as const,
                    currentStatus: approvedByStatus || null
                });
                return;
            }
        }

        if (req.acknowledged_by === userCode) {
            if (isApproved(approvedByStatus) && isPending(acknowledgedByStatus)) {
                actionRequests.push({
                    id: String(req.id),
                    request: req,
                    actionType: 'acknowledged_by_status' as const,
                    currentStatus: acknowledgedByStatus || null
                });
                return;
            }
        }
    });

    return actionRequests;
}

/**
 * Filter action requests for Expenses Claim
 * Workflow: Verified By -> Approved By
 */
export function filterExpensesClaimActionRequests(
    requests: any[],
    userCode: string | null
): Array<{ id: string; request: any; actionType: 'verified_by_status' | 'approved_by_status'; currentStatus: string | null }> {
    if (!userCode) {
        console.warn('No user code found, returning empty action requests');
        return [];
    }

    const actionRequests: Array<{ id: string; request: any; actionType: 'verified_by_status' | 'approved_by_status'; currentStatus: string | null }> = [];

    requests.forEach((req) => {
        const verifiedBy = req.verified_by ?? req.verifiedBy ?? null;
        const verifiedByStatus = req.verified_by_status ?? req.verifiedByStatus ?? null;
        const approvedBy = req.approved_by ?? req.approvedBy ?? null;
        const approvedByStatus = req.approved_by_status ?? req.approvedByStatus ?? null;

        if (isRejected(verifiedByStatus) || isRejected(approvedByStatus)) {
            return;
        }

        if (verifiedBy === userCode && isPending(verifiedByStatus)) {
            actionRequests.push({
                id: String(req.id),
                request: req,
                actionType: 'verified_by_status',
                currentStatus: verifiedByStatus || null
            });
            return;
        }

        if (approvedBy === userCode && isApproved(verifiedByStatus) && isPending(approvedByStatus)) {
            actionRequests.push({
                id: String(req.id),
                request: req,
                actionType: 'approved_by_status',
                currentStatus: approvedByStatus || null
            });
            return;
        }

    });

    return actionRequests;
}

/**
 * Filter action requests for Allowance for Working After 10.00 PM
 * Workflow: Verified By -> Approved By
 */
export function filterAllowanceAfter10pmActionRequests(
    requests: any[],
    userCode: string | null
): Array<{ id: string; request: any; actionType: 'tl_by_status' | 'di_by_status'; currentStatus: string | null }> {
    if (!userCode) {
        console.warn('No user code found, returning empty action requests');
        return [];
    }

    const actionRequests: Array<{ id: string; request: any; actionType: 'tl_by_status' | 'di_by_status'; currentStatus: string | null }> = [];

    requests.forEach((req) => {
        const tlBy = req.tl_by ?? req.tlBy ?? null;
        const tlByStatus = req.tl_by_status ?? req.tlByStatus ?? null;
        const diBy = req.di_by ?? req.diBy ?? null;
        const diByStatus = req.di_by_status ?? req.diByStatus ?? null;

        if (isRejected(tlByStatus) || isRejected(diByStatus)) {
            return;
        }

        if (tlBy === userCode && isPending(tlByStatus)) {
            actionRequests.push({
                id: String(req.id),
                request: req,
                actionType: 'tl_by_status',
                currentStatus: tlByStatus || null
            });
            return;
        }

        if (diBy === userCode && isApproved(tlByStatus) && isPending(diByStatus)) {
            actionRequests.push({
                id: String(req.id),
                request: req,
                actionType: 'di_by_status',
                currentStatus: diByStatus || null
            });
            return;
        }

    });

    return actionRequests;
}

/**
 * Filter action requests for Sub Consultant Evaluation
 * Workflow: Evaluated By -> Approved By -> Acknowledged By
 */
export function filterSubConsultantEvaluationActionRequests(
    requests: any[],
    userCode: string | null
): Array<{ id: number; request: any; actionType: 'approved_by_status' | 'acknowledged_by_status'; currentStatus: string | null }> {
    if (!userCode) {
        console.warn('No user code found, returning empty action requests');
        return [];
    }

    const actionRequests: Array<{ id: number; request: any; actionType: 'approved_by_status' | 'acknowledged_by_status'; currentStatus: string | null }> = [];

    requests.forEach((req) => {
        if (isRejected(req.approvedByStatus) || isRejected(req.acknowledgedByStatus)) {
            return;
        }

        if (req.approvedBy === userCode) {
            if (isPending(req.approvedByStatus)) {
                actionRequests.push({
                    id: Number(req.id),
                    request: req,
                    actionType: 'approved_by_status' as const,
                    currentStatus: req.approvedByStatus || null
                });
                return;
            }
        }

        if (req.acknowledgedBy === userCode) {
            if (isApproved(req.approvedByStatus) && isPending(req.acknowledgedByStatus)) {
                actionRequests.push({
                    id: Number(req.id),
                    request: req,
                    actionType: 'acknowledged_by_status' as const,
                    currentStatus: req.acknowledgedByStatus || null
                });
                return;
            }
        }
    });

    return actionRequests;
}

/**
 * Filter action requests for Controlled Document Request
 * Workflow: Reviewed By -> Approved By -> Acknowledged By (Final)
 */
export function filterControlledDocumentRequestActionRequests(
    requests: any[],
    userCode: string | null
): Array<{ id: string; request: any; actionType: 'reviewed_by_status' | 'approved_by_status' | 'acknowledged_by_status' | 'acknowledged_by_status_2'; currentStatus: string | null }> {
    if (!userCode) {
        console.warn('No user code found, returning empty action requests');
        return [];
    }

    const actionRequests: Array<{ id: string; request: any; actionType: 'reviewed_by_status' | 'approved_by_status' | 'acknowledged_by_status' | 'acknowledged_by_status_2'; currentStatus: string | null }> = [];

    requests.forEach((req) => {
        const requestStatus = normalizeStatus(req.status);
        if (requestStatus === 'actioned' || requestStatus === 'completed' || requestStatus === 'complete' || isRejected(requestStatus)) {
            return;
        }

        const reviewedByStatus = req.reviewedByStatus ?? req.reviewed_by_status ?? null;
        const approvedByStatus = req.approvedByStatus ?? req.approved_by_status ?? null;
        const acknowledgedByStatus2 = req.acknowledgedByStatus2 ?? req.acknowledged_by_status_2 ?? null;

        // ถ้า Step ใดถูก Reject แล้ว หยุด Workflow (ยกเว้น Reject แล้วให้กลับมาทำใหม่ได้ ถ้า Logic ฝั่ง Action มีการ Reset)
        if (isRejected(reviewedByStatus) || isRejected(approvedByStatus) || isRejected(acknowledgedByStatus2)) {
            return;
        }

        // ลำดับที่ 1: Acknowledged By (First Action)
        // ลำดับที่ 2: Reviewed By
        if (req.reviewedBy === userCode || req.reviewed_by === userCode) {
            if (isPending(reviewedByStatus)) {
                actionRequests.push({
                    id: String(req.id),
                    request: req,
                    actionType: 'reviewed_by_status' as const,
                    currentStatus: reviewedByStatus || null
                });
                return;
            }
        }

        // ลำดับที่ 3: Approved By
        if (req.approvedBy === userCode || req.approved_by === userCode) {
            if (isApproved(reviewedByStatus) && isPending(approvedByStatus)) {
                actionRequests.push({
                    id: String(req.id),
                    request: req,
                    actionType: 'approved_by_status' as const,
                    currentStatus: approvedByStatus || null
                });
                return;
            }
        }

        // ลำดับที่ 4: Acknowledged By (Final Action / Status 2)
        if (req.acknowledgedBy === userCode || req.acknowledged_by === userCode) {
            if (isApproved(approvedByStatus) && isPending(acknowledgedByStatus2)) {
                actionRequests.push({
                    id: String(req.id),
                    request: req,
                    actionType: 'acknowledged_by_status_2' as const,
                    currentStatus: acknowledgedByStatus2 || null
                });
                return;
            }
        }
    });

    return actionRequests;
}

/**
 * Check if a request is still pending (not all workflow steps are approved)
 * These functions are used for "Pending Request" tab filtering
 */

/**
 * Check if Purchase Requisition is still pending (not all workflow steps approved)
 */
export function isPurchaseRequisitionPending(item: any): boolean {
    if (String(item?.status ?? '').trim().toLowerCase() === 'draft') {
        return false;
    }

    const workflowSteps = [
        {
            by: item.verifiedByIs ?? item.verified_by_is,
            status: item.verifiedByIsStatus ?? item.verified_by_is_status
        },
        {
            by: item.verifiedBy ?? item.verified_by,
            status: item.verifiedByStatus ?? item.verified_by_status
        },
        {
            by: item.approvedBy ?? item.approved_by,
            status: item.approvedByStatus ?? item.approved_by_status
        },
        {
            by: item.approvedBy2 ?? item.approved_by_2,
            status: item.approvedBy2Status ?? item.approved_by_2_status
        },
        {
            by: item.acknowledgedBy ?? item.acknowledged_by,
            status: item.acknowledgedByStatus ?? item.acknowledged_by_status
        },
        {
            by: item.actionByAdmin ?? item.action_by_admin,
            status: item.actionByAdminStatus ?? item.action_by_admin_status ?? ((item.actionByAdminDate ?? item.action_by_admin_date) ? 'approved' : 'pending')
        }
    ].filter((step) => hasStepAssignee(step.by));

    if (workflowSteps.length === 0) {
        return false;
    }

    // ถ้า reject แล้วไม่นับเป็น pending
    if (workflowSteps.some((step) => isRejected(step.status))) {
        return false;
    }

    // ไม่นับ requested_by_status และไม่นับ step optional ที่ไม่มี assignee
    return !workflowSteps.every((step) => isApproved(step.status));
}

/**
 * Check if Purchase Order is still pending
 */
export function isPurchaseOrderPending(item: any): boolean {
    if (String(item?.status ?? '').trim().toLowerCase() === 'draft') {
        return false;
    }

    const workflowSteps = [
        {
            by: item.purchaseRequestBy ?? item.purchase_request_by,
            status: item.purchaseRequestByStatus ?? item.purchase_request_by_status
        },
        {
            by: item.verifiedBy ?? item.verified_by,
            status: item.verifiedByStatus ?? item.verified_by_status
        },
        {
            by: item.approvedBy ?? item.approved_by,
            status: item.approvedByStatus ?? item.approved_by_status
        },
        {
            by: item.circ ?? item.circ_by,
            status: item.circStatus ?? item.circ_status ?? item.circ_by_status
        },
        {
            by: item.signedBy ?? item.signed_by,
            status: item.signedByStatus ?? item.signed_by_status
        },
        {
            by: item.acknowledgedBy ?? item.acknowledged_by,
            status: item.acknowledgedByStatus ?? item.acknowledged_by_status
        }
    ].filter((step) => hasStepAssignee(step.by));

    if (workflowSteps.length === 0) {
        return false;
    }

    if (workflowSteps.some((step) => isRejected(step.status))) {
        return false;
    }

    return !workflowSteps.every((step) => isApproved(step.status));
}

/**
 * Check if Supplier Assessment is still pending
 */
export function isSupplierAssessmentPending(item: any): boolean {
    if (isRejected(item.approvedByStatus) || isRejected(item.acknowledgedByStatus)) {
        return false;
    }
    return !(isApproved(item.approvedByStatus) && isApproved(item.acknowledgedByStatus));
}

/**
 * Check if Supplier Evaluation is still pending
 */
export function isSupplierEvaluationPending(item: any): boolean {
    if (isRejected(item.acknowledgedByStatus) || isRejected(item.approvedByStatus)) {
        return false;
    }
    return !(isApproved(item.acknowledgedByStatus) && isApproved(item.approvedByStatus));
}

/**
 * Check if Sub-Consultant Assessment is still pending
 */
export function isSubConsultantAssessmentPending(item: any): boolean {
    const approved = item.approved_by_status ?? item.approvedByStatus;
    const acknowledged = item.acknowledged_by_status ?? item.acknowledgedByStatus;

    if (isRejected(approved) || isRejected(acknowledged)) {
        return false;
    }
    return !(isApproved(approved) && isApproved(acknowledged));
}

/**
 * Check if Sub-Consultant Evaluation is still pending
 */
export function isSubConsultantEvaluationPending(item: any): boolean {
    if (isRejected(item.approvedByStatus) || isRejected(item.acknowledgedByStatus)) {
        return false;
    }
    return !(isApproved(item.approvedByStatus) && isApproved(item.acknowledgedByStatus));
}

/**
 * Check if Expenses Claim is still pending
 */
export function isExpensesClaimPending(item: any): boolean {
    const verified = item.verified_by_status ?? item.verifiedByStatus;
    const approved = item.approved_by_status ?? item.approvedByStatus;

    if (isRejected(verified) || isRejected(approved)) {
        return false;
    }
    return !(isApproved(verified) && isApproved(approved));
}

/**
 * Check if Allowance for Working After 10.00 PM is still pending
 */
export function isAllowanceAfter10pmPending(item: any): boolean {
    const tl = item.tl_by_status ?? item.tlByStatus;
    const di = item.di_by_status ?? item.diByStatus;

    if (isRejected(tl) || isRejected(di)) {
        return false;
    }
    return !(isApproved(tl) && isApproved(di));
}

/**
 * Check if Single Source Justification is still pending
 */
export function isSingleSourceJustificationPending(item: any): boolean {
    const approved = item.approved_by_status ?? item.approvedByStatus;
    const acknowledged = item.acknowledged_by_status ?? item.acknowledgedByStatus;

    if (isRejected(approved) || isRejected(acknowledged)) {
        return false;
    }
    return !(isApproved(approved) && isApproved(acknowledged));
}

/**
 * Check if Controlled Document Request is still pending
 */
export function isControlledDocumentRequestPending(item: any): boolean {
    const requestStatus = normalizeStatus(item?.status);
    if (requestStatus === 'actioned' || requestStatus === 'completed' || requestStatus === 'complete' || isRejected(requestStatus)) {
        return false;
    }

    const acknowledgedBy = item.acknowledgedBy ?? item.acknowledged_by ?? null;
    const reviewedBy = item.reviewedBy ?? item.reviewed_by ?? null;
    const approvedBy = item.approvedBy ?? item.approved_by ?? null;
    const reviewedStatus = item.reviewedByStatus ?? item.reviewed_by_status ?? null;
    const approvedStatus = item.approvedByStatus ?? item.approved_by_status ?? null;
    const acknowledgedStatus2 = item.acknowledgedByStatus2 ?? item.acknowledged_by_status_2 ?? null;
    const workflowSteps = [
        { by: reviewedBy, status: reviewedStatus },
        { by: approvedBy, status: approvedStatus },
        { by: acknowledgedBy, status: acknowledgedStatus2 }
    ].filter((step) => hasStepAssignee(step.by) || hasWorkflowStatus(step.status));

    if (workflowSteps.length === 0) {
        return false;
    }

    if (workflowSteps.some((step) => isRejected(step.status))) {
        return false;
    }

    return !workflowSteps.every((step) => isApproved(step.status));
}

/**
 * Check if Charitable Contribution is still pending
 * Support both camelCase and snake_case (เหมือนโมดูลอื่น)
 */
export function isCharitableContributionPending(item: any): boolean {
    const acsc = item.acscByStatus ?? item.acsc_by_status;
    const approver = item.approverByStatus ?? item.approver_by_status;
    const approver2 = item.approverBy2Status ?? item.approver_by_2_status;
    const approver2Assigned = !!(item.approverBy2 ?? item.approver_by_2);
    const acsl = item.acslByStatus ?? item.acsl_by_status;
    const ims = item.imsAcknowledgedByStatus ?? item.ims_acknowledged_by_status;

    if (isRejected(acsc) || isRejected(approver) || isRejected(approver2) || isRejected(ims) || isRejected(acsl)) {
        return false;
    }
    return !(isApproved(acsc) && isApproved(approver) && (!approver2Assigned || isApproved(approver2)) && isApproved(ims) && isApproved(acsl));
}

/**
 * Check if Gift Hospitality is still pending
 */
export function isGiftHospitalityPending(item: any): boolean {
    const approved = item.approvedByStatus ?? item.approved_by_status;
    const acknowledged = item.acknowledgedByStatus ?? item.acknowledged_by_status;
    const verified = item.verifiedByStatus ?? item.verified_by_status;
    const ims = item.imsAcknowledgedByStatus ?? item.ims_acknowledged_by_status;

    if (isRejected(approved) || isRejected(acknowledged) || isRejected(verified) || isRejected(ims)) {
        return false;
    }
    return !(isApproved(approved) && isApproved(ims) && isApproved(acknowledged) && isApproved(verified));
}

/**
 * Check if Gift Hospitality Offering is still pending
 */
export function isGiftHospitalityOfferingPending(item: any): boolean {
    const verified = item.verifiedByStatus ?? item.verified_by_status;
    const approved = item.approvedByStatus ?? item.approved_by_status;
    const approved2 = item.approvedBy2Status ?? item.approved_by_2_status;
    const approved2Assigned = !!(item.approvedBy2 ?? item.approved_by_2);
    const acknowledged = item.acknowledgedByStatus ?? item.acknowledged_by_status;
    const ims = item.imsAcknowledgedByStatus ?? item.ims_acknowledged_by_status;

    if (isRejected(verified) || isRejected(approved) || isRejected(approved2) || isRejected(ims) || isRejected(acknowledged)) {
        return false;
    }
    return !(isApproved(verified) && isApproved(approved) &&
             (!approved2Assigned || isApproved(approved2)) && isApproved(ims) && isApproved(acknowledged));
}

/**
 * Check if CAR is still pending
 */
export function isCarPending(item: any): boolean {
    const approved = item.approvedByStatus ?? item.approved_by_status ?? item.approve_by_status;
    const completed = item.completedByStatus ?? item.completed_by_status ?? item.complete_by_status;
    const acknowledged = item.acknowledgedByStatus ?? item.acknowledged_by_status ?? item.acknowledge_by_status;
    const verified = item.verifiedByStatus ?? item.verified_by_status;
    const approvedRound2 = item.approvedByStatus2 ?? item.approved_by_status_2 ?? item.approve_by_status_2;

    if (isRejected(approved) || isRejected(completed) ||
        isRejected(acknowledged) || isRejected(verified) || isRejected(approvedRound2)) {
        return false;
    }
    return !(isApproved(approved) && isApproved(completed) &&
             isApproved(acknowledged) && isApproved(verified) && isApproved(approvedRound2));
}

/**
 * Filter action requests for LEED Review
 */
export function filterLeedReviewActionRequests(
    requests: any[],
    userCode: string | null
): Array<{ id: string; request: any; actionType: 'reviewed_by_status' | 'responded_by_status' | 'signed_by_status' | 'signed_by_tl_status' | 'acknowledged_by_status'; currentStatus: string | null }> {
    if (!userCode) {
        return [];
    }

    const actionRequests: Array<{ id: string; request: any; actionType: 'reviewed_by_status' | 'responded_by_status' | 'signed_by_status' | 'signed_by_tl_status' | 'acknowledged_by_status'; currentStatus: string | null }> = [];

    requests.forEach((req) => {
        const reviewedBy = req.reviewedBy ?? req.reviewed_by ?? null;
        const reviewedByStatus = req.reviewedByStatus ?? req.reviewed_by_status ?? null;
        const respondedBy = req.respondedBy ?? req.responded_by ?? null;
        const respondedByStatus = req.respondedByStatus ?? req.responded_by_status ?? null;
        const signedBy = req.signedBy ?? req.signed_by ?? null;
        const signedByStatus = req.signedByStatus ?? req.signed_by_status ?? null;
        const signedByTL = req.signedByTL ?? req.signed_by_tl ?? null;
        const signedByTLStatus = req.signedByTLStatus ?? req.signed_by_tl_status ?? null;
        const acknowledgedBy = req.acknowledgedBy ?? req.acknowledged_by ?? null;
        const acknowledgedByStatus = req.acknowledgedByStatus ?? req.acknowledged_by_status ?? null;

        if (isRejected(reviewedByStatus) || isRejected(respondedByStatus) || isRejected(signedByStatus) || isRejected(signedByTLStatus) || isRejected(acknowledgedByStatus)) {
            return;
        }

        // 1. Reviewed By
        if (reviewedBy === userCode && isPending(reviewedByStatus)) {
            actionRequests.push({ id: req.id, request: req, actionType: 'reviewed_by_status', currentStatus: reviewedByStatus });
            return;
        }

        // 2. Responded By (after review)
        if (isApproved(reviewedByStatus) && respondedBy === userCode && isPending(respondedByStatus)) {
            actionRequests.push({ id: req.id, request: req, actionType: 'responded_by_status', currentStatus: respondedByStatus });
            return;
        }

        // 3. Signed By (after response)
        if (isApproved(respondedByStatus) && signedBy === userCode && isPending(signedByStatus)) {
            actionRequests.push({ id: req.id, request: req, actionType: 'signed_by_status', currentStatus: signedByStatus });
            return;
        }

        // 4. Signed By TL (after signed by reviewer)
        if (isApproved(signedByStatus) && signedByTL === userCode && isPending(signedByTLStatus)) {
            actionRequests.push({ id: req.id, request: req, actionType: 'signed_by_tl_status', currentStatus: signedByTLStatus });
            return;
        }

        // 5. Acknowledged By (after signed by TL)
        if (isApproved(signedByTLStatus) && acknowledgedBy === userCode && isPending(acknowledgedByStatus)) {
            actionRequests.push({ id: req.id, request: req, actionType: 'acknowledged_by_status', currentStatus: acknowledgedByStatus });
            return;
        }
    });

    return actionRequests;
}
