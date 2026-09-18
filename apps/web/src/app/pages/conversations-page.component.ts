import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { ApiService } from '../core/api.service';
import { Conversation, ConversationDetail } from '../core/models';

@Component({
  selector: 'app-conversations-page',
  template: `
    <section class="page-heading compact"><div><p class="eyebrow">Conversations</p><h1>Boîte de réception</h1><p>Consultez les échanges et reprenez la conversation dès qu’un humain apporte plus de valeur.</p></div><div class="live-status"><span></span> {{ conversations().length }} conversation(s)</div></section>
    @if (message()) { <div class="notice" [class.error-notice]="isError()">{{ message() }}</div> }
    <section class="inbox-layout">
      <article class="panel inbox-list-panel">
        <header class="panel-header"><div><span class="section-kicker">File active</span><h2>Conversations</h2><p>{{ conversations().length }} échange(s) dans cet espace</p></div><button class="icon-button" type="button" (click)="load()" aria-label="Actualiser">↻</button></header>
        <div class="filter-pills"><button [class.active]="filter() === 'all'" (click)="filter.set('all')">Toutes</button><button [class.active]="filter() === 'ai'" (click)="filter.set('ai')">IA active</button><button [class.active]="filter() === 'human'" (click)="filter.set('human')">À reprendre</button></div>
        <ul class="full-conversation-list">
          @for (conversation of filteredConversations(); track conversation.id) {
            <li [class.selected]="selected()?.id === conversation.id"><button type="button" (click)="selectConversation(conversation)"><span class="contact-avatar">{{ initials(conversation.customer_name) }}</span><span><strong>{{ conversation.customer_name }}</strong><small>{{ conversation.channel === 'whatsapp' ? 'WhatsApp' : conversation.channel }} · {{ shortDate(conversation.updated_at) }}</small></span><span class="mode-dot" [attr.data-mode]="conversation.mode"></span></button></li>
          } @empty { <li class="empty-row">Aucune conversation reçue.</li> }
        </ul>
      </article>
      <article class="panel conversation-detail">
        @if (selected(); as conversation) {
          <header class="conversation-header"><div class="contact-avatar large">{{ initials(conversation.customer_name) }}</div><div><h2>{{ conversation.customer_name }}</h2><p>WhatsApp · ID {{ conversation.id.slice(0, 8) }}</p></div><span class="status-chip" [class.intervention]="conversation.mode !== 'AI_ACTIVE'">{{ modeLabel(conversation.mode) }}</span></header>
          <div class="conversation-canvas"><div class="conversation-date">Historique</div>@for (item of detail()?.messages ?? []; track item.id) { <div class="message-bubble" [class.inbound]="item.direction === 'inbound'" [class.outbound]="item.direction === 'outbound'"><span>{{ item.sender_type === 'customer' ? 'Client' : item.sender_type === 'ai' ? 'Assistant IA' : 'Équipe' }}</span><p>{{ item.body }}</p><time>{{ shortDate(item.created_at) }}</time></div> } @empty { <div class="empty-state centered"><p>Aucun message enregistré dans cette conversation.</p></div> }</div>
          <footer class="conversation-actions"><div><span>Mode actuel</span><strong>{{ modeLabel(conversation.mode) }}</strong></div>@if (conversation.mode === 'HUMAN_ACTIVE') { <button class="secondary-button" type="button" [disabled]="changing()" (click)="changeMode(conversation, 'return-to-ai')">Rendre à l’IA</button> } @else { <button class="primary-button" type="button" [disabled]="changing()" (click)="changeMode(conversation, 'takeover')">Prendre la main</button> }</footer>
        } @else { <div class="empty-state centered"><span class="empty-icon nav-icon" data-icon="message"></span><h3>Sélectionnez une conversation</h3><p>Le fil et les contrôles apparaîtront ici.</p></div> }
      </article>
      <aside class="panel customer-context">
        <span class="section-kicker">Contexte client</span><h2>{{ detail()?.customer?.name || 'Aucun client' }}</h2><dl><div><dt>Téléphone</dt><dd>{{ detail()?.customer?.phone || 'Non renseigné' }}</dd></div><div><dt>Ville</dt><dd>{{ detail()?.customer?.city || 'Non renseignée' }}</dd></div><div><dt>Gouvernorat</dt><dd>{{ detail()?.customer?.governorate || 'Non renseigné' }}</dd></div><div><dt>Adresse</dt><dd>{{ detail()?.customer?.address || 'Non renseignée' }}</dd></div></dl>
      </aside>
    </section>
  `,
})
export class ConversationsPageComponent {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly conversations = signal<Conversation[]>([]);
  protected readonly selected = signal<Conversation | null>(null);
  protected readonly detail = signal<ConversationDetail | null>(null);
  protected readonly filter = signal<'all' | 'ai' | 'human'>('all');
  protected readonly filteredConversations = computed(() =>
    this.conversations().filter((conversation) =>
      this.filter() === 'all'
        ? true
        : this.filter() === 'ai'
          ? conversation.mode === 'AI_ACTIVE'
          : conversation.mode !== 'AI_ACTIVE',
    ),
  );
  protected readonly changing = signal(false);
  protected readonly message = signal('');
  protected readonly isError = signal(false);
  constructor() { this.load(); }
  protected load(): void { this.api.conversations().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (items) => { this.conversations.set(items); const current = items.find((item) => item.id === this.selected()?.id) ?? items[0] ?? null; if (current) this.selectConversation(current); else { this.selected.set(null); this.detail.set(null); } }, error: (error) => this.setMessage(error.message, true) }); }
  protected selectConversation(conversation: Conversation): void { this.selected.set(conversation); this.api.conversation(conversation.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (detail) => this.detail.set(detail), error: (error) => this.setMessage(error.message, true) }); }
  protected changeMode(conversation: Conversation, action: 'takeover' | 'return-to-ai'): void { this.changing.set(true); this.api.changeConversationMode(conversation, action).pipe(finalize(() => this.changing.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({ next: (updated) => { this.conversations.update((items) => items.map((item) => item.id === updated.id ? { ...updated, customer_name: conversation.customer_name } : item)); const hydrated = { ...updated, customer_name: conversation.customer_name }; this.selected.set(hydrated); this.detail.update((value) => value ? { ...value, conversation: hydrated } : value); this.setMessage(action === 'takeover' ? 'Reprise humaine enregistrée.' : 'Conversation rendue à l’IA.'); }, error: (error) => this.setMessage(error.message, true) }); }
  protected initials(name: string): string { return name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
  protected modeLabel(mode: Conversation['mode']): string { return mode === 'AI_ACTIVE' ? 'IA active' : mode === 'HUMAN_ACTIVE' ? 'Agent actif' : 'IA en pause'; }
  protected shortDate(value: string): string { return new Intl.DateTimeFormat('fr-TN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
  private setMessage(message: string, error = false): void { this.message.set(message); this.isError.set(error); }
}
