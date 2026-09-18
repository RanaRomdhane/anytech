import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-root',
  imports: [CommonModule, MatButtonModule, MatProgressBarModule, MatTooltipModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly activeSection = signal('Vue d’ensemble');
  protected readonly locale = signal<'FR' | 'AR'>('FR');
  protected readonly navigation = [
    { label: 'Vue d’ensemble', icon: 'grid' },
    { label: 'Boîte de réception', icon: 'message', badge: 12 },
    { label: 'Commandes', icon: 'bag', badge: 4 },
    { label: 'Catalogue', icon: 'box' },
    { label: 'Clients', icon: 'users' },
    { label: 'Livraisons', icon: 'truck' },
  ];
  protected readonly administration = [
    { label: 'Agents IA', icon: 'sparkles' },
    { label: 'Analytiques', icon: 'chart' },
    { label: 'Intégrations', icon: 'link' },
    { label: 'Équipe', icon: 'team' },
    { label: 'Paramètres', icon: 'settings' },
  ];
  protected readonly metrics = [
    { label: 'Conversations', value: '1 284', trend: '+18,2 %', detail: 'vs. période précédente', tone: 'blue', icon: 'message' },
    { label: 'Commandes confirmées', value: '186', trend: '+12,4 %', detail: '14,5 % de conversion', tone: 'teal', icon: 'bag' },
    { label: 'Valeur générée', value: '24 860 DT', trend: '+9,8 %', detail: 'Panier moyen 133,66 DT', tone: 'violet', icon: 'revenue' },
    { label: 'Résolution par l’IA', value: '68,4 %', trend: '+5,1 pts', detail: '878 conversations', tone: 'amber', icon: 'sparkles' },
  ];
  protected readonly conversations = [
    { initials: 'MK', name: 'Meriem Khelifi', message: 'Merci, je confirme la commande.', time: '10:42', status: 'Commande', color: 'mint' },
    { initials: 'YZ', name: 'Youssef Zayani', message: 'Est-ce que le modèle noir est disponible ?', time: '10:38', status: 'IA active', color: 'blue' },
    { initials: 'SA', name: 'Sarra Ayadi', message: 'Nheb taille 38, livraison à Sousse.', time: '10:31', status: 'Intervention', color: 'peach' },
  ];
  protected readonly orders = [
    { ref: '#AT-0186', customer: 'Meriem Khelifi', amount: '137,900 DT', state: 'Confirmée' },
    { ref: '#AT-0185', customer: 'Ahmed Ben Salem', amount: '89,000 DT', state: 'Préparation' },
    { ref: '#AT-0184', customer: 'Inès Mansouri', amount: '214,500 DT', state: 'Livraison' },
  ];
  protected readonly chartBars = [34, 46, 42, 61, 54, 72, 68, 83, 76, 92, 86, 96];
  protected readonly currentDate = new Intl.DateTimeFormat('fr-TN', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date());
  protected readonly direction = computed(() => (this.locale() === 'AR' ? 'rtl' : 'ltr'));

  protected selectSection(label: string): void {
    this.activeSection.set(label);
  }

  protected toggleLocale(): void {
    this.locale.update((value) => (value === 'FR' ? 'AR' : 'FR'));
  }
}
