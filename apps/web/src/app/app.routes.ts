import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { ShellComponent } from './layout/shell.component';
import { CatalogPageComponent } from './pages/catalog-page.component';
import { ConversationsPageComponent } from './pages/conversations-page.component';
import { DashboardPageComponent } from './pages/dashboard-page.component';
import { LoginPageComponent } from './pages/login-page.component';
import { OperationsPageComponent } from './pages/operations-page.component';
import { OrdersPageComponent } from './pages/orders-page.component';

export const routes: Routes = [
  { path: 'login', component: LoginPageComponent, title: 'Connexion · AnyTech' },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: DashboardPageComponent, title: 'Vue d’ensemble · AnyTech' },
      { path: 'inbox', component: ConversationsPageComponent, title: 'Boîte de réception · AnyTech' },
      { path: 'orders', component: OrdersPageComponent, title: 'Commandes · AnyTech' },
      { path: 'catalog', component: CatalogPageComponent, title: 'Catalogue · AnyTech' },
      { path: 'customers', component: OperationsPageComponent, data: { page: 'customers' }, title: 'Clients · AnyTech' },
      { path: 'deliveries', component: OperationsPageComponent, data: { page: 'deliveries' }, title: 'Livraisons · AnyTech' },
      { path: 'ai', component: OperationsPageComponent, data: { page: 'ai' }, title: 'Agents IA · AnyTech' },
      { path: 'analytics', component: OperationsPageComponent, data: { page: 'analytics' }, title: 'Analytiques · AnyTech' },
      { path: 'integrations', component: OperationsPageComponent, data: { page: 'integrations' }, title: 'Intégrations · AnyTech' },
      { path: 'team', component: OperationsPageComponent, data: { page: 'team' }, title: 'Équipe · AnyTech' },
      { path: 'settings', component: OperationsPageComponent, data: { page: 'settings' }, title: 'Paramètres · AnyTech' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
