import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiService } from '../core/api.service';
import { Product } from '../core/models';

@Component({
  selector: 'app-catalog-page',
  imports: [ReactiveFormsModule],
  template: `
    <section class="page-heading compact"><div><p class="eyebrow">Catalogue</p><h1>Produits & stock</h1><p>Les prix et disponibilités utilisés par l’IA viennent directement d’ici.</p></div><button class="primary-button" type="button" (click)="toggleForm()">{{ showForm() ? 'Fermer' : '+ Ajouter un produit' }}</button></section>
    @if (showForm()) {
      <section class="panel editor-panel">
        <header class="panel-header"><div><span class="section-kicker">Nouvelle référence</span><h2>Créer un produit simple</h2><p>Une variante par défaut suffit pour commencer.</p></div></header>
        <form class="product-form" [formGroup]="form" (ngSubmit)="create()">
          <label>Nom du produit<input formControlName="name" placeholder="Ex. Atlas Pro" /></label>
          <label>SKU<input formControlName="sku" placeholder="ATL-NOI-38" /></label>
          <label>Prix en TND<input formControlName="price" type="number" min="0" step="0.001" /></label>
          <label>Stock initial<input formControlName="stock" type="number" min="0" step="1" /></label>
          <label class="wide-field">Description<textarea formControlName="description" rows="3" placeholder="Informations fiables à utiliser dans les réponses commerciales"></textarea></label>
          <div class="form-actions wide-field"><button class="secondary-button" type="button" (click)="showForm.set(false)">Annuler</button><button class="primary-button" type="submit" [disabled]="form.invalid || saving()">{{ saving() ? 'Création…' : 'Créer le produit' }}</button></div>
        </form>
      </section>
    }
    @if (message()) { <div class="notice" [class.error-notice]="isError()" role="status">{{ message() }}</div> }
    <section class="panel data-panel">
      <header class="panel-header"><div><span class="section-kicker">Inventaire</span><h2>{{ products().length }} produit(s)</h2><p>Prix en millimes et disponibilité transactionnelle.</p></div><label class="table-search"><span class="nav-icon" data-icon="search"></span><input type="search" placeholder="Filtrer le catalogue" (input)="filter.set($any($event.target).value)" /></label></header>
      <div class="product-grid">
        @for (product of filteredProducts(); track product.id) {
          <article class="product-card"><div class="product-visual"><span>{{ initials(product.name) }}</span><i [class.online]="product.active"></i></div><div class="product-info"><span class="status-line">{{ product.active ? 'Actif' : 'Inactif' }}</span><h3>{{ product.name }}</h3><p>{{ product.description || 'Aucune description' }}</p><div class="product-meta"><span><small>SKU</small><strong>{{ product.variants[0]?.sku }}</strong></span><span><small>Prix</small><strong>{{ money(product.variants[0]?.sale_price_minor ?? product.variants[0]?.price_minor ?? 0) }}</strong></span><span><small>Disponible</small><strong [class.low-stock]="(product.variants[0]?.available_stock ?? 0) < 5">{{ product.variants[0]?.available_stock ?? 0 }}</strong></span></div></div></article>
        } @empty { <div class="empty-state"><span class="empty-icon nav-icon" data-icon="box"></span><h3>Aucun produit</h3><p>Ajoutez votre première référence pour permettre des réponses commerciales fiables.</p></div> }
      </div>
    </section>
  `,
})
export class CatalogPageComponent {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly products = signal<Product[]>([]);
  protected readonly showForm = signal(false);
  protected readonly saving = signal(false);
  protected readonly message = signal('');
  protected readonly isError = signal(false);
  protected readonly filter = signal('');
  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    sku: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    price: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    stock: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    description: new FormControl('', { nonNullable: true }),
  });

  constructor() { this.load(); }
  protected toggleForm(): void { this.showForm.update((visible) => !visible); }
  protected filteredProducts(): Product[] { const q = this.filter().trim().toLowerCase(); return q ? this.products().filter((p) => `${p.name} ${p.variants[0]?.sku}`.toLowerCase().includes(q)) : this.products(); }
  protected initials(name: string): string { return name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
  protected money(value: number): string { return new Intl.NumberFormat('fr-TN', { style: 'currency', currency: 'TND', minimumFractionDigits: 3 }).format(value / 1000); }
  private load(): void { this.api.products().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (response) => this.products.set(response.items), error: (error) => this.setMessage(error.message, true) }); }
  protected create(): void {
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.api.createProduct({ name: value.name, description: value.description, variant: { sku: value.sku, price_minor: Math.round(value.price * 1000), stock_on_hand: value.stock, attributes: {} } })
      .pipe(finalize(() => this.saving.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (product) => { this.products.update((items) => [product, ...items]); this.form.reset({ name: '', sku: '', price: 0, stock: 0, description: '' }); this.showForm.set(false); this.setMessage('Produit créé avec succès.'); }, error: (error) => this.setMessage(error.message, true) });
  }
  private setMessage(message: string, error = false): void { this.message.set(message); this.isError.set(error); }
}
