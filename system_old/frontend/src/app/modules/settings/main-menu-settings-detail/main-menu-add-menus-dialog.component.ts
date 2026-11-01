import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import {
    AbstractControl,
    FormArray,
    FormBuilder,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

export interface ParentMenuOption {
    id: number;
    label: string;
}

export interface AddMenusDialogData {
    parentOptions: ParentMenuOption[];
}

export interface AddMenuRowResult {
    name: string;
    parent_id: number | null;
    sort_order: number;
}

@Component({
    selector: 'app-main-menu-add-menus-dialog',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        DragDropModule,
        MatDialogModule,
        MatButtonModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatIconModule,
    ],
    template: `
        <h2 mat-dialog-title>Add menus</h2>
        <div mat-dialog-content>
            <div class="text-sm text-gray-600 dark:text-gray-400 pb-2">
                Add one or more menus under this Main menu.
            </div>

            <form [formGroup]="form" class="space-y-3">
                <div
                    formArrayName="rows"
                    class="space-y-3"
                    cdkDropList
                    (cdkDropListDropped)="drop($event)"
                >
                    <div
                        *ngFor="let row of rows.controls; let i = index"
                        [formGroupName]="i"
                        class="grid grid-cols-12 gap-3 items-start border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                        cdkDrag
                    >
                        <div class="col-span-12 md:col-span-1 flex items-center justify-center gap-2 pt-2">
                            <span
                                class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-800 text-xs font-semibold dark:bg-gray-700 dark:text-gray-200"
                                [title]="'Order: ' + getOrderForIndex(i)"
                            >
                                {{ getOrderForIndex(i) }}
                            </span>

                            <button
                                mat-icon-button
                                type="button"
                                cdkDragHandle
                                aria-label="Drag to reorder"
                                [title]="'Drag to reorder'"
                            >
                                <mat-icon>drag_indicator</mat-icon>
                            </button>
                        </div>

                        <mat-form-field appearance="outline" class="col-span-12 md:col-span-6">
                            <mat-label>Menu name</mat-label>
                            <input matInput formControlName="name" />
                            <mat-error *ngIf="row.get('name')?.invalid && row.get('name')?.touched">
                                Name is required
                            </mat-error>
                        </mat-form-field>

                        <mat-form-field appearance="outline" class="col-span-12 md:col-span-4">
                            <mat-label>Parent (optional)</mat-label>
                            <mat-select formControlName="parent_id">
                                <mat-option [value]="null">None</mat-option>
                                <mat-option
                                    *ngFor="let opt of data.parentOptions"
                                    [value]="opt.id"
                                >
                                    {{ opt.label }}
                                </mat-option>
                            </mat-select>
                        </mat-form-field>

                        <div class="col-span-12 md:col-span-1 flex items-center justify-end pt-2">
                            <button
                                mat-icon-button
                                type="button"
                                color="warn"
                                (click)="removeRow(i)"
                                [disabled]="rows.length <= 1"
                                aria-label="Remove row"
                            >
                                <mat-icon>delete</mat-icon>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="pt-2">
                    <button mat-stroked-button type="button" (click)="addRow()">
                        <mat-icon class="mr-2">add</mat-icon>
                        Add row
                    </button>
                </div>
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
                Save
            </button>
        </div>
    `,
})
export class MainMenuAddMenusDialogComponent {
    readonly form = this.fb.group({
        rows: this.fb.array([this.createRow()]),
    });

    constructor(
        private fb: FormBuilder,
        private dialogRef: MatDialogRef<MainMenuAddMenusDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: AddMenusDialogData
    ) {}

    get rows(): FormArray {
        return this.form.controls.rows as FormArray;
    }

    addRow(): void {
        this.rows.push(this.createRow());
    }

    drop(event: CdkDragDrop<AbstractControl[]>): void {
        if (event.previousIndex === event.currentIndex) return;
        moveItemInArray(this.rows.controls, event.previousIndex, event.currentIndex);
        this.rows.updateValueAndValidity();
        this.rows.markAsDirty();
    }

    getOrderForIndex(index: number): number {
        const parentId = (this.rows.at(index)?.value as any)?.parent_id ?? null;
        let count = 0;
        for (let i = 0; i <= index; i++) {
            const pid = (this.rows.at(i)?.value as any)?.parent_id ?? null;
            if (pid === parentId) count++;
        }
        return count;
    }

    removeRow(index: number): void {
        if (this.rows.length <= 1) return;
        this.rows.removeAt(index);
    }

    cancel(): void {
        this.dialogRef.close();
    }

    submit(): void {
        if (this.form.invalid) return;
        const orderByParent = new Map<number | null, number>();
        const rows = (this.form.value.rows ?? [])
            .map((r: any) => {
                const name = (r?.name ?? '').trim();
                const parent_id = (r?.parent_id ?? null) as number | null;
                const next = (orderByParent.get(parent_id) ?? 0) + 1;
                orderByParent.set(parent_id, next);
                return { name, parent_id, sort_order: next } satisfies AddMenuRowResult;
            })
            .filter((r: AddMenuRowResult) => !!r.name);

        if (rows.length === 0) return;
        this.dialogRef.close(rows);
    }

    private createRow(): AbstractControl {
        return this.fb.group({
            name: ['', [Validators.required, Validators.maxLength(255)]],
            parent_id: [null as number | null],
        });
    }
}
