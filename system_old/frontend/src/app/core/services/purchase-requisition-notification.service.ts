import { Injectable } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { EmployeeOption, EmployeeService } from './employee.service';
import { EmailNotificationPayload, PurchaseRequisitionService } from './purchase-requisition.service';
import { isApproved, isPending, isRejected } from 'app/core/utils/action-request-filter.util';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';

export type PurchaseRequisitionActionType =
    | 'verified_by_is_status'
    | 'verified_by_status'
    | 'approved_by_status'
    | 'approved_by_2_status'
    | 'acknowledged_by_status'
    | 'action_by_admin';

interface PurchaseRequisitionNotificationContext {
    id: string | null;
    documentNumber: string | null;
    documentSubject: string | null;
    requestedBy: string | null;
    requestDate: string | Date | null;
    verifiedByIS: string | null;
    verifiedByISStatus: string | null;
    verifiedBy: string | null;
    verifiedByStatus: string | null;
    approvedBy: string | null;
    approvedByStatus: string | null;
    approvedBy2: string | null;
    approvedBy2Status: string | null;
    acknowledgedBy: string | null;
    acknowledgedByStatus: string | null;
    actionByAdmin: string | null;
    actionByAdminDate: string | null;
}

interface WorkflowStep {
    actionType: PurchaseRequisitionActionType;
    code: string | null;
    status: string | null;
    label: string;
}

interface NotificationRecipient {
    code: string;
    name: string;
    email: string;
}

@Injectable({
    providedIn: 'root'
})
export class PurchaseRequisitionNotificationService {
    constructor(
        private purchaseRequisitionService: PurchaseRequisitionService,
        private employeeService: EmployeeService
    ) {}

    notifyInitialAction(source: any, id?: string | number | null): Observable<any> {
        const context = this.normalizeContext(source, id);
        const nextStep = this.findNextPendingStep(context);

        if (!nextStep) {
            return of({ status: 'skipped', reason: 'no_pending_step' });
        }

        return this.sendActionRequest(context, nextStep);
    }

    resendCurrentPendingAction(source: any, id?: string | number | null): Observable<any> {
        const context = this.normalizeContext(source, id);
        const nextStep = this.findNextPendingStep(context);

        if (!nextStep) {
            return of({ status: 'skipped', reason: 'no_pending_step' });
        }

        return this.sendActionRequest(context, nextStep);
    }

    notifyAfterAction(
        source: any,
        actionType: PurchaseRequisitionActionType,
        status: string,
        id?: string | number | null
    ): Observable<any> {
        const context = this.normalizeContext(source, id);
        this.applyActionStatus(context, actionType, status);

        if (isRejected(status)) {
            return this.sendStatusUpdate(context, 'Rejected', `Rejected at ${this.getActionLabel(actionType)}`);
        }

        if (!isApproved(status)) {
            return of({ status: 'skipped', reason: 'status_not_approved' });
        }

        const nextStep = this.findNextPendingStep(context);
        if (nextStep) {
            return this.sendActionRequest(context, nextStep);
        }

        const finalStatus =
            actionType === 'action_by_admin' ||
            (actionType === 'acknowledged_by_status' && !this.hasStepAssignee(context.actionByAdmin))
                ? 'Completed'
                : 'Approved';
        return this.sendStatusUpdate(context, finalStatus, `${this.getActionLabel(actionType)} approved`);
    }

    private sendActionRequest(context: PurchaseRequisitionNotificationContext, step: WorkflowStep): Observable<any> {
        if (!context.id || !step.code) {
            return of({ status: 'skipped', reason: 'missing_action_recipient' });
        }

        return forkJoin({
            recipient: this.resolveRecipient(step.code),
            requester: context.requestedBy ? this.resolveRecipient(context.requestedBy) : of(null)
        }).pipe(
            switchMap(({ recipient, requester }) => {
                if (!recipient.email) {
                    return of({ status: 'skipped', reason: 'missing_action_email', recipient: step.code });
                }

                const payload: EmailNotificationPayload = {
                    template: 'action_request',
                    to: recipient.email,
                    subject: `[Action Required] ${this.getDocumentEmailTitle(context)}`,
                    data: {
                        approver_name: recipient.name,
                        document_name: this.getDocumentName(context),
                        document_subject: context.documentSubject || '',
                        requested_by: requester?.name || context.requestedBy || '-',
                        request_date: this.formatDisplayDate(context.requestDate),
                        link: this.getActionLink(context.id, step.actionType)
                    }
                };

                return this.purchaseRequisitionService.sendEmailNotification(payload);
            })
        );
    }

