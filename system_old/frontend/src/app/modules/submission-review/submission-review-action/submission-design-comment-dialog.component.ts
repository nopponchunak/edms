import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { finalize, of, switchMap } from 'rxjs';
import { ApiConfig } from 'app/core/config/api.config';
import { AuthService } from 'app/core/services/auth.service';
import {
  DiscussionAttachment,
  DiscussionParticipant,
  DiscussionReply,
  DiscussionTopic,
  ProjectReviewDiscussionService,
  ProjectReviewDiscussionType,
} from 'app/core/services/project-review-discussion.service';

export interface CommentReply {
  id: number;
  author: string;
  authorRole: 'reviewer' | 'team';
  workflowRole?: string | null;
  date: string;
  message: string;
  attachments?: DiscussionAttachment[];
}

export interface DetailedComment {
  id: number;
  date: string;
  author: string;
  comment: string;
  attachments: DiscussionAttachment[];
  replies: CommentReply[];
  status: 'Open' | 'Resolved' | 'Pending';
  expanded?: boolean;
  statusKey?: 'open' | 'pending' | 'resolved';
  topicNo?: number;
  workflowRole?: string | null;
}

@Component({
  selector: 'app-submission-design-comment-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatChipsModule,
    MatTooltipModule,
    MatMenuModule,
    MatSnackBarModule,
    MatProgressSpinnerModule
  ],
  template: `
    <div class="flex flex-col h-full w-full overflow-hidden bg-white font-sans">
      <!-- Header -->
      <div class="flex items-center justify-between p-4 px-6 border-b shrink-0 bg-white">
        <div class="flex items-center gap-3">
          <mat-icon class="text-blue-600 text-2xl">forum</mat-icon>
          <h1 class="text-xl font-bold text-gray-900 m-0">Detailed Comments</h1>
        </div>
        <button mat-icon-button (click)="onClose()" class="text-gray-400 hover:text-gray-600">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <!-- Content Area -->
      <div class="flex-1 relative flex flex-col min-h-0 bg-slate-50/20">
        <!-- Scrollable Content -->
        <div class="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
          <div *ngIf="loading" class="flex items-center justify-center py-16">
            <mat-spinner diameter="42"></mat-spinner>
          </div>

          <div *ngIf="!loading" class="space-y-6 pb-24">
             <div *ngIf="!comments.length" class="bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center text-slate-500">
                No discussion topics yet.
             </div>

             <div *ngFor="let item of comments; let i = index" class="topic-card bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
                
                <!-- Topic Header with Operations -->
                <div class="p-4 px-6 border-b border-gray-50 flex items-center justify-between bg-white text-gray-900">
                  <div class="flex items-center gap-4">
                     <span class="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">{{ item.topicNo || i + 1 }}</span>
                     <div class="flex flex-col">
                       <span class="font-bold text-base leading-none mb-1">{{ item.author }}</span>
                       <span class="text-xs text-gray-400 font-medium">{{ item.date }}</span>
                     </div>
                  </div>
                  
                  <div class="flex items-center gap-3">
                    <span [class]="getStatusClass(item.status)">{{ item.status }}</span>
                    
                    <!-- Managed Menu (The 3 dots) -->
                    <button *ngIf="canManageTopic()"
                            mat-icon-button
                            [matMenuTriggerFor]="topicMenu"
                            class="text-gray-400 hover:text-gray-600 scale-90">
                      <mat-icon>more_vert</mat-icon>
                    </button>
                    
                    <mat-menu #topicMenu="matMenu" xPosition="before" class="rounded-xl overflow-hidden shadow-xl border border-gray-100">
                      <button mat-menu-item (click)="editTopic(item)">
                        <mat-icon class="text-blue-500">edit</mat-icon>
                        <span class="font-medium text-gray-700">Edit Observation</span>
                      </button>
                      <button mat-menu-item [matMenuTriggerFor]="statusSubMenu">
                        <mat-icon class="text-amber-500">sync</mat-icon>
                        <span class="font-medium text-gray-700">Change Status</span>
                      </button>
                      <mat-divider></mat-divider>
                      <button mat-menu-item (click)="deleteTopic(item)" class="text-red-500">
                        <mat-icon class="text-red-500">delete_outline</mat-icon>
                        <span class="font-bold">Delete Topic</span>
                      </button>
                    </mat-menu>

                    <!-- Status Sub-menu -->
                    <mat-menu #statusSubMenu="matMenu" class="rounded-xl overflow-hidden shadow-xl">
                      <button mat-menu-item (click)="updateStatus(item, 'Open')" [disabled]="item.status === 'Open'">
                        <div class="flex items-center gap-2">
                           <span class="w-2 h-2 rounded-full bg-amber-500"></span> 
                           <span>Open</span>
                        </div>
                      </button>
                      <button mat-menu-item (click)="updateStatus(item, 'Pending')" [disabled]="item.status === 'Pending'">
                        <div class="flex items-center gap-2">
                           <span class="w-2 h-2 rounded-full bg-blue-500"></span> 
                           <span>Pending</span>
                        </div>
                      </button>
                      <button mat-menu-item (click)="updateStatus(item, 'Resolved')" [disabled]="item.status === 'Resolved'">
                        <div class="flex items-center gap-2">
                           <span class="w-2 h-2 rounded-full bg-emerald-500"></span> 
                           <span>Resolved</span>
                        </div>
                      </button>
                    </mat-menu>
                  </div>
                </div>

                <!-- Topic Body -->
                <div class="p-6 md:p-8">
                  <p class="text-gray-800 text-base leading-relaxed mb-6">{{ item.comment }}</p>
                  
                  <div *ngIf="item.attachments.length" class="flex flex-wrap gap-3 mb-8">
                    <a *ngFor="let attachment of item.attachments"
                       [href]="attachment.path"
                       target="_blank"
                       rel="noopener noreferrer"
                       class="flex items-center p-3 px-4 bg-blue-50/50 border border-blue-100 rounded-xl w-fit text-sm text-blue-600 hover:bg-blue-50 transition-colors">
                      <mat-icon class="mr-2">{{ attachment.type === 'link' ? 'link' : 'insert_drive_file' }}</mat-icon>
                      {{ attachment.name }}
                    </a>
                  </div>

                  <!-- Discussion Thread -->
                  <div *ngIf="item.replies.length > 0" class="space-y-4 mb-8 pl-6 border-l-2 border-slate-100 ml-2">
                    <div *ngIf="item.replies.length > 1 && !item.expanded" class="flex justify-start py-2">
                       <button (click)="item.expanded = true" class="text-sm font-bold text-blue-500 hover:text-blue-700 underline underline-offset-4 decoration-2 flex items-center gap-2 cursor-pointer bg-transparent border-none p-0 whitespace-nowrap">
                          <mat-icon class="text-base h-auto w-auto">history</mat-icon> View {{ item.replies.length - 1 }} previous messages...
                       </button>
                    </div>

                    <div *ngFor="let reply of (item.expanded ? item.replies : [item.replies[item.replies.length - 1]])" class="animate-in fade-in duration-300">
                      <div [class]="'p-5 rounded-2xl border transition-all ' + (reply.authorRole === 'reviewer' ? 'bg-blue-50/50 border-blue-100 mr-2 md:mr-12' : 'bg-emerald-50/50 border-emerald-100 ml-2 md:ml-12')">
                        <div class="flex items-center gap-3 mb-2">
                          <div [class]="'w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold ' + (reply.authorRole === 'reviewer' ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white')">
                            {{ reply.authorRole === 'reviewer' ? 'R' : 'T' }}
                          </div>
                          <span [class]="'font-bold text-sm ' + (reply.authorRole === 'reviewer' ? 'text-blue-800' : 'text-emerald-800')">{{ reply.author }}</span>
                          <span class="text-[11px] text-gray-400 font-medium">{{ reply.date }}</span>
                        </div>
                        <p class="text-gray-700 text-sm leading-relaxed">{{ reply.message }}</p>
                        <div *ngIf="reply.attachments?.length" class="flex flex-wrap gap-2 mt-3">
                          <a *ngFor="let attachment of reply.attachments"
                             [href]="attachment.path"
                             target="_blank"
                             rel="noopener noreferrer"
                             [class]="'inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs border ' + (reply.authorRole === 'reviewer' ? 'border-blue-200 text-blue-700 bg-white/70' : 'border-emerald-200 text-emerald-700 bg-white/70')">
                            <mat-icon class="!text-base !w-4 !h-4">{{ attachment.type === 'link' ? 'link' : 'attach_file' }}</mat-icon>
                            {{ attachment.name }}
                          </a>
                        </div>
                      </div>
                    </div>

                    <div *ngIf="item.expanded" class="flex justify-start py-2">
                       <button (click)="item.expanded = false" class="text-xs font-bold text-gray-400 hover:text-gray-600 uppercase tracking-widest p-0 cursor-pointer bg-transparent border-none">Hide older messages</button>
                    </div>
                  </div>

                  <!-- Inline Reply with Attachments -->
                  <div *ngIf="!isReadOnlyMode()" class="flex flex-col gap-3 bg-slate-50 p-4 rounded-3xl border border-slate-200 focus-within:border-blue-300 focus-within:bg-white transition-all shadow-inner">
                    <div class="flex items-center gap-4">
                      <input
                        type="text"
                        [(ngModel)]="replyDrafts[item.id].message"
                        [ngModelOptions]="{ standalone: true }"
                        [placeholder]="canReply() ? 'Write a response...' : 'Only Signed By TL, DL, or Responded By can reply...'"
                        [disabled]="!canReply()"
                        class="flex-1 bg-transparent border-none outline-none text-sm text-gray-800 py-2">
                      
                      <!-- Hidden File Input -->
                      <input type="file" #replyFileInput class="hidden" multiple (change)="onReplyFilesSelected(item.id, $event)" [disabled]="!canReply()">

                      <!-- Action Buttons -->
                      <div class="flex items-center gap-1 border-l pl-3 border-slate-200">
                        <button mat-icon-button class="text-slate-500 scale-90" matTooltip="Attach File" (click)="replyFileInput.click()" [disabled]="!canReply()">
                          <mat-icon>attach_file</mat-icon>
                        </button>
                        <button mat-icon-button class="text-slate-500 scale-90" matTooltip="Link Local Drive" (click)="replyLinkInput.focus()" [disabled]="!canReply()">
                          <mat-icon>link</mat-icon>
                        </button>
                        <button
                          mat-flat-button
                          color="primary"
                          class="rounded-full !min-w-0 !px-5 h-10 shadow-md ml-2"
                          [disabled]="busyTopicIds.has(item.id) || !canReply()"
                          (click)="sendReply(item)">
                          <mat-icon class="mr-1">send</mat-icon> Send
                        </button>
                      </div>
                    </div>
                    
                    <!-- Quick Link Input -->
                    <div class="flex items-center px-3 py-1 bg-white/50 rounded-lg border border-dashed border-slate-200 text-xs focus-within:border-blue-400 group">
                      <mat-icon class="text-slate-400 text-sm mr-2 h-auto w-auto group-focus-within:text-blue-500 transition-colors">folder_open</mat-icon>
                      <input
                        #replyLinkInput
                        type="text"
                        [(ngModel)]="replyDrafts[item.id].link"
                        [ngModelOptions]="{ standalone: true }"
                        [disabled]="!canReply()"
                        placeholder="Paste local drive path or link here..."
                        class="flex-1 bg-transparent border-none outline-none text-slate-500 italic py-1">
                    </div>
                    <div *ngIf="replyDrafts[item.id].files.length" class="text-xs text-slate-500">
                      {{ replyDrafts[item.id].files.length }} file(s) selected
                    </div>
                  </div>
                </div>
             </div>

             <!-- New Form at Bottom with File/Link Upload -->
             <div *ngIf="showAddForm" id="newObservationForm" class="bg-white p-6 md:p-8 rounded-2xl border-2 border-blue-200 shadow-xl animate-in slide-in-from-bottom-4 duration-500">
                <h3 class="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                   <mat-icon class="text-blue-600">add_task</mat-icon> New Observation Topic
                </h3>
                
                <div class="space-y-4">
                  <mat-form-field appearance="outline" class="w-full no-bottom-padding">
                      <mat-label>Describe the concern or requirement</mat-label>
                      <textarea matInput rows="4" [(ngModel)]="newTopicMessage" [ngModelOptions]="{ standalone: true }" placeholder="Enter details here..."></textarea>
                  </mat-form-field>

                  <!-- Attachments Row -->
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Hidden File Input for New Topic -->
                    <input type="file" #topicFileInput class="hidden" multiple (change)="onTopicFilesSelected($event)">
                    
                    <div class="p-4 border border-dashed border-blue-200 rounded-xl bg-blue-50/20 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-100/50 transition-all border-spacing-2" (click)="topicFileInput.click()">
                      <mat-icon class="text-blue-400 mb-1">cloud_upload</mat-icon>
                      <span class="text-blue-500 text-xs font-bold font-sans">Click to Upload Documents</span>
                      <span class="text-[10px] text-gray-400 mt-1">PDF, DOCX, ZIP, IMAGES</span>
                    </div>

                    <div class="p-4 border border-blue-100 rounded-xl bg-slate-50 flex flex-col justify-between focus-within:bg-white focus-within:border-blue-300 transition-all">
                      <div class="flex items-center gap-2 mb-2 pointer-events-none">
                        <mat-icon class="text-gray-400 text-base">link</mat-icon>
                        <span class="text-xs font-bold text-gray-600">Local Drive / Server Link</span>
                      </div>
                      <input type="text" [(ngModel)]="newTopicLink" [ngModelOptions]="{ standalone: true }" placeholder="e.g. \\\\server\\share\\project\\file.pdf" class="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-400 transition-all shadow-sm">
                    </div>
                  </div>
                  <div *ngIf="newTopicFiles.length" class="text-xs text-slate-500">
                    {{ newTopicFiles.length }} file(s) selected
                  </div>
                </div>

                <div class="flex justify-end gap-3 mt-8">
                  <button mat-button class="px-6 h-11 text-gray-400 font-bold" (click)="showAddForm = false">Cancel</button>
                  <button mat-raised-button color="primary" class="rounded-xl px-12 h-11 font-bold shadow-lg shadow-blue-200" [disabled]="submitting" (click)="saveNewComment()">Post New Topic</button>
                </div>
             </div>
          </div>
        </div>

        <!-- Sticky FAB (Solid & High Visibility) -->
        <div class="absolute bottom-8 right-8 z-30 pointer-events-none">
          <button *ngIf="!showAddForm && canCreateTopic()" 
                  mat-fab 
                  class="!bg-blue-600 !text-white shadow-[0_8px_30px_rgb(0,0,0,0.2)] hover:scale-110 transition-all pointer-events-auto w-14 h-14"
                  (click)="toggleAddForm()" 
                  matTooltip="Post New Topic">
            <mat-icon class="text-3xl font-bold">add</mat-icon>
          </button>
        </div>
      </div>

      <!-- Footer -->
      <div class="p-4 border-t flex justify-end items-center bg-white shrink-0">
        <button mat-stroked-button (click)="onClose()" class="rounded-xl px-12 h-11 border-2 text-base font-bold">Close</button>
      </div>
    </div>
  `,
  styles: [`
    .no-bottom-padding ::ng-deep .mat-form-field-wrapper {
      padding-bottom: 0;
    }
    .topic-card {
      transition: all 0.3s ease;
    }
    .topic-card:hover {
      box-shadow: 0 10px 30px -10px rgba(0,0,0,0.1);
      transform: translateY(-2px);
    }
  `]
})
export class SubmissionDesignCommentDialogComponent implements OnInit {
  private readonly creatorWorkflowRoles = ['signed_by_tl', 'signed_by_tl2', 'signed_by_t_l', 'signed_by_t_l2'];
  private readonly replyWorkflowRoles = ['responded_by', ...this.creatorWorkflowRoles];
  comments: DetailedComment[] = [];
  loading = false;
  submitting = false;
  showAddForm = false;
  participants: DiscussionParticipant[] = [];
  newTopicMessage = '';
  newTopicLink = '';
  newTopicFiles: File[] = [];
  replyDrafts: Record<number, { message: string; link: string; files: File[] }> = {};
  busyTopicIds = new Set<number>();

