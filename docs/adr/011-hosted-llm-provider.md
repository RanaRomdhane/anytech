# ADR 011: Hosted LLM provider for the pilot

Status: Proposed pending multilingual evaluation and API credentials  
Date: 2026-09-18

## Decision

Use the OpenAI-compatible provider adapter in `app/integrations/llm.py`. Evaluate Groq first because its free tier is adequate for development, its inference API supports local tool calling, and its data controls can disable retention. Start the evaluation with the production `openai/gpt-oss-20b` model and compare it with the strongest currently available multilingual model before enabling customer-facing responses.

The provider and model remain environment configuration. No model receives authority to commit prices, stock, orders, shipments or tracking updates.

## Cost and privacy guardrails

- Keep the application budget at zero until a provider key and monthly ceiling are deliberately configured.
- Use ordinary inference only; disable batch, file and fine-tuning features.
- Enable the provider's zero-data-retention control before sending customer messages.
- Reject calls when the company budget is exhausted and return the conversation to a human.
- Store token counts, model identifiers and latency, without private reasoning traces.

Groq documents a free tier, organization rate limits, OpenAI-compatible tool calling, and zero-data-retention controls. Free quotas and model availability can change, so they must be checked again before launch:

- [Groq model catalogue](https://console.groq.com/docs/models)
- [Groq tool use](https://console.groq.com/docs/tool-use/overview)
- [Groq customer data controls](https://console.groq.com/docs/your-data)
- [Groq billing tiers](https://console.groq.com/docs/billing-faqs)

## Rejected default

Do not send customer conversations through Gemini's unpaid tier. Google's current terms allow submitted content and responses to be used for product improvement and reviewed by humans. A paid Google Cloud project may be reconsidered because paid Gemini API requests are governed differently.
