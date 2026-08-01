# ShinePro improvement audit

Audit date: 2026-07-28

## Existing surfaces

| Surface | Current information | Existing actions | Gaps found |
|---|---|---|---|
| Overview | Branch KPIs, queue, revenue rhythm, review queue, team pulse | New job, refresh, shift summary, navigation | KPI cards and review rows are not drill-down links; settings is a dead-end; no unified action inbox |
| Operations | Searchable job list, status filters, selected job detail | Create job, assign, start, complete task, approve quality, request rework, collect payment, history | No edit/duplicate/correction/refund/receipt actions; no bay move, split payment, add service, pause, attachment or audit menu; disabled reasons are incomplete |
| Earnings | Worker totals and selected commission breakdown | Export, payroll review | No worker statement, adjustment, bonus, dispute, correction or payroll detail actions |
| Cash & expenses | Register calculation, contribution margin, expense table | Reconcile, add expense, open register | No add/remove cash, count cash, approve/reject, correction/reversal, receipt attachment, ledger drill-down |
| Reports | Report cards and audit activity | CSV export | No date/branch/service filters, PDF/print, saved views, source-record drill-down |
| Team | Worker cards and permission matrix | Add worker button (no handler), permission matrix | No worker profile, schedule, attendance, branch/role assignment, suspend/reactivate, earnings/adjustment actions |
| Roles | Owner, manager, cashier, quality controller, worker, accountant selector | Frontend role filtering | Missing platform admin, company admin, team leader, inventory manager, customer; no branch-scope message or server-side authorization layer |
| Configuration | Hardcoded service prices, commission rules, statuses and thresholds | None | Criteria are visible in code but have no management page or version/history UI |
| Customer / inventory / inbox | Not present | None | Missing pages and complete workflows; records cannot be managed because records are not represented |

## Classification

- Missing Page: Customers, vehicles, customer portal, inventory, notifications/inbox, configuration center, permission matrix detail, shifts, quality/rework, payments, payroll, ledger.
- Missing Button: edit, duplicate, archive/restore, correction/reversal, receipt, split payment, cash movements, expense approval, inventory movements, worker management, report filters.
- Missing Editing Capability: draft job, customer/vehicle profile, worker profile, service/price configuration, quality checklist, approval rules.
- Incorrect Permission: role selector only changes a small set of frontend actions; there is no backend authorization boundary. The demo must label this limitation clearly.
- Incomplete Workflow: payment, refund, shift close, payroll, expense approval, inventory, complaints, customer portal.
- Missing Approval: refunds, payroll, expenses, cash differences, commission overrides and credit.
- Missing Audit Record: several new actions have no visible history affordance.
- Missing Mobile Action: context-aware sticky actions for job, payment, quality and customer pages.
- Dead-End Page: Settings, Add worker, many icon-only menu buttons and report cards without source drill-down.

## Improvement scope for this frontend release

Add the missing navigable management surfaces and action patterns in the browser prototype: customer management, inventory, approval inbox, configuration center, customer portal, expanded roles, editable draft records, correction workflows for locked records, action menus with explanations, accessible labels, Persian-ready direction toggle, and a mobile action bar. Keep the current operational queue and financial calculations intact.

## Production boundary

This repository is a browser-only demonstrator. It cannot provide true server-side authorization, durable double-entry ledger persistence, database migrations, or real authentication without a backend. The UI will expose the permission model and record-lock/correction semantics so those APIs can be added without changing the user workflow.