  constructor(
    public dialogRef: MatDialogRef<SubmissionDesignCommentDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private discussionService: ProjectReviewDiscussionService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private apiConfig: ApiConfig
  ) {}

  ngOnInit(): void {
    this.participants = Array.isArray(this.data?.participants)
      ? this.data.participants
      : [];
    this.loadComments();
  }

  onClose(): void {
    this.dialogRef.close();
  }

  toggleAddForm(): void {
    if (!this.canCreateTopic()) {
      this.snackBar.open(this.getCreateTopicDeniedMessage(), 'Close', { duration: 3000 });
      return;
    }

    this.showAddForm = !this.showAddForm;
    if (this.showAddForm) {
      setTimeout(() => {
        const element = document.getElementById('newObservationForm');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      }, 100);
    }
  }

  saveNewComment(): void {
    if (!this.canCreateTopic()) {
      this.snackBar.open(this.getCreateTopicDeniedMessage(), 'Close', { duration: 3000 });
      return;
    }

    const message = this.newTopicMessage.trim();
    if (!message) {
      this.snackBar.open('Please enter comment details.', 'Close', { duration: 2500 });
      return;
    }

    this.submitting = true;

    this.prepareAttachments(this.newTopicFiles, this.newTopicLink)
      .pipe(
        switchMap((attachments) =>
          this.discussionService.createTopic(this.getReviewType(), this.data.recordId, {
            message,
            status: 'open',
            attachments,
            ...this.getTopicActor(),
          })
        ),
        finalize(() => (this.submitting = false))
      )
      .subscribe({
        next: () => {
          this.resetNewTopicForm();
          this.showAddForm = false;
          this.loadComments();
        },
        error: (error) => {
          console.error('Failed to create topic', error);
          this.snackBar.open('Failed to post new topic.', 'Close', { duration: 3000 });
        }
      });
  }

