# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

This repository contains automation skills for administrative tasks, primarily focused on VAT (IVA) reporting. The main deliverable is a daily VAT reconciliation report that compares invoices between two sources: **Odoo** (ERP system) and **ARCA** (Argentine tax authority system).

## Planned Skills

### Daily VAT Report (`daily-vat-report`)
Generates a daily VAT reconciliation report from Monday to Friday.

**Input files:**
- `Odoo_<date>` — invoice export from the Odoo ERP
- `Arca_<date>` — invoice export from ARCA (AFIP)

**Report sections:**
1. Count of invoices only in ARCA
2. Count of invoices in Odoo
3. Count of invoices missing in Odoo (with a detail sheet/table listing the missing vouchers)
4. Amount differences between both sources

## Repository Structure (planned)

```
skills/
  daily-vat-report/   # VAT reconciliation skill
data/                 # Input files (Odoo_<date>, Arca_<date>)
reports/              # Generated output reports
```

## Development Notes

- Input files are expected to follow naming convention `Odoo_YYYY-MM-DD` and `Arca_YYYY-MM-DD`.
- The skill runs Monday–Friday (weekdays only).
- Report output should include a summary sheet and a detail sheet for missing invoices.
