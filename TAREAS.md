# Tareas administrativas — Backlog

> Capturado el 2026-05-25 a partir de dictado del usuario.
> El punto 5 quedó vacío en el dictado y está pendiente de completar.

---

## 1. Agenda de reuniones de la semana

- **Viernes 22/05, 16:00–17:00** — Revisión de ítems concurso JF Servicios.
  - ⚠️ La fecha indicada (22/05) ya pasó respecto de hoy (lunes 25/05). Confirmar si la reunión ya se realizó o si la fecha correcta es **viernes 29/05**.
- Sin más reuniones programadas esta semana.

---

## 2. Clasificación de bandeja de entrada

Crear carpetas y reglas en el correo:

| Carpeta | Remitentes / criterios |
|---|---|
| `impuestos j f` | Andrea Amato, Pablo Amato |
| `gerencias j f` | Facundo Bruno, Javier Bruno |
| `administración` | Florencia, administración, facturación Taller, condominios JF Servicios / Just Fix |
| `descartar` (publicidad) | Correos de publicidad / promociones |

**Orden de prioridad de revisión y respuesta:**
1. Impuestos
2. Facundo y Javier Bruno
3. Administración, pago a proveedores, Florencia Álvez

**Alertas:**
- Avisar cuando haya varios mensajes sin contestar por **más de 24 horas**.

---

## 3. Etiqueta "prioridad uno"

Aplicar automáticamente a correos provenientes de:
- Facundo Bruno
- Administración
- Florencia

---

## 4. Seguimientos diarios y periódicos

### 4.1 Control de IVA (diario)
- IVA de **JF Servicios**
- IVA de **Just Fix**
- Armar **informe con datos y gráficos** para presentar.
- 🔗 Esta tarea conecta con el skill planificado `daily-vat-report` ya descrito en `CLAUDE.md`.

### 4.2 Cuentas por cobrar
- Informe **intradiario** de cuentas por cobrar.

### 4.3 Agenda de pagos
- **Lunes, miércoles y viernes**: armar agenda de pagos con prioridad **1 a 4**.

### 4.4 Recordatorio transferencias Hugo Rossi
- Recordatorio **diario** mientras haya transferencias **superiores a $150.000** pendientes.
- Vigencia: **hasta el 03/10/2026**.
- Revisar con más frecuencia a medida que se acerque la fecha.

### 4.5 Instructivo para Antonella
- Manejo de **Oversoft**.
- **Facturación de Renault**.

### 4.6 Conciliaciones Odoo vs banco
- Armar los archivos necesarios para conciliar en Odoo contra el banco.

---

## 5. (Pendiente de dictado)

> El usuario inició el punto 5 pero no lo completó. Pendiente de confirmar contenido.

---

## Propuesta de skills a construir

A partir del backlog, los candidatos a automatizar como *skills* son:

1. **`daily-vat-report`** — IVA diario JF Servicios + Just Fix con datos y gráficos (ya en `CLAUDE.md`).
2. **`email-triage`** — clasificación por carpetas, etiqueta "prioridad uno" y alerta de mensajes >24 h sin responder.
3. **`accounts-receivable-intraday`** — informe intradiario de cuentas por cobrar.
4. **`payments-agenda`** — agenda de pagos L/M/V con prioridad 1–4.
5. **`hugo-rossi-reminder`** — recordatorio diario de transferencias > $150.000 hasta 03/10/2026.
6. **`odoo-bank-reconciliation`** — preparación de archivos para conciliación.
7. **`antonella-handbook`** — instructivo de Oversoft + facturación Renault (entregable estático, no skill).