  editTopic(item: DetailedComment): void {
    if (!this.canManageTopic()) {
      this.snackBar.open('Only Signed By TL or DL can manage a topic.', 'Close', { duration: 3000 });
      return;
    }

    const nextMessage = window.prompt('Edit observation', item.comment);
    if (!nextMessage || nextMessage.trim() === item.comment) {
      return;
    }

    this.busyTopicIds.add(item.id);
    this.discussionService
      .updateTopic(item.id, { message: nextMessage.trim() })
      .pipe(finalize(() => this.busyTopicIds.delete(item.id)))
      .subscribe({
        next: () => this.loadComments(),
        error: (error) => {
          console.error('Failed to edit topic', error);
          this.snackBar.open('Failed to update topic.', 'Close', { duration: 3000 });
        }
      });
  }

  updateStatus(item: DetailedComment, newStatus: DetailedComment['status']): void {
    if (!this.canManageTopic()) {
      this.snackBar.open('Only Signed By TL or DL can manage a topic.', 'Close', { duration: 3000 });
      return;
    }

    this.busyTopicIds.add(item.id);
    this.discussionService
      .updateTopic(item.id, { status: newStatus.toLowerCase() })
      .pipe(finalize(() => this.busyTopicIds.delete(item.id)))
      .subscribe({
        next: () => {
          item.status = newStatus;
          item.statusKey = newStatus.toLowerCase() as DetailedComment['statusKey'];
        },
        error: (error) => {
          console.error('Failed to update status', error);
          this.snackBar.open('Failed to update topic status.', 'Close', { duration: 3000 });
        }
      });
  }

