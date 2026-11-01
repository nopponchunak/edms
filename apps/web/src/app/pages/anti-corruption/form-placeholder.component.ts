import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-form-placeholder',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="placeholder">
      <p class="code">{{ code }}</p>
      <h1>{{ title }}</h1>
      <p>This form is not available yet.</p>
      <a routerLink="/dashboard">← Back to Dashboard</a>
    </div>
  `,
  styles: [`
    .placeholder { max-width:520px; padding:40px 0; color:var(--mh-ink); }
    .code { margin:0 0 4px; color:var(--mh-muted); font-size:12px; font-weight:600; letter-spacing:.08em; }
    h1 { margin:0 0 8px; font-size:22px; }
    p { color:var(--mh-muted); }
    a { color:var(--mh-primary); text-decoration:none; font-size:13px; }
  `],
})
export class FormPlaceholderComponent {
  private readonly data = inject(ActivatedRoute).snapshot.data;
  readonly title = this.data['title'] as string;
  readonly code = this.data['code'] as string;
}
