import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../core/api.service';
import { Order } from '../core/models';

@Component({
  selector: 'app-orders-page',
  template: `
    <section class="page-heading compact"><div><p class="eyebrow">Cycle commercial</p><h1>Commandes</h1><p>Suivez les brouillons, confirmations, préparations et remises au transporteur.</p></div><button class="primary-button" type="button" disabled title="La création guidée arrive dans l’étape suivante">+ Nouvelle commande</button></section>
    @if (error()) { <div class="notice error-notice">{{ error() }}</div> }
    <section class="orders-summary">
      <article><span class="nav-icon" data-icon="bag"></span><div><small>Total visible</small><strong>{{ orders().length }}</strong></div></article>
      <article><span class="nav-icon" data-icon="sparkles"></span><div><small>Confirmées</small><strong>{{ count('CONFIRMED') }}</strong></div></article>
      <article><span class="nav-icon" data-icon="box"></span><div><small>À préparer</small><strong>{{ count('PREPARING') }}</strong></div></article>
      <article><span class="nav-icon" data-icon="truck"></span><div><small>Prêtes à livrer</small><strong>{{ count('READY_FOR_DELIVERY') }}</strong></div></article>
    </section>
    <section class="panel data-panel">
      <header class="panel-header"><div><span class="section-kicker">Suivi</span><h2>Flux des commandes</h2><p>Chaque ligne provient de l’API transactionnelle.</p></div><div class="filter-pills"><button class="active">Toutes</button><button>À traiter</button><button>Livraison</button></div></header>
      <div class="responsive-table"><table><thead><tr><th>Référence</th><th>Articles</th><th>État</th><th>Date</th><th>Total</th><th></th></tr></thead><tbody>
        @for (order of orders(); track order.id) { <tr><td><strong>#{{ order.id.slice(0, 8).toUpperCase() }}</strong></td><td><span class="item-stack"><strong>{{ order.items[0]?.product_name || 'Commande' }}</strong><small>{{ order.items.length }} article(s)</small></span></td><td><span class="order-state" [attr.data-status]="order.status">{{ statusLabel(order.status) }}</span></td><td>{{ date(order.created_at) }}</td><td class="money-cell">{{ money(order.total_minor) }}</td><td><button class="row-action" type="button" aria-label="Ouvrir la commande">→</button></td></tr> }
      </tbody></table></div>
      @if (!orders().length) { <div class="empty-state"><span class="empty-icon nav-icon" data-icon="bag"></span><h3>Aucune commande</h3><p>Les commandes préparées depuis une conversation apparaîtront ici.</p></div> }
    </section>
  `,
})
export class OrdersPageComponent {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly orders = signal<Order[]>([]);
  protected readonly error = signal('');
  constructor() { this.api.orders().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (orders) => this.orders.set(orders), error: (error) => this.error.set(error.message) }); }
  protected count(status: string): number { return this.orders().filter((order) => order.status === status).length; }
  protected money(value: number): string { return new Intl.NumberFormat('fr-TN', { style: 'currency', currency: 'TND', minimumFractionDigits: 3 }).format(value / 1000); }
  protected date(value: string): string { return new Intl.DateTimeFormat('fr-TN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)); }
  protected statusLabel(status: string): string { return ({ DRAFT: 'Brouillon', WAITING_CONFIRMATION: 'Confirmation', CONFIRMED: 'Confirmée', PREPARING: 'Préparation', READY_FOR_DELIVERY: 'Prête à livrer', SENT_TO_DELIVERY: 'Transmise', IN_TRANSIT: 'En transit', DELIVERED: 'Livrée' } as Record<string, string>)[status] ?? status; }
}
