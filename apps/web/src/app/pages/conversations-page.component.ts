import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { ApiService } from '../core/api.service';
import { Conversation } from '../core/models';

@Component({
  selector: 'app-conversations-page',
  template: `
    <section class="page-heading compact"><div><p class="eyebrow">WhatsApp Business</p><h1>Boîte de réception</h1><p>Supervisez l’IA et reprenez la conversation dès qu’un humain apporte plus de valeur.</p></div><div class="live-status"><span></span> Canal prêt pour la configuration</div></section>
    @if (message()) { <div class="notice" [class.error-notice]="isError()">{{ message() }}</div> }
    <section class="inbox-layout">
      <article class="panel inbox-list-panel">
        <header class="panel-header"><div><span class="section-kicker">File active</span><h2>Conversations</h2><p>{{ conversations().length }} échange(s) dans cet espace</p></div><button class="icon-button" type="button" (click)="load()" aria-label="Actualiser">↻</button></header>
        <div class="filter-pills"><button class="active">Toutes</button><button>IA active</button><button>À reprendre</button></div>
        <ul class="full-conversation-list">
          @for (conversation of conversations(); track conversation.id) {
            <li [class.selected]="selected()?.id === conversation.id"><button type="button" (click)="selected.set(conversation)"><span class="contact-avatar">{{ initials(conversation.customer_name) }}</span><span><strong>{{ conversation.customer_name }}</strong><small>{{ conversation.channel === 'whatsapp' ? 'WhatsApp' : conversation.channel }} · {{ shortDate(conversation.updated_at) }}</small></span><span class="mode-dot" [attr.data-mode]="conversation.mode"></span></button></li>
          } @empty { <li class="empty-row">Aucune conversation reçue.</li> }
        </ul>
      </article>
      <article class="panel conversation-detail">
        @if (selected(); as conversation) {
          <header class="conversation-header"><div class="contact-avatar large">{{ initials(conversation.customer_name) }}</div><div><h2>{{ conversation.customer_name }}</h2><p>WhatsApp · ID {{ conversation.id.slice(0, 8) }}</p></div><span class="status-chip" [class.intervention]="conversation.mode !== 'AI_ACTIVE'">{{ modeLabel(conversation.mode) }}</span></header>
          <div class="conversation-canvas"><div class="conversation-date">Aujourd’hui</div><div class="message-bubble inbound"><p>Bonjour, je souhaite connaître la disponibilité de ce produit.</p><time>10:31</time></div><div class="message-bubble outbound"><span>Réponse IA vérifiée</span><p>Je vérifie le prix et le stock exacts pour vous.</p><time>10:31</time></div><div class="conversation-safety"><span class="nav-icon" data-icon="sparkles"></span><p><strong>Les faits commerciaux restent contrôlés.</strong><br />L’IA doit consulter les outils backend avant d’annoncer un prix, un stock ou un suivi.</p></div></div>
          <footer class="conversation-actions"><div><span>Mode actuel</span><strong>{{ modeLabel(conversation.mode) }}</strong></div>@if (conversation.mode === 'HUMAN_ACTIVE') { <button class="secondary-button" type="button" [disabled]="changing()" (click)="changeMode(conversation, 'return-to-ai')">Rendre à l’IA</button> } @else { <button class="primary-button" type="button" [disabled]="changing()" (click)="changeMode(conversation, 'takeover')">Prendre la main</button> }</footer>
        } @else { <div class="empty-state centered"><span class="empty-icon nav-icon" data-icon="message"></span><h3>Sélectionnez une conversation</h3><p>Le fil et les contrôles apparaîtront ici.</p></div> }
      </article>
      <aside class="panel customer-context">
        <span class="section-kicker">Contexte client</span><h2>{{ selected()?.customer_name || 'Aucun client' }}</h2><dl><div><dt>Langue</dt><dd>Français / Derja</dd></div><div><dt>Canal</dt><dd>WhatsApp</dd></div><div><dt>Consentement</dt><dd>À vérifier</dd></div><div><dt>Commande liée</dt><dd>Non associée</dd></div></dl><div class="context-note"><strong>Prochaine étape</strong><p>Connecter les messages persistés et les informations client à ce panneau.</p></div>
      </aside>
    </section>
  `,
})
export class ConversationsPageComponent {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly conversations = signal<Conversation[]>([]);
  protected readonly selected = signal<Conversation | null>(null);
  protected readonly changing = signal(false);
  protected readonly message = signal('');
  protected readonly isError = signal(false);
  constructor() { this.load(); }
  protected load(): void { this.api.conversations().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (items) => { this.conversations.set(items); this.selected.set(items[0] ?? null); }, error: (error) => this.setMessage(error.message, true) }); }
  protected changeMode(conversation: Conversation, action: 'takeover' | 'return-to-ai'): void { this.changing.set(true); this.api.changeConversationMode(conversation, action).pipe(finalize(() => this.changing.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({ next: (updated) => { this.conversations.update((items) => items.map((item) => item.id === updated.id ? updated : item)); this.selected.set(updated); this.setMessage(action === 'takeover' ? 'Reprise humaine enregistrée.' : 'Conversation rendue à l’IA.'); }, error: (error) => this.setMessage(error.message, true) }); }
  protected initials(name: string): string { return name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
  protected modeLabel(mode: Conversation['mode']): string { return mode === 'AI_ACTIVE' ? 'IA active' : mode === 'HUMAN_ACTIVE' ? 'Agent actif' : 'IA en pause'; }
  protected shortDate(value: string): string { return new Intl.DateTimeFormat('fr-TN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
  private setMessage(message: string, error = false): void { this.message.set(message); this.isError.set(error); }
}
