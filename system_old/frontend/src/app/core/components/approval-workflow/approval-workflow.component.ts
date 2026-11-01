import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ApprovalWorkflowStep {
    key: string;
    title: string;
    assignee: string;
    date?: string | null;
    status?: string | null;
    comments?: string | null;
    actionLabel?: string;
    actionColor?: 'primary' | 'accent' | 'success';
    showAction?: boolean;
}

@Component({
    selector: 'app-approval-workflow',
    standalone: true,
    imports: [CommonModule, MatIconModule, MatButtonModule],
    templateUrl: './approval-workflow.component.html',
    styleUrls: ['./approval-workflow.component.scss']
})
export class ApprovalWorkflowComponent {
    @Input() title = 'Approval Workflow';
    @Input() subtitle = 'Current approvers and statuses';
    @Input() steps: ApprovalWorkflowStep[] = [];

    @Output() actionClick = new EventEmitter<string>();

    onAction(step: ApprovalWorkflowStep): void {
        this.actionClick.emit(step.key);
    }

    getStatusText(status: string | null | undefined): string {
        if (!status) return 'Pending';
        switch (status.toLowerCase()) {
            case 'submitted':
                return 'Submitted';
            case 'unassigned':
                return 'Not assigned';
            case 'approve':
            case 'approved':
                return 'Approved';
            case 'reject':
            case 'rejected':
                return 'Rejected';
            default:
                return 'Pending';
        }
    }

    getStatusClass(status: string | null | undefined): string {
        if (!status) return 'bg-yellow-100 text-yellow-800';
        switch (status.toLowerCase()) {
            case 'submitted':
                return 'bg-blue-100 text-blue-800';
            case 'unassigned':
                return 'bg-gray-100 text-gray-700';
            case 'approve':
            case 'approved':
                return 'bg-green-100 text-green-800';
            case 'reject':
            case 'rejected':
                return 'bg-red-100 text-red-800';
            default:
                return 'bg-yellow-100 text-yellow-800';
        }
    }

    getIcon(status: string | null | undefined): string {
        if (!status) return 'schedule';
        switch (status.toLowerCase()) {
            case 'submitted':
                return 'check';
            case 'unassigned':
                return 'person_off';
            case 'approve':
            case 'approved':
                return 'check';
            case 'reject':
            case 'rejected':
                return 'close';
            default:
                return 'schedule';
        }
    }

    getIconClass(status: string | null | undefined): string {
        if (!status) return 'text-yellow-600';
        switch (status.toLowerCase()) {
            case 'submitted':
                return 'text-blue-600';
            case 'unassigned':
                return 'text-gray-600';
            case 'approve':
            case 'approved':
                return 'text-green-600';
            case 'reject':
            case 'rejected':
                return 'text-red-600';
            default:
                return 'text-yellow-600';
        }
    }

    getActionButtonClass(step: ApprovalWorkflowStep): string {
        switch (step.actionColor) {
            case 'accent':
                return '!bg-purple-600 !text-white hover:!bg-purple-700';
            case 'success':
                return '!bg-green-600 !text-white hover:!bg-green-700';
            default:
                return '!bg-blue-600 !text-white hover:!bg-blue-700';
        }
    }
}
