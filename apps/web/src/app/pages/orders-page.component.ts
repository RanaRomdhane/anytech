import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { Customer, Order, Product } from '../core/models';

@Component({
  selector: 'app-orders-page',
  imports: [ReactiveFormsModule],
  template: `
    <section class="page-heading compact"><div><p class="eyebrow">Cycle commercial</p><h1>Commandes</h1><p>Créez et suivez chaque commande depuis sa préparation jusqu’à la livraison.</p></div><button class="primary-button" type="button" (click)="toggleForm()">{{ showForm() ? 'Fermer' : '+ Nouvelle commande' }}</button></section>
    @if (showForm()) {
      <section class="panel editor-panel">
        <header class="panel-header"><div><span class="section-kicker">Nouvelle commande</span><h2>Préparer un brouillon</h2><p>Sélectionnez un client, une référence et la quantité.</p></div></header>
        <form class="product-form" [formGroup]="form" (ngSubmit)="create()">
          <label>Client<select formControlName="customerId"><option value="">Sans client associé</option>@for (customer of customers(); track customer.id) { <option [value]="customer.id">{{ customer.name }} · {{ customer.phone }}</option> }</select></label>
          <label class="wide-two">Produit et variante<select formControlName="variantId"><option value="" disabled>Sélectionner une référence</option>@for (item of variants(); track item.variant.id) { <option [value]="item.variant.id">{{ item.product.name }} · {{ item.variant.sku }} · {{ money(item.variant.sale_price_minor ?? item.variant.price_minor) }}</option> }</select></label>
          <label>Quantité<input formControlName="quantity" type="number" min="1" step="1" /></label>
          <div class="form-actions wide-field"><button class="secondary-button" type="button" (click)="showForm.set(false)">Annuler</button><button class="primary-button" type="submit" [disabled]="form.invalid || saving()">{{ saving() ? 'Création…' : 'Créer le brouillon' }}</button></div>
        </form>
      </section>
    }
    @if (message()) { <div class="notice" [class.error-notice]="isError()">{{ message() }}</div> }
    <section class="orders-summary">
      <article><span class="nav-icon" data-icon="bag"></span><div><small>Total visible</small><strong>{{ orders().length }}</strong></div></article>
      <article><span class="nav-icon" data-icon="sparkles"></span><div><small>Confirmées</small><strong>{{ count('CONFIRMED') }}</strong></div></article>
      <article><span class="nav-icon" data-icon="box"></span><div><small>À préparer</small><strong>{{ count('PREPARING') }}</strong></div></article>
      <article><span class="nav-icon" data-icon="truck"></span><div><small>Prêtes à livrer</small><strong>{{ count('READY_FOR_DELIVERY') }}</strong></div></article>
    </section>
    <section class="panel data-panel">
      <header class="panel-header"><div><span class="section-kicker">Suivi</span><h2>Flux des commandes</h2><p>{{ filteredOrders().length }} commande(s) affichée(s)</p></div><div class="filter-pills compact-pills"><button [class.active]="filter() === 'all'" (click)="filter.set('all')">Toutes</button><button [class.active]="filter() === 'action'" (click)="filter.set('action')">À traiter</button><button [class.active]="filter() === 'delivery'" (click)="filter.set('delivery')">Livraison</button></div></header>
      <div class="responsive-table"><table><thead><tr><th>Référence</th><th>Articles</th><th>État</th><th>Date</th><th>Total</th></tr></thead><tbody>
        @for (order of filteredOrders(); track order.id) { <tr><td><strong>#{{ order.id.slice(0, 8).toUpperCase() }}</strong></td><td><span class="item-stack"><strong>{{ order.items[0]?.product_name || 'Commande' }}</strong><small>{{ itemCount(order) }} unité(s)</small></span></td><td><span class="order-state" [attr.data-status]="order.status">{{ statusLabel(order.status) }}</span></td><td>{{ date(order.created_at) }}</td><td class="money-cell">{{ money(order.total_minor) }}</td></tr> }
      </tbody></table></div>
      @if (!filteredOrders().length) { <div class="empty-state"><span class="empty-icon nav-icon" data-icon="bag"></span><h3>Aucune commande</h3><p>Créez une commande ou modifiez le filtre sélectionné.</p></div> }
    </section>
  `,
})
export class OrdersPageComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly orders = signal<Order[]>([]);
  protected readonly customers = signal<Customer[]>([]);
  protected readonly products = signal<Product[]>([]);
  protected readonly showForm = signal(false);
  protected readonly saving = signal(false);
  protected readonly message = signal('');
  protected readonly isError = signal(false);
  protected readonly filter = signal<'all' | 'action' | 'delivery'>('all');
  protected readonly form = new FormGroup({
    customerId: new FormControl('', { nonNullable: true }),
    variantId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    quantity: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
  });
  protected readonly variants = computed(() =>
    this.products().flatMap((product) =>
      product.variants.filter((variant) => variant.active).map((variant) => ({ product, variant })),
    ),
  );
  protected readonly filteredOrders = computed(() =>
    this.orders().filter((order) => {
      if (this.filter() === 'all') return true;
      if (this.filter() === 'action') return ['DRAFT', 'WAITING_CONFIRMATION', 'CONFIRMED', 'PREPARING'].includes(order.status);
      return ['READY_FOR_DELIVERY', 'SENT_TO_DELIVERY', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'].includes(order.status);
    }),
  );

  constructor() {
    this.showForm.set(this.route.snapshot.queryParamMap.get('create') === '1');
    this.load();
  }

  protected toggleForm(): void { this.showForm.update((value) => !value); }

  private load(): void {
    forkJoin({ orders: this.api.orders(), customers: this.api.customers(), products: this.api.products() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ orders, customers, products }) => {
          this.orders.set(orders);
          this.customers.set(customers);
          this.products.set(products.items);
        },
        error: (error) => this.setMessage(error.message, true),
      });
  }

  protected create(): void {
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.api
      .createOrder({
        customer_id: value.customerId || null,
        items: [{ variant_id: value.variantId, quantity: value.quantity }],
      })
      .pipe(finalize(() => this.saving.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (order) => {
          this.orders.update((items) => [order, ...items]);
          this.form.reset({ customerId: '', variantId: '', quantity: 1 });
          this.showForm.set(false);
          this.setMessage('Brouillon de commande créé.');
        },
        error: (error) => this.setMessage(error.message, true),
      });
  }

  protected count(status: string): number { return this.orders().filter((order) => order.status === status).length; }
  protected itemCount(order: Order): number { return order.items.reduce((total, item) => total + item.quantity, 0); }
  protected money(value: number): string { return new Intl.NumberFormat('fr-TN', { style: 'currency', currency: 'TND', minimumFractionDigits: 3 }).format(value / 1000); }
  protected date(value: string): string { return new Intl.DateTimeFormat('fr-TN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)); }
  protected statusLabel(status: string): string { return ({ DRAFT: 'Brouillon', WAITING_CONFIRMATION: 'Confirmation', CONFIRMED: 'Confirmée', PREPARING: 'Préparation', READY_FOR_DELIVERY: 'Prête à livrer', SENT_TO_DELIVERY: 'Transmise', PICKED_UP: 'Collectée', IN_TRANSIT: 'En transit', DELIVERED: 'Livrée', FAILED_DELIVERY: 'Échec', RETURNED: 'Retournée', CANCELLED: 'Annulée' } as Record<string, string>)[status] ?? status; }
  private setMessage(message: string, error = false): void { this.message.set(message); this.isError.set(error); }
}
