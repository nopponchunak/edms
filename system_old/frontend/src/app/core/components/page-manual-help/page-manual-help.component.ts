import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router } from '@angular/router';
import {
    Manual,
    ManualMediaType,
    ManualService,
} from 'app/core/services/manual.service';
import {
    Subject,
    catchError,
    distinctUntilChanged,
    filter,
    map,
    of,
    startWith,
    switchMap,
    takeUntil,
    tap,
} from 'rxjs';
import { ManualViewerDialogComponent } from './manual-viewer-dialog.component';

@Component({
    selector: 'page-manual-help',
    standalone: true,
    imports: [
        CommonModule,
        MatIconModule,
        MatMenuModule,
        MatSnackBarModule,
        MatTooltipModule,
    ],
    template: `
        <ng-container *ngIf="isHelpVisible && visibleManuals.length > 0">
            <button
                type="button"
                class="fixed right-5 top-3 z-50 inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-blue-500 bg-white text-blue-700 shadow-lg ring-1 ring-white transition-colors duration-200 hover:border-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 print:hidden sm:right-6 sm:top-4"
                [disabled]="isHelpLoading"
                [matMenuTriggerFor]="manualMenu"
                [matTooltip]="isHelpLoading ? 'Loading manual' : 'Manual'"
                [matTooltipShowDelay]="500"
                matTooltipPosition="left"
                aria-label="Open user manual menu"
            >
                <mat-icon
                    class="icon-size-5"
                    [svgIcon]="'heroicons_outline:book-open'"
                ></mat-icon>
            </button>

            <mat-menu
                #manualMenu="matMenu"
                xPosition="before"
                yPosition="below"
            >
                <button
                    *ngIf="pdfManuals.length > 0"
                    mat-menu-item
                    type="button"
                    (click)="openManualsByType('pdf')"
                >
                    <mat-icon
                        [svgIcon]="'heroicons_outline:document-text'"
                    ></mat-icon>
                    <span>
                        {{ getManualMenuLabel('PDF Manual', pdfManuals.length) }}
                    </span>
                </button>

                <button
                    *ngIf="videoManuals.length > 0"
                    mat-menu-item
                    type="button"
                    (click)="openManualsByType('video')"
                >
                    <mat-icon
                        [svgIcon]="'heroicons_outline:video-camera'"
                    ></mat-icon>
                    <span>
                        {{
                            getManualMenuLabel(
                                'VDO Manual',
                                videoManuals.length
                            )
                        }}
                    </span>
                </button>

                <button
                    *ngIf="imageManuals.length > 0"
                    mat-menu-item
                    type="button"
                    (click)="openManualsByType('image')"
                >
                    <mat-icon [svgIcon]="'heroicons_outline:photo'"></mat-icon>
                    <span>
                        {{
                            getManualMenuLabel(
                                'Image Manual',
                                imageManuals.length
                            )
                        }}
                    </span>
                </button>
            </mat-menu>
        </ng-container>
    `,
})
export class PageManualHelpComponent implements OnInit, OnDestroy {
    manuals: Manual[] = [];
    currentPath = '/';
    isHelpVisible = false;
    isHelpLoading = false;
    helpLoadError = '';
    private unsubscribeAll = new Subject<void>();

    constructor(
        private router: Router,
        private dialog: MatDialog,
        private snackBar: MatSnackBar,
        private manualService: ManualService
    ) {}

    ngOnInit(): void {
        this.router.events
            .pipe(
                filter((event) => event instanceof NavigationEnd),
                startWith(null),
                map(() => this.manualService.normalizePath(this.router.url)),
                distinctUntilChanged(),
                tap((path) => {
                    this.currentPath = path;
                    this.manuals = [];
                    this.helpLoadError = '';
                    this.isHelpVisible = false;
                    this.isHelpLoading = this.shouldShowHelpForPath(path);
                }),
                switchMap((path) => {
                    if (!this.shouldShowHelpForPath(path)) {
                        return of({
                            path,
                            errorMessage: '',
                            manuals: [] as Manual[],
                        });
                    }

                    return this.manualService.getByPathWithFallback(path).pipe(
                        map((manuals) => ({
                            path,
                            errorMessage: '',
                            manuals,
                        })),
                        catchError((error) =>
                            of({
                                path,
                                errorMessage: this.getErrorMessage(error),
                                manuals: [] as Manual[],
                            })
                        )
                    );
                }),
                takeUntil(this.unsubscribeAll)
            )
            .subscribe(({ path, manuals, errorMessage }) => {
                if (path !== this.currentPath) {
                    return;
                }

                this.isHelpLoading = false;
                this.helpLoadError = errorMessage;
                this.manuals = manuals.filter(
                    (manual) => manual.status !== 'inactive'
                );
                this.isHelpVisible =
                    this.shouldShowHelpForPath(path) &&
                    this.visibleManuals.length > 0;
            });
    }

    ngOnDestroy(): void {
        this.unsubscribeAll.next();
        this.unsubscribeAll.complete();
    }

    get visibleManuals(): Manual[] {
        return this.manuals.filter(
            (manual) =>
                this.manualService.getManualMediaType(manual) !== 'unsupported'
        );
    }

    get pdfManuals(): Manual[] {
        return this.getManualsByType('pdf');
    }

    get videoManuals(): Manual[] {
        return this.getManualsByType('video');
    }

    get imageManuals(): Manual[] {
        return this.getManualsByType('image');
    }

    openManualsByType(mediaType: ManualMediaType): void {
        this.openManualGroup(this.getManualsByType(mediaType));
    }

    getManualMenuLabel(label: string, count: number): string {
        return count > 1 ? `${label} (${count})` : label;
    }

    private getManualsByType(mediaType: ManualMediaType): Manual[] {
        return this.manuals.filter((manual) =>
            this.manualService.isManualMediaType(manual, mediaType)
        );
    }

    private openManualGroup(manuals: Manual[]): void {
        if (!this.isHelpVisible || this.isHelpLoading) {
            return;
        }

        if (this.helpLoadError) {
            this.snackBar.open(this.helpLoadError, 'Close', {
                duration: 4000,
            });
            return;
        }

        if (manuals.length === 0) {
            return;
        }

        this.dialog.open(ManualViewerDialogComponent, {
            data: { manuals },
            width: 'min(1120px, 94vw)',
            maxWidth: '94vw',
            maxHeight: '92vh',
            panelClass: 'manual-viewer-dialog-panel',
        });
    }

    private shouldShowHelpForPath(path: string): boolean {
        return !this.isAuthPath(path);
    }

    private isAuthPath(path: string): boolean {
        return [
            '/sign-in',
            '/sign-up',
            '/forgot-password',
            '/reset-password',
            '/login-admin',
            '/sign-out',
        ].some((authPath) => path.startsWith(authPath));
    }

    private getErrorMessage(error: any): string {
        return error?.error?.message || 'Unable to load manual';
    }
}
