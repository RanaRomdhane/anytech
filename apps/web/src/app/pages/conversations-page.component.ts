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
          <div class="conversation-canvas"><div class="conversation-date">Historique</div>@for (item of detail()?.messages ?? []; track item.id) { <div class="message-bubble" [class.inbound]="item.direction === 'inbound'" [class.outbound]="item.direction === 'outbound'"><span>{{ item.sender_type === 'customer' ? 'Client' : item.sender_type === 'ai' ? 'Assistant IA' : 'Équipe' }}</span><p>{{ item.body }}</p><time>{{ shortDate(item.created_at) }} · {{ messageStatus(item.status) }}</time></div> } @empty { <div class="empty-state centered"><p>Aucun message enregistré dans cette conversation.</p></div> }</div>
          <section class="reply-composer">
            <div class="composer-heading"><div><span class="section-kicker">Réponse</span><strong>Préparer un message</strong></div><button class="ai-draft-button" type="button" [disabled]="generating()" (click)="generateDraft(conversation)"><span class="nav-icon" data-icon="sparkles"></span>{{ generating() ? 'Préparation…' : 'Proposer avec l’IA' }}</button></div>
            <textarea rows="4" maxlength="4000" [value]="draft()" (input)="draft.set($any($event.target).value)" placeholder="Écrivez votre réponse ou demandez une proposition à l’assistant."></textarea>
            <div class="composer-footer"><small>Relisez le message avant de l’enregistrer.</small><button class="primary-button" type="button" [disabled]="!draft().trim() || savingDraft()" (click)="saveDraft(conversation)">{{ savingDraft() ? 'Enregistrement…' : 'Enregistrer le message' }}</button></div>
          </section>
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
  protected readonly generating = signal(false);
  protected readonly savingDraft = signal(false);
  protected readonly draft = signal('');
  protected readonly message = signal('');
  protected readonly isError = signal(false);
  private events: EventSource | null = null;
  constructor() {
    this.load();
    this.events = this.api.openEvents();
    this.events.onmessage = (event) => {
      const payload = JSON.parse(event.data) as { type?: string; conversation_id?: string };
      if (payload.type === 'message.created' || payload.type === 'message.updated' || payload.type === 'conversation.updated') {
        this.refreshFromEvent(payload.conversation_id);
      }
    };
    this.destroyRef.onDestroy(() => this.events?.close());
  }
  protected load(): void { this.api.conversations().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (items) => { this.conversations.set(items); const current = items.find((item) => item.id === this.selected()?.id) ?? items[0] ?? null; if (current) this.selectConversation(current); else { this.selected.set(null); this.detail.set(null); } }, error: (error) => this.setMessage(error.message, true) }); }
  protected selectConversation(conversation: Conversation): void { this.selected.set(conversation); this.draft.set(''); this.api.conversation(conversation.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (detail) => this.detail.set(detail), error: (error) => this.setMessage(error.message, true) }); }
  protected generateDraft(conversation: Conversation): void { this.generating.set(true); this.setMessage(''); this.api.createAiDraft(conversation.id).pipe(finalize(() => this.generating.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({ next: (result) => { this.draft.set(result.content); this.setMessage('Proposition prête à être relue.'); }, error: (error) => this.setMessage(error.message, true) }); }
  protected saveDraft(conversation: Conversation): void { const body = this.draft().trim(); if (!body) return; this.savingDraft.set(true); this.api.saveConversationMessage(conversation.id, body).pipe(finalize(() => this.savingDraft.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({ next: (saved) => { this.detail.update((value) => value ? { ...value, messages: [...value.messages, saved] } : value); this.draft.set(''); this.setMessage(saved.status === 'queued' ? 'Message placé dans la file d’envoi.' : 'Message enregistré comme brouillon.'); }, error: (error) => this.setMessage(error.message, true) }); }
  protected changeMode(conversation: Conversation, action: 'takeover' | 'return-to-ai'): void { this.changing.set(true); this.api.changeConversationMode(conversation, action).pipe(finalize(() => this.changing.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({ next: (updated) => { this.conversations.update((items) => items.map((item) => item.id === updated.id ? { ...updated, customer_name: conversation.customer_name } : item)); const hydrated = { ...updated, customer_name: conversation.customer_name }; this.selected.set(hydrated); this.detail.update((value) => value ? { ...value, conversation: hydrated } : value); this.setMessage(action === 'takeover' ? 'Reprise humaine enregistrée.' : 'Conversation rendue à l’IA.'); }, error: (error) => this.setMessage(error.message, true) }); }
  protected initials(name: string): string { return name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
  protected modeLabel(mode: Conversation['mode']): string { return mode === 'AI_ACTIVE' ? 'IA active' : mode === 'HUMAN_ACTIVE' ? 'Agent actif' : 'IA en pause'; }
  protected shortDate(value: string): string { return new Intl.DateTimeFormat('fr-TN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
  protected messageStatus(status: string): string { return ({ received: 'reçu', draft: 'brouillon', queued: 'en attente', sent: 'envoyé', delivered: 'livré', failed: 'échec' } as Record<string, string>)[status] ?? status; }
  private refreshFromEvent(conversationId?: string): void {
    this.api.conversations().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((items) => {
      this.conversations.set(items);
      const selected = items.find((item) => item.id === this.selected()?.id);
      if (selected) this.selected.set(selected);
    });
    const selectedId = this.selected()?.id;
    if (selectedId && (!conversationId || conversationId === selectedId)) {
      this.api.conversation(selectedId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((detail) => this.detail.set(detail));
    }
  }
  private setMessage(message: string, error = false): void { this.message.set(message); this.isError.set(error); }
}
