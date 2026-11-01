import { inject } from '@angular/core';
import { NavigationService } from 'app/core/navigation/navigation.service';
import { MessagesService } from 'app/layout/common/messages/messages.service';
import { NotificationsService } from 'app/layout/common/notifications/notifications.service';
import { QuickChatService } from 'app/layout/common/quick-chat/quick-chat.service';
import { ShortcutsService } from 'app/layout/common/shortcuts/shortcuts.service';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';
import { forkJoin, of, catchError, switchMap } from 'rxjs';

export const initialDataResolver = () => {
    const messagesService = inject(MessagesService);
    const navigationService = inject(NavigationService);
    const notificationsService = inject(NotificationsService);
    const quickChatService = inject(QuickChatService);
    const shortcutsService = inject(ShortcutsService);
    const permissionService = inject(NavigationPermissionService);

    // First load permissions, then load navigation (which will be filtered by permissions)
    return permissionService.loadPermissions().pipe(
        switchMap(() => {
            // Fork join multiple API endpoint calls to wait all of them to finish
            // Add catchError to handle empty sequences gracefully
            return forkJoin([
                navigationService.get().pipe(catchError(() => of([]))),
                messagesService.getAll().pipe(catchError(() => of([]))),
                notificationsService.getAll().pipe(catchError(() => of([]))),
                quickChatService.getChats().pipe(catchError(() => of([]))),
                shortcutsService.getAll().pipe(catchError(() => of([]))),
            ]);
        }),
        catchError(() => {
            // If permission loading fails, still try to load other data
            return forkJoin([
                navigationService.get().pipe(catchError(() => of([]))),
                messagesService.getAll().pipe(catchError(() => of([]))),
                notificationsService.getAll().pipe(catchError(() => of([]))),
                quickChatService.getChats().pipe(catchError(() => of([]))),
                shortcutsService.getAll().pipe(catchError(() => of([]))),
            ]);
        })
    );
};