  deleteTopic(item: DetailedComment): void {
    if (!this.canManageTopic()) {
      this.snackBar.open('Only Signed By TL or DL can manage a topic.', 'Close', { duration: 3000 });
      return;
    }

    if (!window.confirm('Delete this discussion topic?')) {
      return;
    }

    this.busyTopicIds.add(item.id);
    this.discussionService
      .deleteTopic(item.id)
      .pipe(finalize(() => this.busyTopicIds.delete(item.id)))
      .subscribe({
        next: () => {
          this.comments = this.comments.filter(c => c.id !== item.id);
        },
        error: (error) => {
          console.error('Failed to delete topic', error);
          this.snackBar.open('Failed to delete topic.', 'Close', { duration: 3000 });
        }
      });
  }

  getStatusClass(status: string): string {
    const base = 'px-4 py-1.5 rounded-2xl text-[10px] font-bold uppercase tracking-widest border ';
    if (status === 'Resolved') return base + 'bg-emerald-50 text-emerald-600 border-emerald-100';
    if (status === 'Open') return base + 'bg-amber-50 text-amber-600 border-amber-100';
    if (status === 'Pending') return base + 'bg-blue-50 text-blue-600 border-blue-100';
    return base + 'bg-slate-50 text-slate-500 border-slate-100';
  }

  onTopicFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.newTopicFiles = this.getValidUploadFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  onReplyFilesSelected(topicId: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    this.ensureReplyDraft(topicId).files = this.getValidUploadFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  private getValidUploadFiles(files: File[]): File[] {
    const oversizedFiles = this.apiConfig.getOversizedFiles(files);

    if (oversizedFiles.length > 0) {
      this.snackBar.open(this.apiConfig.getFileSizeExceededMessage(oversizedFiles), 'Close', { duration: 5000 });
    }

    return files.filter(file => this.apiConfig.isFileSizeValid(file.size));
  }

  sendReply(item: DetailedComment): void {
    if (!this.canReply()) {
      this.snackBar.open(this.getReplyDeniedMessage(), 'Close', { duration: 3000 });
      return;
    }

    const draft = this.ensureReplyDraft(item.id);
    const message = draft.message.trim();
    const hasLink = draft.link.trim().length > 0;
    const hasFiles = draft.files.length > 0;

    if (!message && !hasLink && !hasFiles) {
      this.snackBar.open('Please add a reply message or attachment.', 'Close', { duration: 2500 });
      return;
    }

    this.busyTopicIds.add(item.id);
    this.prepareAttachments(draft.files, draft.link)
      .pipe(
        switchMap((attachments) =>
          this.discussionService.createReply(item.id, {
            message: message || 'Attachment shared',
            attachments,
            ...this.getReplyActor(),
          })
        ),
        finalize(() => this.busyTopicIds.delete(item.id))
      )
      .subscribe({
        next: () => {
          this.replyDrafts[item.id] = { message: '', link: '', files: [] };
          this.loadComments();
        },
        error: (error) => {
          console.error('Failed to post reply', error);
          this.snackBar.open('Failed to post reply.', 'Close', { duration: 3000 });
        }
      });
  }

  private loadComments(): void {
    if (!this.data?.recordId) {
      this.comments = [];
      return;
    }

    this.loading = true;
    this.discussionService
      .listTopics(this.getReviewType(), this.data.recordId)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (topics) => {
          this.comments = topics.map((topic) => this.toDetailedComment(topic));
          this.comments.forEach((item) => this.ensureReplyDraft(item.id));
        },
        error: (error) => {
          console.error('Failed to load discussion topics', error);
          this.snackBar.open('Failed to load discussion topics.', 'Close', { duration: 3000 });
        }
      });
  }

  private toDetailedComment(topic: DiscussionTopic): DetailedComment {
    return {
      id: topic.id,
      topicNo: topic.topic_no,
      date: topic.date,
      author: topic.author,
      comment: topic.comment || topic.message,
      workflowRole: topic.workflow_role,
      attachments: topic.attachments || [],
      replies: (topic.replies || []).map((reply: DiscussionReply) => ({
        id: reply.id,
        author: reply.author,
        authorRole: reply.author_role,
        workflowRole: reply.workflow_role,
        date: reply.date,
        message: reply.message,
        attachments: reply.attachments || [],
      })),
      status: topic.status,
      statusKey: topic.status_key,
      expanded: false,
    };
  }

  private ensureReplyDraft(topicId: number): { message: string; link: string; files: File[] } {
    if (!this.replyDrafts[topicId]) {
      this.replyDrafts[topicId] = { message: '', link: '', files: [] };
    }

    return this.replyDrafts[topicId];
  }

  private prepareAttachments(files: File[], link: string) {
    const trimmedLink = link.trim();

    return (files.length
      ? this.discussionService.uploadFiles(files)
      : of([] as string[])
    ).pipe(
      switchMap((uploadedPaths) => {
        const attachments: DiscussionAttachment[] = uploadedPaths.map((path, index) => ({
          type: 'file',
          name: files[index]?.name || path.split('/').pop() || path,
          path,
        }));

        if (trimmedLink) {
          attachments.push({
            type: 'link',
            name: trimmedLink,
            path: trimmedLink,
          });
        }

        return of(attachments);
      })
    );
  }

  private resetNewTopicForm(): void {
    this.newTopicMessage = '';
    this.newTopicLink = '';
    this.newTopicFiles = [];
  }

  private getTopicActor(): {
    author_code: string;
    author_name: string;
    author_role: 'reviewer' | 'team';
    workflow_role: string;
  } {
    const actor = this.findParticipantByCurrentUser(this.creatorWorkflowRoles);
    const fallbackCurrentUser = this.getFallbackCurrentUser();

    return {
      author_code: actor?.code || fallbackCurrentUser.code,
      author_name: actor?.name || fallbackCurrentUser.name,
      author_role: actor?.authorRole || 'reviewer',
      workflow_role: actor?.workflowRole || 'signed_by_tl',
    };
  }

  private getReplyActor(): {
    author_code: string;
    author_name: string;
    author_role: 'reviewer' | 'team';
    workflow_role: string;
  } {
    const actor = this.findParticipantByCurrentUser(this.replyWorkflowRoles);
    const fallbackCurrentUser = this.getFallbackCurrentUser();

    return {
      author_code: actor?.code || fallbackCurrentUser.code,
      author_name: actor?.name || fallbackCurrentUser.name,
      author_role: actor?.authorRole || 'team',
      workflow_role: actor?.workflowRole || 'responded_by',
    };
  }

  private findParticipantByCurrentUser(workflowRoles: string[]): DiscussionParticipant | undefined {
    const currentCode = this.getFallbackCurrentUser().code.toLowerCase();
    if (!currentCode) {
      return undefined;
    }

    return this.participants.find((participant) =>
      workflowRoles.includes(participant.workflowRole)
      && participant.code.toLowerCase() === currentCode
    );
  }

  canCreateTopic(): boolean {
    if (this.isReadOnlyMode()) {
      return false;
    }
    if (this.isOpenForAllMode()) {
      return true;
    }
    return !!this.findParticipantByCurrentUser(this.creatorWorkflowRoles);
  }

  canReply(): boolean {
    if (this.isReadOnlyMode()) {
      return false;
    }
    if (this.isOpenForAllMode()) {
      return true;
    }
    return !!this.findParticipantByCurrentUser(this.replyWorkflowRoles);
  }

  canManageTopic(): boolean {
    if (this.isReadOnlyMode()) {
      return false;
    }
    return !!this.findParticipantByCurrentUser(this.creatorWorkflowRoles);
  }

  isReadOnlyMode(): boolean {
    return !!this.data?.readOnly;
  }

  private isOpenForAllMode(): boolean {
    return !!this.data?.openForAll;
  }

  private getCreateTopicDeniedMessage(): string {
    return this.isReadOnlyMode()
      ? 'Discussion is read-only after the document is completed.'
      : 'Only Signed By TL or DL can create a topic.';
  }

  private getReplyDeniedMessage(): string {
    return this.isReadOnlyMode()
      ? 'Discussion is read-only after the document is completed.'
      : 'Only Signed By TL, DL, or Responded By can reply.';
  }

  private getFallbackCurrentUser(): { code: string; name: string } {
    const currentUser = this.authService.currentUserValue as any;
    let rawUser: any = {};

    try {
      rawUser = JSON.parse(localStorage.getItem('user_raw_data') || '{}');
    } catch {
      rawUser = {};
    }

    const code = String(
      rawUser?.employeeCode ??
      rawUser?.employee_code ??
      rawUser?.code ??
      currentUser?.code ??
      currentUser?.email ??
      currentUser?.id ??
      ''
    ).trim();

    const name = [
      rawUser?.firstname || currentUser?.firstName,
      rawUser?.lastname || currentUser?.lastName,
    ]
      .filter(Boolean)
      .join(' ')
      .trim() || rawUser?.name || currentUser?.email || code || 'Unknown';

    return { code, name };
  }

  private getReviewType(): ProjectReviewDiscussionType {
    return (this.data?.reviewType || 'submission_review') as ProjectReviewDiscussionType;
  }
}
