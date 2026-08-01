# Financial invariants

- Monetary values are integer toman amounts in application code and PostgreSQL `bigint` columns. No floating-point math is used for financial values.
- Percentage commission rates are stored as basis points: `10000 = 100%`, `1000 = 10%`.
- Commission rounding is nearest toman, half-up: `(base * basis_points + 5000) / 10000`.
- Tips are stored separately from service revenue and are not credited to `service_revenue`.
- Payment parts must equal the job amount due; tips are a separate field.
- Customer-credit parts debit `customer_credit_receivable`; they are not treated as collected cash.
- Confirmed payments are immutable. Refunds, reversals, and corrections create new records and audit events.
- Every ledger transaction is posted inside the same database transaction as its source record and must satisfy `total debits = total credits`.
- Expected cash is derived from opening cash plus movements. It is never accepted from a client as an authoritative balance.
- Completed jobs retain price and commission snapshots; future configuration versions do not rewrite them.

## Operational verification

Before production enablement, run the payment, refund, payroll, cash, and ledger integration tests against a disposable PostgreSQL database. Restore a backup into staging and reconcile job, payment, earning, payroll, and audit counts before promoting a migration.
