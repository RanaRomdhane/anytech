import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import {
  AIDraft,
  AIRun,
  AIStatus,
  Analytics,
  AuditEvent,
  Company,
  Conversation,
  ConversationDetail,
  Customer,
  Integration,
  Order,
  Product,
  TeamMember,
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private companyPath(path: string): string {
    const companyId = this.auth.companyId();
    if (!companyId) throw new Error('Aucun espace de travail actif.');
    return `/api/v1/companies/${companyId}${path}`;
  }

  products() {
    return this.http.get<{ items: Product[] }>(this.companyPath('/products'), { withCredentials: true });
  }

  createProduct(payload: {
    name: string;
    description: string;
    variant: { sku: string; price_minor: number; stock_on_hand: number; attributes: Record<string, string> };
  }) {
    return this.http.post<Product>(this.companyPath('/products'), payload, { withCredentials: true });
  }

  conversations() {
    return this.http.get<Conversation[]>(this.companyPath('/conversations'), { withCredentials: true });
  }

  conversation(id: string) {
    return this.http.get<ConversationDetail>(this.companyPath(`/conversations/${id}`), {
      withCredentials: true,
    });
  }

  createAiDraft(id: string) {
    return this.http.post<AIDraft>(this.companyPath(`/conversations/${id}/ai-draft`), {}, {
      withCredentials: true,
    });
  }

  saveConversationMessage(id: string, body: string) {
    return this.http.post<ConversationDetail['messages'][number]>(
      this.companyPath(`/conversations/${id}/messages`),
      { body, client_message_id: crypto.randomUUID() },
      { withCredentials: true },
    );
  }

  changeConversationMode(conversation: Conversation, action: 'takeover' | 'return-to-ai') {
    return this.http.post<Conversation>(
      this.companyPath(`/conversations/${conversation.id}/${action}`),
      { expected_version: conversation.version },
      { withCredentials: true },
    );
  }

  orders() {
    return this.http.get<Order[]>(this.companyPath('/orders'), { withCredentials: true });
  }

  createOrder(payload: { customer_id: string | null; items: { variant_id: string; quantity: number }[] }) {
    return this.http.post<Order>(this.companyPath('/orders'), payload, { withCredentials: true });
  }

  quoteOrder(orderId: string, deliveryMinor: number) {
    return this.http.post(
      this.companyPath(`/orders/${orderId}/quote`),
      { delivery_minor: deliveryMinor },
      { withCredentials: true },
    );
  }

  confirmOrder(order: Order) {
    return this.http.post<Order>(
      this.companyPath(`/orders/${order.id}/confirm`),
      {
        quote_version: order.latest_quote_version,
        evidence_type: 'staff',
        evidence_id: crypto.randomUUID(),
      },
      { withCredentials: true, headers: { 'Idempotency-Key': crypto.randomUUID() } },
    );
  }

  transitionOrder(order: Order, targetStatus: 'PREPARING' | 'READY_FOR_DELIVERY') {
    return this.http.post<Order>(
      this.companyPath(`/orders/${order.id}/transitions`),
      { target_status: targetStatus, expected_version: order.version },
      { withCredentials: true },
    );
  }

  cancelOrder(order: Order) {
    return this.http.post<Order>(
      this.companyPath(`/orders/${order.id}/cancel`),
      { reason: 'Annulation demandée depuis le suivi des commandes', expected_version: order.version },
      { withCredentials: true },
    );
  }

  customers(query = '') {
    return this.http.get<Customer[]>(this.companyPath('/customers'), {
      params: query ? { q: query } : {},
      withCredentials: true,
    });
  }

  company() {
    return this.http.get<Company>(this.companyPath('/settings'), { withCredentials: true });
  }

  updateCompany(payload: Pick<Company, 'name' | 'currency' | 'timezone'>) {
    return this.http.patch<Company>(this.companyPath('/settings'), payload, {
      withCredentials: true,
    });
  }

  team() {
    return this.http.get<TeamMember[]>(this.companyPath('/team'), { withCredentials: true });
  }

  analytics() {
    return this.http.get<Analytics>(this.companyPath('/analytics/summary'), {
      withCredentials: true,
    });
  }

  integrations() {
    return this.http.get<Integration[]>(this.companyPath('/integrations'), {
      withCredentials: true,
    });
  }

  aiStatus() {
    return this.http.get<AIStatus>(this.companyPath('/ai/status'), { withCredentials: true });
  }

  aiRuns() {
    return this.http.get<AIRun[]>(this.companyPath('/ai/runs'), { withCredentials: true });
  }

  audit() {
    return this.http.get<AuditEvent[]>(this.companyPath('/audit'), { withCredentials: true });
  }

  deliveries() {
    return this.http.get<Order[]>(this.companyPath('/deliveries'), { withCredentials: true });
  }

  openEvents(): EventSource {
    return new EventSource(this.companyPath('/events'), { withCredentials: true });
  }
}
