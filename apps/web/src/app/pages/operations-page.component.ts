import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import {
  AIStatus,
  Analytics,
  AuditEvent,
  Company,
  Customer,
  Integration,
  Order,
  TeamMember,
} from '../core/models';

type PageKey = 'customers' | 'deliveries' | 'ai' | 'analytics' | 'integrations' | 'team' | 'settings';

@Component({
  selector: 'app-operations-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    @switch (page()) {
      @case ('customers') {
        <section class="page-heading compact"><div><p class="eyebrow">Relation client</p><h1>Clients</h1><p>Retrouvez les coordonnées et l’activité liée à chaque client.</p></div><label class="table-search"><span class="nav-icon" data-icon="search"></span><input type="search" placeholder="Nom, téléphone ou ville" (input)="customerFilter.set($any($event.target).value)" /></label></section>
        @if (message()) { <div class="notice error-notice">{{ message() }}</div> }
        <section class="customer-grid">
          @for (customer of filteredCustomers(); track customer.id) { <article class="panel customer-card"><div class="contact-avatar large">{{ initials(customer.name) }}</div><div><h2>{{ customer.name }}</h2><a [href]="'tel:' + customer.phone">{{ customer.phone || 'Téléphone non renseigné' }}</a><p>{{ location(customer) }}</p></div><a class="row-action" routerLink="/inbox" aria-label="Voir les conversations">→</a></article> }
          @empty { <div class="panel empty-state"><span class="empty-icon nav-icon" data-icon="users"></span><h3>Aucun client trouvé</h3><p>Les profils apparaissent lorsqu’une identité client est enregistrée.</p></div> }
        </section>
      }
      @case ('deliveries') {
        <section class="page-heading compact"><div><p class="eyebrow">Exécution</p><h1>Livraisons</h1><p>Suivez les commandes prêtes, transmises et livrées.</p></div><a class="secondary-button" routerLink="/integrations">Transporteur</a></section>
        @if (message()) { <div class="notice error-notice">{{ message() }}</div> }
        <section class="orders-summary">
          <article><span class="nav-icon" data-icon="box"></span><div><small>Prêtes</small><strong>{{ deliveryCount('READY_FOR_DELIVERY') }}</strong></div></article>
          <article><span class="nav-icon" data-icon="truck"></span><div><small>Transmises</small><strong>{{ deliveryCount('SENT_TO_DELIVERY') }}</strong></div></article>
          <article><span class="nav-icon" data-icon="truck"></span><div><small>En transit</small><strong>{{ deliveryCount('IN_TRANSIT') }}</strong></div></article>
          <article><span class="nav-icon" data-icon="sparkles"></span><div><small>Livrées</small><strong>{{ deliveryCount('DELIVERED') }}</strong></div></article>
        </section>
        <section class="panel data-panel"><header class="panel-header"><div><span class="section-kicker">Expéditions</span><h2>Suivi des commandes</h2><p>{{ deliveries().length }} commande(s) dans le parcours de livraison</p></div></header><div class="responsive-table"><table><thead><tr><th>Commande</th><th>Articles</th><th>État</th><th>Dernière mise à jour</th><th>Total</th></tr></thead><tbody>@for (order of deliveries(); track order.id) { <tr><td><strong>#{{ order.id.slice(0, 8).toUpperCase() }}</strong></td><td>{{ order.items[0]?.product_name }}</td><td><span class="order-state" [attr.data-status]="order.status">{{ statusLabel(order.status) }}</span></td><td>{{ date(order.updated_at) }}</td><td class="money-cell">{{ money(order.total_minor) }}</td></tr> }</tbody></table></div>@if (!deliveries().length) { <div class="empty-state"><span class="empty-icon nav-icon" data-icon="truck"></span><h3>Aucune livraison</h3><p>Les commandes prêtes à expédier apparaîtront ici.</p></div> }</section>
      }
      @case ('analytics') {
        <section class="page-heading"><div><p class="eyebrow">Pilotage</p><h1>Analytiques</h1><p>Mesures calculées à partir de l’activité enregistrée.</p></div><div class="live-status"><span></span> Données actualisées</div></section>
        @if (analytics(); as data) {
          <section class="metric-grid"><article class="metric-card" data-tone="blue"><div class="metric-top"><span class="metric-icon"><span class="nav-icon" data-icon="users"></span></span></div><p>Clients</p><strong>{{ data.customers }}</strong><small>{{ data.conversations }} conversation(s)</small></article><article class="metric-card" data-tone="teal"><div class="metric-top"><span class="metric-icon"><span class="nav-icon" data-icon="bag"></span></span></div><p>Commandes confirmées</p><strong>{{ data.confirmed_orders }}</strong><small>{{ data.conversion_rate }} % des conversations</small></article><article class="metric-card" data-tone="violet"><div class="metric-top"><span class="metric-icon"><span class="nav-icon" data-icon="revenue"></span></span></div><p>Valeur enregistrée</p><strong>{{ money(data.order_value_minor) }}</strong><small>{{ data.delivered_orders }} livrée(s)</small></article><article class="metric-card" data-tone="amber"><div class="metric-top"><span class="metric-icon"><span class="nav-icon" data-icon="box"></span></span></div><p>Catalogue</p><strong>{{ data.products }}</strong><small>{{ data.low_stock_variants }} stock(s) faible(s)</small></article></section>
          <section class="analytics-grid"><article class="panel insight-card"><span class="section-kicker">Intervention</span><strong>{{ data.human_conversations }}</strong><h2>conversation(s) prises en charge</h2><p>Conversations actuellement gérées ou reprises par l’équipe.</p></article><article class="panel insight-card accent"><span class="section-kicker">Conversion</span><strong>{{ data.conversion_rate }} %</strong><h2>conversations converties</h2><p>Part des conversations associées à une commande confirmée.</p></article></section>
        }
      }
      @case ('integrations') {
        <section class="page-heading"><div><p class="eyebrow">Connexions</p><h1>Intégrations</h1><p>État réel des services qui alimentent les conversations, l’assistant et les livraisons.</p></div></section>
        <section class="integration-grid">@for (item of integrations(); track item.key) { <article class="panel integration-card"><span class="integration-icon"><span class="nav-icon" [attr.data-icon]="integrationIcon(item.key)"></span></span><div><span class="status-chip" [class.intervention]="!item.configured">{{ item.configured ? 'Connecté' : 'Non connecté' }}</span><h2>{{ item.name }}</h2><p>{{ item.detail }}</p></div></article> } @empty { <div class="panel empty-state"><p>Impossible de charger l’état des intégrations.</p></div> }</section>
        <section class="panel connection-note"><span class="nav-icon" data-icon="settings"></span><div><h2>Identifiants protégés</h2><p>Les secrets de connexion restent protégés et ne sont jamais affichés dans l’application.</p></div></section>
      }
      @case ('ai') {
        <section class="page-heading"><div><p class="eyebrow">Assistant commercial</p><h1>Agents IA</h1><p>Contrôlez la disponibilité du modèle et son budget mensuel.</p></div><a class="secondary-button" routerLink="/integrations">Gérer la connexion</a></section>
        @if (ai(); as status) { <section class="ai-overview panel"><div class="ai-orb"><span class="nav-icon" data-icon="sparkles"></span></div><div><span class="status-chip" [class.intervention]="!status.configured">{{ status.configured ? 'Disponible' : 'Non connecté' }}</span><h2>{{ status.model || 'Assistant IA' }}</h2><p>{{ status.provider ? 'Fourni par ' + status.provider : 'Choisissez un fournisseur hébergé pour activer les réponses assistées.' }}</p></div><div class="budget-ring"><strong>{{ budgetPercent(status) }} %</strong><small>du budget</small></div></section><section class="analytics-grid"><article class="panel insight-card"><span class="section-kicker">Budget mensuel</span><strong>{{ money(status.monthly_budget_minor) }}</strong><h2>plafond configuré</h2><p>Les appels sont arrêtés lorsque la limite est atteinte.</p></article><article class="panel insight-card accent"><span class="section-kicker">Consommation</span><strong>{{ money(status.spent_minor) }}</strong><h2>utilisé ce mois</h2><p>Coût enregistré pour les conversations assistées.</p></article></section> }
      }
      @case ('team') {
        <section class="page-heading"><div><p class="eyebrow">Accès</p><h1>Équipe</h1><p>Membres autorisés et rôles appliqués à cet espace.</p></div></section>
        <section class="panel data-panel"><header class="panel-header"><div><span class="section-kicker">Membres</span><h2>{{ team().length }} personne(s)</h2><p>Accès actifs dans cet espace</p></div></header><div class="team-list">@for (member of team(); track member.user_id) { <article><span class="contact-avatar">{{ initials(member.full_name) }}</span><div><strong>{{ member.full_name }}</strong><small>{{ member.email }}</small></div><span class="role-chip">{{ roleLabel(member.role) }}</span><span class="state-dot" [class.offline]="!member.active"></span></article> }</div></section>
      }
      @case ('settings') {
        <section class="page-heading"><div><p class="eyebrow">Espace</p><h1>Paramètres</h1><p>Identité, devise et fuseau horaire utilisés dans l’application.</p></div></section>
        @if (message()) { <div class="notice" [class.error-notice]="isError()">{{ message() }}</div> }
        <section class="settings-layout"><form class="panel settings-form" [formGroup]="settingsForm" (ngSubmit)="saveSettings()"><header class="panel-header"><div><span class="section-kicker">Informations générales</span><h2>Configuration de l’espace</h2></div></header><label>Nom de l’entreprise<input formControlName="name" /></label><label>Devise<select formControlName="currency"><option value="TND">TND — Dinar tunisien</option><option value="EUR">EUR — Euro</option><option value="USD">USD — Dollar américain</option></select></label><label>Fuseau horaire<select formControlName="timezone"><option value="Africa/Tunis">Africa/Tunis</option><option value="Europe/Paris">Europe/Paris</option><option value="UTC">UTC</option></select></label><div class="form-actions"><button class="primary-button" type="submit" [disabled]="settingsForm.invalid || saving()">{{ saving() ? 'Enregistrement…' : 'Enregistrer' }}</button></div></form><section class="panel audit-panel"><header class="panel-header"><div><span class="section-kicker">Historique</span><h2>Activité récente</h2></div></header><ol>@for (event of auditEvents(); track event.id) { <li><span></span><div><strong>{{ auditLabel(event.action) }}</strong><small>{{ dateTime(event.created_at) }}</small></div></li> } @empty { <li class="empty-row">Aucune activité enregistrée.</li> }</ol></section></section>
      }
    }
  `,
})
export class OperationsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly page = signal<PageKey>('customers');
  protected readonly customers = signal<Customer[]>([]);
  protected readonly customerFilter = signal('');
  protected readonly deliveries = signal<Order[]>([]);
  protected readonly analytics = signal<Analytics | null>(null);
  protected readonly integrations = signal<Integration[]>([]);
  protected readonly ai = signal<AIStatus | null>(null);
  protected readonly team = signal<TeamMember[]>([]);
  protected readonly auditEvents = signal<AuditEvent[]>([]);
  protected readonly saving = signal(false);
  protected readonly message = signal('');
  protected readonly isError = signal(false);
  protected readonly settingsForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    currency: new FormControl('TND', { nonNullable: true, validators: [Validators.required] }),
    timezone: new FormControl('Africa/Tunis', { nonNullable: true, validators: [Validators.required] }),
  });
  protected readonly filteredCustomers = computed(() => {
    const query = this.customerFilter().trim().toLowerCase();
    return query
      ? this.customers().filter((customer) => `${customer.name} ${customer.phone} ${customer.city}`.toLowerCase().includes(query))
      : this.customers();
  });

  constructor() {
    this.route.data.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((data) => {
      this.page.set(data['page'] as PageKey);
      this.load(data['page'] as PageKey);
    });
  }

  private load(page: PageKey): void {
    this.message.set('');
    const fail = (error: Error) => { this.message.set(error.message); this.isError.set(true); };
    if (page === 'customers') this.api.customers().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (items) => this.customers.set(items), error: fail });
    if (page === 'deliveries') this.api.deliveries().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (items) => this.deliveries.set(items), error: fail });
    if (page === 'analytics') this.api.analytics().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (data) => this.analytics.set(data), error: fail });
    if (page === 'integrations') this.api.integrations().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (items) => this.integrations.set(items), error: fail });
    if (page === 'ai') this.api.aiStatus().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (status) => this.ai.set(status), error: fail });
    if (page === 'team') this.api.team().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (items) => this.team.set(items), error: fail });
    if (page === 'settings') {
      this.api.company().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (company) => this.patchSettings(company), error: fail });
      this.api.audit().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (events) => this.auditEvents.set(events), error: fail });
    }
  }

  protected saveSettings(): void {
    if (this.settingsForm.invalid) return;
    this.saving.set(true);
    this.api.updateCompany(this.settingsForm.getRawValue())
      .pipe(finalize(() => this.saving.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (company) => { this.patchSettings(company); this.message.set('Paramètres enregistrés.'); this.isError.set(false); this.api.audit().subscribe((events) => this.auditEvents.set(events)); }, error: (error) => { this.message.set(error.message); this.isError.set(true); } });
  }

  private patchSettings(company: Company): void { this.settingsForm.setValue({ name: company.name, currency: company.currency, timezone: company.timezone }); this.auth.workspaceName.set(company.name); }
  protected initials(name: string): string { return name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
  protected location(customer: Customer): string { return [customer.address, customer.city, customer.governorate].filter(Boolean).join(', ') || 'Adresse non renseignée'; }
  protected money(value: number): string { return new Intl.NumberFormat('fr-TN', { style: 'currency', currency: 'TND', minimumFractionDigits: 3 }).format(value / 1000); }
  protected date(value: string): string { return new Intl.DateTimeFormat('fr-TN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)); }
  protected dateTime(value: string): string { return new Intl.DateTimeFormat('fr-TN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
  protected deliveryCount(status: string): number { return this.deliveries().filter((order) => order.status === status).length; }
  protected budgetPercent(status: AIStatus): number { return status.monthly_budget_minor > 0 ? Math.min(100, Math.round((status.spent_minor / status.monthly_budget_minor) * 100)) : 0; }
  protected integrationIcon(key: Integration['key']): string { return key === 'whatsapp' ? 'message' : key === 'llm' ? 'sparkles' : 'truck'; }
  protected roleLabel(role: TeamMember['role']): string { return role === 'company_admin' ? 'Administrateur' : role === 'platform_admin' ? 'Plateforme' : 'Agent'; }
  protected statusLabel(status: string): string { return ({ READY_FOR_DELIVERY: 'Prête à livrer', SENT_TO_DELIVERY: 'Transmise', PICKED_UP: 'Collectée', IN_TRANSIT: 'En transit', DELIVERED: 'Livrée', FAILED_DELIVERY: 'Échec', RETURNED: 'Retournée' } as Record<string, string>)[status] ?? status; }
  protected auditLabel(action: string): string { return ({ 'product.created': 'Produit créé', 'order.created': 'Commande créée', 'order.confirmed': 'Commande confirmée', 'company.settings.updated': 'Paramètres modifiés', 'conversation.human_active': 'Conversation reprise', 'conversation.ai_active': 'Conversation rendue à l’IA' } as Record<string, string>)[action] ?? action.replaceAll('.', ' '); }
}
