import {
    isApproved,
    isRejected,
    normalizeStatus,
} from 'app/core/utils/action-request-filter.util';

export type ExpensesClaimWorkflowStatus =
    | 'draft'
    | 'pending'
    | 'verified'
    | 'reject'
    | 'approve';

export interface ExpensesClaimWorkflowStatusSource {
    status?: string | null;
    verified_by_status?: string | null;
    approved_by_status?: string | null;
}

/**
 * Resolve the list badge without hiding the intermediate Verified state.
 * The API overall status is authoritative for terminal states, while the
 * individual workflow fields remain the fallback for legacy records.
 */
export function resolveExpensesClaimWorkflowStatus(
    item: ExpensesClaimWorkflowStatusSource
): ExpensesClaimWorkflowStatus {
    const overallStatus = normalizeStatus(item.status);
    const verifiedStatus = item.verified_by_status;
    const approvedStatus = item.approved_by_status;

    if (overallStatus === 'draft') return 'draft';

    if (
        overallStatus === 'reject' ||
        overallStatus === 'rejected' ||
        isRejected(verifiedStatus) ||
        isRejected(approvedStatus)
    ) {
        return 'reject';
    }

    if (
        overallStatus === 'approve' ||
        overallStatus === 'approved' ||
        (isApproved(verifiedStatus) && isApproved(approvedStatus))
    ) {
        return 'approve';
    }

    if (overallStatus === 'verified' || isApproved(verifiedStatus)) {
        return 'verified';
    }

    return 'pending';
}
