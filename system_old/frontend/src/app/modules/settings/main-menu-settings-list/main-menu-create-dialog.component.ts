import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
    selector: 'app-main-menu-create-dialog',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatDialogModule,
        MatButtonModule,
        MatFormFieldModule,
        MatInputModule,
    ],
    template: `
        <h2 mat-dialog-title>Create Main menu</h2>
        <div mat-dialog-content>
            <form [formGroup]="form" class="pt-2">
                <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Main menu name</mat-label>
                    <input matInput formControlName="name" placeholder="e.g. Projects" />
                    <mat-error *ngIf="form.controls.name.invalid && form.controls.name.touched">
                        Name is required
                    </mat-error>
                </mat-form-field>
            </form>
        </div>
        <div mat-dialog-actions align="end">
            <button mat-button type="button" (click)="cancel()">Cancel</button>
            <button
                mat-flat-button
                color="primary"
                type="button"
                [disabled]="form.invalid"
                (click)="submit()"
            >
                Create
            </button>
        </div>
    `,
})
export class MainMenuCreateDialogComponent {
    private readonly fb = inject(FormBuilder);
    private readonly dialogRef =
        inject<MatDialogRef<MainMenuCreateDialogComponent>>(MatDialogRef);

    readonly form = this.fb.group({
        name: ['', [Validators.required, Validators.maxLength(255)]],
    });

    cancel(): void {
        this.dialogRef.close();
    }

    submit(): void {
        if (this.form.invalid) return;
        const name = (this.form.value.name ?? '').trim();
        if (!name) return;
        this.dialogRef.close(name);
    }
}

