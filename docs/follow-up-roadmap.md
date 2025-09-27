# Follow-up Roadmap

With the core estimating flow stabilizing, the next initiatives can focus on revenue, operations, and communication enhancements. The themes below outline recommended sequencing and the technical considerations uncovered while aligning the Supabase sync layer.

## 1. Payments enablement

- **Goal:** Allow customers to pay estimates or converted invoices directly.
- **Key tasks:**
  - Model payment intents and transactions in Supabase, including status, amount, processor metadata, and associations back to estimates.
  - Integrate a PCI-compliant processor (e.g., Stripe) through serverless functions that exchange tokens and update Supabase tables.
  - Extend the mobile client with a payment CTA on approved estimates and handle success/failure webhooks to reconcile offline copies.
- **Dependencies:** Completed metadata triggers ensure versioning stays monotonic when payment events update estimates.
- **Open questions:** Do we collect deposits only or full balances? Are refunds in scope?

## 2. Scheduling automation

- **Goal:** Convert approved estimates into scheduled jobs with reminders.
- **Key tasks:**
  - Introduce job and appointment tables with start/end timestamps, location details, and status transitions.
  - Build background functions (Supabase cron or external workers) to send reminders via SMS/email using the delivery log metadata patterns.
  - Surface upcoming appointments in the app, reusing the sync queue so offline edits propagate.
- **Dependencies:** Requires stable estimate-to-customer foreign keys, now enforced by the refreshed policies.
- **Open questions:** What calendar integrations (Google/Outlook) are necessary? How do we handle double-booking prevention offline?

## 3. Document templating

- **Goal:** Standardize estimate and follow-up communications.
- **Key tasks:**
  - Store reusable rich-text or Markdown templates in Supabase with versioning similar to estimates.
  - Implement server-side rendering (PDF/HTML) combining templates with estimate data; log deliveries via the existing `delivery_logs` table.
  - Add a template picker in the client that gracefully degrades offline by caching active templates.
- **Dependencies:** Requires clear ownership policies; can piggyback on the new metadata trigger to maintain template revisions.
- **Open questions:** Do templates vary per user or per organization? Should we support localization?

## Suggested sequencing

1. Harden core estimate flows (monitor replication queue metrics, ensure no trigger regressions).
2. Prototype payments to unlock revenue while scope is contained.
3. Layer in scheduling once the team confirms operational requirements.
4. Invest in templating last to streamline communication using the stabilized data structures.

Documenting these steps now makes it easier to open targeted issues and share context with stakeholders once we flip the switch on the updated Supabase policies.