    private sendStatusUpdate(
        context: PurchaseRequisitionNotificationContext,
        status: 'Approved' | 'Completed' | 'Rejected',
        remarks: string
    ): Observable<any> {
        if (!context.id || !context.requestedBy) {
            return of({ status: 'skipped', reason: 'missing_requester' });
        }

        return this.resolveRecipient(context.requestedBy).pipe(
            switchMap((recipient) => {
                if (!recipient.email) {
                    return of({ status: 'skipped', reason: 'missing_requester_email', recipient: context.requestedBy });
                }

                const payload: EmailNotificationPayload = {
                    template: 'status_update',
                    to: recipient.email,
                    subject: `[Status Update] ${this.getDocumentEmailTitle(context)} ${status}`,
                    data: {
                        requester_name: recipient.name,
                        document_name: this.getDocumentName(context),
                        document_subject: context.documentSubject || '',
                        status,
                        date: formatDateTimeDisplay(new Date()),
                        remarks,
                        link: this.getViewLink(context.id)
                    }
                };

                return this.purchaseRequisitionService.sendEmailNotification(payload);
            })
        );
    }

    private findNextPendingStep(context: PurchaseRequisitionNotificationContext): WorkflowStep | null {
        for (const step of this.getWorkflowSteps(context)) {
            if (!this.hasStepAssignee(step.code)) {
                continue;
            }

            if (isRejected(step.status)) {
                return null;
            }

            if (isApproved(step.status)) {
                continue;
            }

            if (isPending(step.status)) {
                return step;
            }
        }

        return null;
    }

    private getWorkflowSteps(context: PurchaseRequisitionNotificationContext): WorkflowStep[] {
        return [
            {
                actionType: 'verified_by_is_status',
                code: context.verifiedByIS,
                status: context.verifiedByISStatus,
                label: 'Verify By IS'
            },
            {
                actionType: 'verified_by_status',
                code: context.verifiedBy,
                status: context.verifiedByStatus,
                label: 'Verify'
            },
            {
                actionType: 'approved_by_status',
                code: context.approvedBy,
                status: context.approvedByStatus,
                label: 'Approve'
            },
            {
                actionType: 'approved_by_2_status',
                code: context.approvedBy2,
                status: context.approvedBy2Status,
                label: 'Approve By 2'
            },
            {
                actionType: 'acknowledged_by_status',
                code: context.acknowledgedBy,
                status: context.acknowledgedByStatus,
                label: 'Acknowledge'
            },
            {
                actionType: 'action_by_admin',
                code: context.actionByAdmin,
                status: context.actionByAdminDate ? 'approved' : 'pending',
                label: 'Action By'
            }
        ];
    }

    private normalizeContext(source: any, id?: string | number | null): PurchaseRequisitionNotificationContext {
        const data = source?.data && typeof source.data === 'object' && !Array.isArray(source.data)
            ? source.data
            : source;

        return {
            id: this.readString(data, ['id', 'purchase_requisition_id']) ?? this.toNullableString(id),
            documentNumber: this.readString(data, ['prNo', 'pr_no']),
            documentSubject: this.readString(data, ['subject', 'documentSubject', 'document_subject']),
            requestedBy: this.readString(data, ['requestedBy', 'requested_by', 'create_by', 'createdBy', 'created_by']),
            requestDate: this.readValue(data, ['requestedDate', 'requested_date', 'date', 'created_at', 'createdAt']) as string | Date | null,
            verifiedByIS: this.readString(data, ['verifiedByIS', 'verifiedByIs', 'verified_by_is']),
            verifiedByISStatus: this.readString(data, ['verifiedByISStatus', 'verifiedByIsStatus', 'verified_by_is_status']),
            verifiedBy: this.readString(data, ['verifiedBy', 'verified_by']),
            verifiedByStatus: this.readString(data, ['verifiedByStatus', 'verified_by_status']),
            approvedBy: this.readString(data, ['approvedBy', 'approved_by']),
            approvedByStatus: this.readString(data, ['approvedByStatus', 'approved_by_status']),
            approvedBy2: this.readString(data, ['approvedBy2', 'approved_by_2']),
            approvedBy2Status: this.readString(data, ['approvedBy2Status', 'approved_by_2_status']),
            acknowledgedBy: this.readString(data, ['acknowledgedBy', 'acknowledged_by']),
            acknowledgedByStatus: this.readString(data, ['acknowledgedByStatus', 'acknowledged_by_status']),
            actionByAdmin: this.readString(data, ['actionByAdmin', 'action_by_admin']),
            actionByAdminDate: this.readString(data, ['actionByAdminDate', 'action_by_admin_date'])
        };
    }

