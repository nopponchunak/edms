import { NgClass } from '@angular/common';
import { Component, ViewEncapsulation, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { FuseConfirmationConfig } from '@fuse/services/confirmation/confirmation.types';

@Component({
    selector: 'fuse-confirmation-dialog',
    templateUrl: './dialog.component.html',
    styles: [
        `
            .fuse-confirmation-dialog-panel {
                @screen md {
                    @apply w-128;
                }

                .mat-mdc-dialog-container {
                    border-radius: 16px !important;
                    overflow: hidden !important;

                    .mat-mdc-dialog-inner-container {
                        border-radius: 16px !important;
                        overflow: hidden !important;
                    }

                    .mdc-dialog__surface {
                        padding: 0 !important;
                        border-radius: 16px !important;
                        overflow: hidden !important;
                    }
                }
            }

            button.delete-button {
                background-color: #dc2626 !important;
                color: white !important;
            }

            button.delete-button:hover {
                background-color: #b91c1c !important;
            }

            button.delete-button.mat-mdc-unelevated-button:not(:disabled),
            button.delete-button.mat-mdc-flat-button:not(:disabled) {
                background-color: #dc2626 !important;
                --mdc-filled-button-container-color: #dc2626 !important;
                --mdc-filled-button-label-text-color: white !important;
            }

            button.delete-button.mat-mdc-unelevated-button:not(:disabled):hover,
            button.delete-button.mat-mdc-flat-button:not(:disabled):hover {
                background-color: #b91c1c !important;
                --mdc-filled-button-container-color: #b91c1c !important;
            }

            .fuse-confirmation-dialog-panel
                button.mat-mdc-unelevated-button.mat-primary:not(:disabled):not(
                    .delete-button
                ),
            .fuse-confirmation-dialog-panel
                button.mat-mdc-flat-button.mat-primary:not(:disabled):not(
                    .delete-button
                ) {
                background-color: var(--fuse-primary, #4f46e5) !important;
                color: var(--fuse-on-primary, #ffffff) !important;
                --mdc-filled-button-container-color: var(
                    --fuse-primary,
                    #4f46e5
                ) !important;
                --mdc-filled-button-label-text-color: var(
                    --fuse-on-primary,
                    #ffffff
                ) !important;
            }

            .fuse-confirmation-dialog-panel
                button.mat-mdc-unelevated-button.mat-accent:not(:disabled):not(
                    .delete-button
                ),
            .fuse-confirmation-dialog-panel
                button.mat-mdc-flat-button.mat-accent:not(:disabled):not(
                    .delete-button
                ) {
                background-color: var(--fuse-accent, #334155) !important;
                color: var(--fuse-on-accent, #ffffff) !important;
                --mdc-filled-button-container-color: var(
                    --fuse-accent,
                    #334155
                ) !important;
                --mdc-filled-button-label-text-color: var(
                    --fuse-on-accent,
                    #ffffff
                ) !important;
            }

            .fuse-confirmation-dialog-panel
                button.mat-mdc-unelevated-button.mat-warn:not(:disabled):not(
                    .delete-button
                ),
            .fuse-confirmation-dialog-panel
                button.mat-mdc-flat-button.mat-warn:not(:disabled):not(
                    .delete-button
                ) {
                background-color: var(--fuse-warn, #dc2626) !important;
                color: var(--fuse-on-warn, #ffffff) !important;
                --mdc-filled-button-container-color: var(
                    --fuse-warn,
                    #dc2626
                ) !important;
                --mdc-filled-button-label-text-color: var(
                    --fuse-on-warn,
                    #ffffff
                ) !important;
            }
        `,
    ],
    encapsulation: ViewEncapsulation.None,
    imports: [MatButtonModule, MatDialogModule, MatIconModule, NgClass],
})
export class FuseConfirmationDialogComponent {
    data: FuseConfirmationConfig = inject(MAT_DIALOG_DATA);

    isDeleteAction(): boolean {
        const label = this.data.actions?.confirm?.label?.toLowerCase() || '';
        const title = this.data.title?.toLowerCase() || '';
        return label.includes('delete') || title.includes('delete');
    }
}
