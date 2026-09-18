import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Conversation, Integration, Order, Product } from '../core/models';

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink],
  template: `
    <section class="page-heading">
      <div><p class="eyebrow">{{ currentDate }}</p><h1>Bonjour, {{ firstName() }} <span aria-hidden="true">✦</span></h1><p>Votre activité commerciale, claire et prête à être pilotée.</p></div>
      <div class="live-status"><span></span> Système opérationnel</div>
    </section>

    @if (error()) { <div class="notice error-notice" role="alert">{{ error() }}</div> }
    <section class="metric-grid" aria-label="Indicateurs clés">
      @for (metric of metrics(); track metric.label) {
        <article class="metric-card" [attr.data-tone]="metric.tone">
          <div class="metric-top"><span class="metric-icon"><span class="nav-icon" [attr.data-icon]="metric.icon"></span></span><span class="trend">{{ metric.note }}</span></div>
          <p>{{ metric.label }}</p><strong>{{ metric.value }}</strong><small>{{ metric.detail }}</small>
        </article>
      }
    </section>

    <section class="dashboard-grid">
      <article class="panel performance-panel">
        <header class="panel-header"><div><span class="section-kicker">Activité</span><h2>Répartition des commandes</h2><p>État actuel du parcours commercial</p></div><span class="period-select">{{ orders().length }} au total</span></header>
        <div class="chart-summary"><strong>{{ orderValue() }}</strong><span>Valeur enregistrée</span></div>
        <div class="chart" aria-label="Répartition réelle des commandes par état">
          <div class="chart-grid"><i></i><i></i><i></i><i></i></div>
          <div class="bars">@for (bar of pipeline(); track bar.label) { <span [style.height.%]="bar.height" [class.highlight]="bar.count > 0" [attr.title]="bar.label + ' : ' + bar.count"></span> }</div>
        </div>
        <div class="chart-labels">@for (bar of pipeline(); track bar.label) { <span>{{ bar.label }} · {{ bar.count }}</span> }</div>
      </article>

      <article class="panel attention-panel">
        <header class="panel-header"><div><span class="section-kicker">Priorités</span><h2>À traiter maintenant</h2><p>Les actions les plus importantes</p></div><span class="attention-count">{{ priorityCount() }}</span></header>
        <ul class="attention-list">
          <li><span class="task-icon warning"><span class="nav-icon" data-icon="hand"></span></span><span><strong>{{ pausedCount() }} reprise(s) humaine(s)</strong><small>Conversation nécessitant votre expertise</small></span><a routerLink="/inbox">→</a></li>
          <li><span class="task-icon danger"><span class="nav-icon" data-icon="link"></span></span><span><strong>{{ missingIntegrations() }} intégration(s) à connecter</strong><small>Connexions nécessaires au parcours automatisé</small></span><a routerLink="/integrations">→</a></li>
          <li><span class="task-icon info"><span class="nav-icon" data-icon="box"></span></span><span><strong>{{ lowStockCount() }} stock(s) faible(s)</strong><small>Moins de cinq unités disponibles</small></span><a routerLink="/catalog">→</a></li>
        </ul>
      </article>

      <article class="panel conversations-panel">
        <header class="panel-header"><div><span class="section-kicker">Conversations</span><h2>Conversations récentes</h2><p>Dernières interactions enregistrées</p></div><a class="text-action" routerLink="/inbox">Tout afficher →</a></header>
        <ul class="conversation-list">
          @for (conversation of conversations().slice(0, 3); track conversation.id) {
            <li><span class="contact-avatar">{{ initials(conversation.customer_name) }}</span><span class="conversation-copy"><strong>{{ conversation.customer_name }}</strong><small>Conversation {{ conversation.id.slice(0, 8) }}</small></span><span class="status-chip" [class.intervention]="conversation.mode !== 'AI_ACTIVE'">{{ modeLabel(conversation.mode) }}</span></li>
          } @empty { <li class="empty-row">Aucune conversation pour le moment.</li> }
        </ul>
      </article>

      <article class="panel orders-panel">
        <header class="panel-header"><div><span class="section-kicker">Commerce</span><h2>Dernières commandes</h2><p>Dernières opérations enregistrées</p></div><a class="text-action" routerLink="/orders">Voir les commandes →</a></header>
        <div class="order-table" role="table" aria-label="Dernières commandes">
          @for (order of orders().slice(0, 3); track order.id) {
            <div class="order-row" role="row"><strong role="cell">#{{ order.id.slice(0, 8).toUpperCase() }}</strong><span role="cell">{{ order.items[0]?.product_name || 'Commande' }}</span><span role="cell">{{ money(order.total_minor) }}</span><span class="order-state" role="cell">{{ statusLabel(order.status) }}</span></div>
          } @empty { <p class="empty-row">Aucune commande pour le moment.</p> }
        </div>
      </article>
    </section>
  `,
})
export class DashboardPageComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly products = signal<Product[]>([]);
  protected readonly conversations = signal<Conversation[]>([]);
  protected readonly orders = signal<Order[]>([]);
  protected readonly integrations = signal<Integration[]>([]);
  protected readonly error = signal('');
  protected readonly firstName = computed(() => this.auth.user()?.full_name.split(' ')[0] ?? '');
  protected readonly currentDate = new Intl.DateTimeFormat('fr-TN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  protected readonly lowStockCount = computed(() => this.products().flatMap((p) => p.variants).filter((v) => v.available_stock < 5).length);
  protected readonly pausedCount = computed(() => this.conversations().filter((c) => c.mode !== 'AI_ACTIVE').length);
  protected readonly orderValue = computed(() => this.money(this.orders().reduce((total, order) => total + order.total_minor, 0)));
  protected readonly missingIntegrations = computed(() => this.integrations().filter((item) => !item.configured).length);
  protected readonly priorityCount = computed(() => this.pausedCount() + this.lowStockCount() + this.missingIntegrations());
  protected readonly pipeline = computed(() => {
    const groups = [
      { label: 'Confirmées', states: ['CONFIRMED'] },
      { label: 'Préparation', states: ['PREPARING'] },
      { label: 'Prêtes', states: ['READY_FOR_DELIVERY'] },
      { label: 'Livraison', states: ['SENT_TO_DELIVERY', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'] },
    ];
    const maximum = Math.max(1, ...groups.map((group) => this.orders().filter((order) => group.states.includes(order.status)).length));
    return groups.map((group) => {
      const count = this.orders().filter((order) => group.states.includes(order.status)).length;
      return { label: group.label, count, height: count ? Math.max(24, (count / maximum) * 100) : 5 };
    });
  });
  protected readonly metrics = computed(() => [
    { label: 'Conversations', value: String(this.conversations().length), note: 'WhatsApp', detail: `${this.pausedCount()} à reprendre`, tone: 'blue', icon: 'message' },
    { label: 'Commandes actives', value: String(this.orders().length), note: 'Commerce', detail: `${this.orders().filter((o) => o.status === 'CONFIRMED').length} confirmée(s)`, tone: 'teal', icon: 'bag' },
    { label: 'Valeur enregistrée', value: this.orderValue(), note: 'TND', detail: 'Hors encaissement COD', tone: 'violet', icon: 'chart' },
    { label: 'Références catalogue', value: String(this.products().length), note: 'Inventaire', detail: `${this.lowStockCount()} stock(s) faible(s)`, tone: 'amber', icon: 'box' },
  ]);

  constructor() {
    forkJoin({ products: this.api.products(), conversations: this.api.conversations(), orders: this.api.orders(), integrations: this.api.integrations() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ products, conversations, orders, integrations }) => {
          this.products.set(products.items);
          this.conversations.set(conversations);
          this.orders.set(orders);
          this.integrations.set(integrations);
        },
        error: (error) => this.error.set(error.message),
      });
  }

  protected money(value: number): string {
    return new Intl.NumberFormat('fr-TN', { style: 'currency', currency: 'TND', minimumFractionDigits: 3 }).format(value / 1000);
  }
  protected initials(name: string): string { return name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
  protected modeLabel(mode: Conversation['mode']): string { return mode === 'AI_ACTIVE' ? 'IA active' : mode === 'HUMAN_ACTIVE' ? 'Agent actif' : 'À reprendre'; }
  protected statusLabel(status: string): string { return ({ CONFIRMED: 'Confirmée', PREPARING: 'Préparation', READY_FOR_DELIVERY: 'Prête' } as Record<string, string>)[status] ?? status; }
}