    private applyActionStatus(
        context: PurchaseRequisitionNotificationContext,
        actionType: PurchaseRequisitionActionType,
        status: string
    ): void {
        switch (actionType) {
            case 'verified_by_is_status':
                context.verifiedByISStatus = status;
                break;
            case 'verified_by_status':
                context.verifiedByStatus = status;
                break;
            case 'approved_by_status':
                context.approvedByStatus = status;
                break;
            case 'approved_by_2_status':
                context.approvedBy2Status = status;
                break;
            case 'acknowledged_by_status':
                context.acknowledgedByStatus = status;
                break;
            case 'action_by_admin':
                context.actionByAdminDate = status;
                break;
        }
    }

    private resolveRecipient(ref: string): Observable<NotificationRecipient> {
        return this.employeeService.getEmployeeOptionByReference(ref).pipe(
            map((option) => ({
                code: ref,
                name: this.getEmployeeName(option, ref),
                email: option?.email?.trim() || ''
            }))
        );
    }

    private getEmployeeName(option: EmployeeOption | null, fallback: string): string {
        return option?.displayLabel?.trim()
            || option?.name?.trim()
            || [option?.firstName, option?.lastName].filter(Boolean).join(' ').trim()
            || fallback;
    }

    private getDocumentName(context: PurchaseRequisitionNotificationContext): string {
        const displayId = context.documentNumber || context.id;
        return displayId ? `Purchase Requisition #${displayId}` : 'Purchase Requisition';
    }

    private getDocumentEmailTitle(context: PurchaseRequisitionNotificationContext): string {
        const documentName = this.getDocumentName(context);
        return context.documentSubject
            ? `${documentName} - ${context.documentSubject}`
            : documentName;
    }

    private getActionLabel(actionType: PurchaseRequisitionActionType): string {
        return this.getWorkflowSteps({} as PurchaseRequisitionNotificationContext)
            .find((step) => step.actionType === actionType)?.label || 'Action';
    }

    private getActionLink(id: string, actionType: PurchaseRequisitionActionType): string {
        return this.buildAppLink(`/purchase-requisition/action/${encodeURIComponent(id)}/${actionType}`);
    }

    private getViewLink(id: string): string {
        return this.buildAppLink(`/purchase-requisition/view/${encodeURIComponent(id)}`);
    }

    private buildAppLink(path: string): string {
        const origin = typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : 'https://edms.meinhardt.net';

        return `${origin}${path}`;
    }

    private formatDisplayDate(value: string | Date | null | undefined): string {
        return formatDateDisplay(value);
    }

    private hasStepAssignee(code: string | null | undefined): boolean {
        return code !== null && code !== undefined && String(code).trim() !== '';
    }

    private readString(source: any, keys: string[]): string | null {
        const value = this.readValue(source, keys);
        return this.toNullableString(value);
    }

    private readValue(source: any, keys: string[]): unknown {
        if (!source) {
            return null;
        }

        for (const key of keys) {
            const value = source[key];
            if (value !== null && value !== undefined && String(value).trim() !== '') {
                return value;
            }
        }

        return null;
    }

    private toNullableString(value: unknown): string | null {
        if (value === null || value === undefined) {
            return null;
        }

        const stringValue = String(value).trim();
        return stringValue || null;
    }
}
