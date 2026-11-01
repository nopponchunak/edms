import { DatePipe } from '@angular/common';
import { Component, inject, Input, OnChanges, signal } from '@angular/core';
import { DirectoryService } from '../directory/directory.service';

export interface HistoryEvent {
  title: string;
  username: string | null;
  date: string | null;
  tone: 'done' | 'pending' | 'rejected';
}

@Component({
  selector: 'app-approval-history',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './approval-history.component.html',
  styleUrl: './approval-history.component.scss',
})
export class ApprovalHistoryComponent implements OnChanges {
  private readonly directory = inject(DirectoryService);
  private readonly lookedUp = new Set<string>();

  @Input() events: HistoryEvent[] = [];
  readonly names = signal<Record<string, string>>({});

  ngOnChanges(): void {
    for (const username of new Set(this.events.map((e) => e.username).filter((u): u is string => !!u))) {
      if (this.lookedUp.has(username)) continue;
      this.lookedUp.add(username);
      this.directory.listUsers(username).subscribe({
        next: (res) => {
          const match = res.data.find((u) => u.username.toLowerCase() === username.toLowerCase());
          if (match) this.names.update((n) => ({ ...n, [username]: match.displayName }));
        },
        error: () => undefined,
      });
    }
  }

  nameOf(username: string | null): string {
    return username ? (this.names()[username] ?? username) : '';
  }
}
