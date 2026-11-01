import { Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { FuseLoadingBarComponent } from '@fuse/components/loading-bar';
import {
    FuseNavigationService,
    FuseVerticalNavigationComponent,
} from '@fuse/components/navigation';
import { FuseMediaWatcherService } from '@fuse/services/media-watcher';
import { PageManualHelpComponent } from 'app/core/components/page-manual-help/page-manual-help.component';
import { User } from 'app/core/models/user.model';
import { NavigationService } from 'app/core/navigation/navigation.service';
import { Navigation } from 'app/core/navigation/navigation.types';
import { AuthService } from 'app/core/services/auth.service';
// MessagesComponent import removed
// LanguagesComponent import removed
// QuickChatComponent import removed
// SearchComponent import removed
// ShortcutsComponent import removed
import { UserComponent } from 'app/layout/common/user/user.component';
import { Subject, takeUntil } from 'rxjs';

@Component({
    selector: 'classy-layout',
    templateUrl: './classy.component.html',
    encapsulation: ViewEncapsulation.None,
    styles: [
        `
            fuse-vertical-navigation.legacy-sidebar-active,
            fuse-vertical-navigation.legacy-sidebar-active
                .fuse-vertical-navigation-wrapper,
            fuse-vertical-navigation.legacy-sidebar-active
                .fuse-vertical-navigation-content,
            fuse-vertical-navigation.legacy-sidebar-active
                .fuse-vertical-navigation-aside-wrapper {
                background-color: #0e2e5b !important;
            }

            .legacy-menu-title-switch {
                display: inline-flex;
                flex: 0 0 auto;
                align-items: center;
                width: 36px;
                height: 20px;
                padding: 2px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 9999px;
                background: rgba(255, 255, 255, 0.14);
                box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.25);
                cursor: pointer;
                transition:
                    background-color 150ms ease,
                    border-color 150ms ease,
                    box-shadow 150ms ease;
            }

            .legacy-menu-title-switch:hover {
                background: rgba(255, 255, 255, 0.2);
                border-color: rgba(255, 255, 255, 0.34);
            }

            .legacy-menu-title-switch:focus-visible {
                outline: none;
                box-shadow:
                    0 0 0 2px rgba(255, 255, 255, 0.3),
                    inset 0 1px 2px rgba(0, 0, 0, 0.25);
            }

            .legacy-menu-title-switch__thumb {
                position: relative;
                display: block;
                width: 14px;
                height: 14px;
                border-radius: 9999px;
                background: rgba(255, 255, 255, 0.82);
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
                transform: translateX(0);
                transition:
                    transform 160ms ease,
                    background-color 160ms ease;
            }

            .legacy-menu-title-switch__thumb::after {
                content: '';
                position: absolute;
                left: 4px;
                top: 4px;
                width: 5px;
                height: 3px;
                border-bottom: 1.5px solid #0f172a;
                border-left: 1.5px solid #0f172a;
                opacity: 0;
                transform: rotate(-45deg);
                transition: opacity 120ms ease;
            }

            .legacy-menu-title-switch--checked {
                background: rgba(255, 255, 255, 0.28);
                border-color: rgba(255, 255, 255, 0.38);
            }

            .legacy-menu-title-switch--checked
                .legacy-menu-title-switch__thumb {
                background: #ffffff;
                transform: translateX(14px);
            }

            .legacy-menu-title-switch--checked
                .legacy-menu-title-switch__thumb::after {
                opacity: 1;
            }
        `,
    ],
    imports: [
        FuseLoadingBarComponent,
        FuseVerticalNavigationComponent,
        UserComponent,
        MatIconModule,
        MatButtonModule,
        PageManualHelpComponent,
        // SearchComponent removed
        // ShortcutsComponent removed
        // MessagesComponent removed
        RouterOutlet,
        // QuickChatComponent removed
    ],
})
export class ClassyLayoutComponent implements OnInit, OnDestroy {
    isScreenSmall: boolean;
    navigation: Navigation;
    user: User;
    sidebarUserName = '';
    useLegacyCategoryTitles = false;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    /**
     * Constructor
     */
    constructor(
        private _activatedRoute: ActivatedRoute,
        private _router: Router,
        private _navigationService: NavigationService,
        private _authService: AuthService,
        private _fuseMediaWatcherService: FuseMediaWatcherService,
        private _fuseNavigationService: FuseNavigationService
    ) {}

    // -----------------------------------------------------------------------------------------------------
    // @ Accessors
    // -----------------------------------------------------------------------------------------------------

    /**
     * Getter for current year
     */
    get currentYear(): number {
        return new Date().getFullYear();
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    /**
     * On init
     */
    ngOnInit(): void {
        // Subscribe to navigation data
        this._navigationService.navigation$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((navigation: Navigation) => {
                this.navigation = navigation;
            });

        // Subscribe to the sidebar category title mode
        this._navigationService.useLegacyCategoryTitles$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((enabled: boolean) => {
                this.useLegacyCategoryTitles = enabled;
            });

        // Subscribe to the auth service for current user
        this._authService.currentUser$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User | null) => {
                this.user = user;
                this.sidebarUserName = this.resolveSidebarUserName(user);
            });

        // Subscribe to media changes
        this._fuseMediaWatcherService.onMediaChange$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe(({ matchingAliases }) => {
                // Check if the screen is small
                this.isScreenSmall = !matchingAliases.includes('md');
            });
    }

    /**
     * On destroy
     */
    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Toggle navigation
     *
     * @param name
     */
    toggleNavigation(name: string): void {
        // Get the navigation
        const navigation =
            this._fuseNavigationService.getComponent<FuseVerticalNavigationComponent>(
                name
            );

        if (navigation) {
            // Toggle the opened status
            navigation.toggle();
        }
    }

    /**
     * Set sidebar category titles to legacy names
     */
    setUseLegacyCategoryTitles(enabled: boolean): void {
        this._navigationService.setUseLegacyCategoryTitles(enabled);
    }

    /**
     * Toggle sidebar category title mode
     */
    toggleLegacyCategoryTitles(): void {
        this.setUseLegacyCategoryTitles(!this.useLegacyCategoryTitles);
    }

    private resolveSidebarUserName(user: User | null): string {
        const rawUserName = this.getRawUserNameFromStorage();
        if (rawUserName) {
            return rawUserName;
        }

        const fullName = [user?.firstName, user?.lastName]
            .filter((value) => this.hasText(value))
            .join(' ')
            .trim();

        return fullName || user?.email || '';
    }

    private getRawUserNameFromStorage(): string {
        try {
            const raw = localStorage.getItem('user_raw_data');
            if (!raw) {
                return '';
            }

            const data = JSON.parse(raw);
            return this.readNonEmptyString(data?.name);
        } catch {
            return '';
        }
    }

    private readNonEmptyString(value: unknown): string {
        return typeof value === 'string' && value.trim() ? value.trim() : '';
    }

    private hasText(value: unknown): boolean {
        return typeof value === 'string' && value.trim().length > 0;
    }
}
