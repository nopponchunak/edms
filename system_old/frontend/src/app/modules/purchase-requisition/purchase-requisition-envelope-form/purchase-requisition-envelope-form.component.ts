import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ApiConfig } from 'app/core/config/api.config';
import { AuthService } from 'app/core/services/auth.service';
import { EmployeeService } from 'app/core/services/employee.service';
import { PurchaseRequisitionNotificationService } from 'app/core/services/purchase-requisition-notification.service';
import { PurchaseRequisitionService } from 'app/core/services/purchase-requisition.service';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { ToastrService } from 'ngx-toastr';

import { PurchaseRequisitionFormComponent } from '../purchase-requisition-form/purchase-requisition-form.component';

@Component({
    selector: 'app-purchase-requisition-envelope-form',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatButtonModule,
        MatCheckboxModule,
        MatDatepickerModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatProgressSpinnerModule,
        MatRadioModule,
        MatSelectModule,
        RouterLink,
        NgxMatSelectSearchModule,
    ],
    templateUrl: './purchase-requisition-envelope-form.component.html',
    styleUrls: ['./purchase-requisition-envelope-form.component.scss'],
})
export class PurchaseRequisitionEnvelopeFormComponent extends PurchaseRequisitionFormComponent {
    private readonly baseRequiredControls = [
        'to',
        'subject',
        'requestedBy',
        'currency',
        'date',
        'reasonsForPurchase',
        'verifiedBy',
        'approvedBy',
        'acknowledgedBy',
        'actionByAdmin',
    ];

    constructor(
        fb: FormBuilder,
        router: Router,
        route: ActivatedRoute,
        dialog: MatDialog,
        http: HttpClient,
        apiConfig: ApiConfig,
        employeeService: EmployeeService,
        purchaseRequisitionService: PurchaseRequisitionService,
        purchaseRequisitionNotificationService: PurchaseRequisitionNotificationService,
        authService: AuthService,
        fuseConfirmationService: FuseConfirmationService,
        toastr: ToastrService
    ) {
        super(
            fb,
            router,
            route,
            dialog,
            http,
            apiConfig,
            employeeService,
            purchaseRequisitionService,
            purchaseRequisitionNotificationService,
            authService,
            fuseConfirmationService,
            toastr
        );
    }

    get requiredFieldTotal(): number {
        return this.requiredControlNames.length + this.requiredItemControlCount;
    }

    get requiredFieldsLeft(): number {
        const missingFormControls = this.requiredControlNames.filter((name) => {
            const control = this.form.get(name);
            return control ? control.invalid : false;
        }).length;

        let missingItemControls = 0;
        this.itemsFormArray.controls.forEach((group) => {
            ['description', 'quantity', 'unitPrice'].forEach((name) => {
                const control = group.get(name);
                if (control?.invalid) {
                    missingItemControls += 1;
                }
            });
        });

        return missingFormControls + missingItemControls;
    }

    get requiredProgressPercent(): number {
        if (!this.requiredFieldTotal) {
            return 100;
        }

        const completed = this.requiredFieldTotal - this.requiredFieldsLeft;
        return Math.max(6, Math.round((completed / this.requiredFieldTotal) * 100));
    }

    get placeholderTableRows(): number[] {
        return Array.from(
            { length: Math.max(0, 11 - this.itemsFormArray.length) },
            (_, index) => index
        );
    }

    focusNextRequiredField(): void {
        const targetName = this.findFirstInvalidRequiredControlName();
        if (!targetName) {
            return;
        }

        const target = document.querySelector(
            `[formControlName="${targetName}"], #control-${targetName}`
        ) as HTMLElement | null;

        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => target?.focus?.(), 250);
    }

    trackByIndex(index: number): number {
        return index;
    }

    private get requiredControlNames(): string[] {
        return this.requiresSecondApprover()
            ? [...this.baseRequiredControls, 'approvedBy2']
            : this.baseRequiredControls;
    }

    private get requiredItemControlCount(): number {
        return this.itemsFormArray.length * 3;
    }

    private findFirstInvalidRequiredControlName(): string | null {
        const controlName = this.requiredControlNames.find((name) => this.form.get(name)?.invalid);
        if (controlName) {
            return controlName;
        }

        for (let index = 0; index < this.itemsFormArray.length; index += 1) {
            const group = this.itemsFormArray.at(index);
            const itemControlName = ['description', 'quantity', 'unitPrice'].find(
                (name) => group.get(name)?.invalid
            );

            if (itemControlName) {
                return itemControlName;
            }
        }

        return null;
    }
}
