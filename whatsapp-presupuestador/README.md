# Presupuestador WhatsApp — JustFix

Backend en Python/FastAPI que recibe mensajes de WhatsApp (Meta Cloud API), guía al
cliente para elegir sucursal / vehículo / trabajo, arma el presupuesto leyendo en vivo
la base de Google Sheets (mismas 5 hojas del Excel piloto: Vehículos, Recetas base,
Carga repuestos, Universales, Mano de obra) y responde.

## Reglas que implementa (validadas a mano antes de automatizar)

- Nunca inventa precio, código, cantidad ni tarifa: si falta un dato, no cierra el
  presupuesto y genera una solicitud interna diciendo exactamente qué falta y en qué hoja.
- Si hay más de una coincidencia posible (vehículo por motor ambiguo, tipo de aceite sin
  definir), pregunta al cliente en vez de elegir por conveniencia.
- Usa siempre precio de venta, nunca costo.
- Respeta la receta del trabajo pedido: no agrega ítems opcionales.
- Los totales los calcula siempre `rules_engine.py` con aritmética `Decimal` (nunca un
  modelo de lenguaje), así el presupuesto no puede "alucinar" un número.

## Estructura

```
app/
  config.py            # variables de entorno
  models.py             # dataclasses (Vehiculo, Receta, RepuestoCargado, Universal, ManoDeObra, ...)
  sheets_client.py       # lectura (solo lectura) de las 5 hojas de Google Sheets
  rules_engine.py        # matching + cálculo determinístico + detección de faltantes/ambigüedades
  formatting.py           # arma cálculo interno / mensaje al cliente / solicitud a Repuestos
  whatsapp_api.py         # envío de mensajes de texto y listas interactivas (Meta Graph API)
  session_store.py        # estado de la conversación por número (en memoria, ver limitación abajo)
  conversation_flow.py    # máquina de estados: sucursal -> vehículo -> trabajo -> cálculo
  main.py                 # rutas FastAPI: GET/POST /webhook, GET /health
```

## Nota sobre redondeo (importante, leer antes de comparar contra cálculos manuales)

El motor redondea **cada línea a centavos y después suma las líneas ya redondeadas**
(convención estándar de facturación: el total siempre coincide con la suma de lo que
se muestra línea por línea). Esto puede diferir en 1 o 2 centavos de sumar los valores
exactos sin redondear y redondear una sola vez al final — ambas son válidas
matemáticamente, pero producen números ligeramente distintos cuando una línea cae
justo en ",5" centésimos (ej. $167.355,375). El motor es internamente consistente;
si se prefiere la otra convención, cambiar `_round2`/`_d` en `rules_engine.py` en un
solo lugar.

## Puesta en marcha

### 1. Cuenta de WhatsApp Business (Meta) — ya existe en la empresa

En el Meta App Dashboard, dentro del producto "WhatsApp":
1. Tomar `META_PHONE_NUMBER_ID` (Configuración de la API > Números de teléfono).
2. Generar un token permanente de sistema (System User token) con permiso
   `whatsapp_business_messaging` → `META_WHATSAPP_TOKEN`.
3. Elegir cualquier clave propia para `META_VERIFY_TOKEN` (la vas a pegar en el paso 5).
4. Desplegar este backend en algún host con URL pública (Render, Fly.io, Railway, un VPS, etc.).
5. En "Configuración de webhooks" del app de Meta: URL = `https://tu-host/webhook`,
   Verify Token = el mismo valor de `META_VERIFY_TOKEN`, y suscribirse al campo `messages`.

### 2. Google Sheets

1. Crear una cuenta de servicio en Google Cloud, habilitar la Google Sheets API.
2. Descargar el JSON de credenciales → guardarlo como `service-account.json` (o el path
   que pongas en `GOOGLE_SERVICE_ACCOUNT_FILE`).
3. Compartir el Google Sheet (con las 5 hojas, mismos encabezados que el Excel piloto)
   con el email de la cuenta de servicio, en modo **Lector** — el backend nunca escribe.
4. Copiar el ID del Sheet (de la URL) → `GOOGLE_SHEET_ID`.

### 3. Variables de entorno

```bash
cp .env.example .env
# completar META_WHATSAPP_TOKEN, META_PHONE_NUMBER_ID, META_VERIFY_TOKEN,
# GOOGLE_SERVICE_ACCOUNT_FILE, GOOGLE_SHEET_ID
```

### 4. Correr localmente

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Para probar el webhook localmente antes de tener el host público, usar `ngrok http 8000`
y apuntar la config de Meta a esa URL mientras se prueba.

## Limitaciones conocidas del scaffold (a resolver antes de producción)

1. **Sesión en memoria** (`session_store.py`): se pierde si el proceso se reinicia y no
   funciona con más de una instancia corriendo en paralelo. Para producción real,
   reemplazar por Redis o una fila en base de datos — la interfaz de `obtener` /
   `guardar` / `reiniciar` ya está pensada para eso.
2. **Columna "Cantidad ref. Kangoo" en Universales**: en el piloto solo hay un vehículo
   con cantidad de aceite de referencia cargada, así que la columna quedó con ese nombre
   literal. Antes de sumar un segundo vehículo con litros de aceite distintos, hay que
   generalizar esa columna (una hoja "Vehículo x Universal x Cantidad", por ejemplo).
3. **Sin columna "Tipo de aceite" en Vehículos**: por eso el bot siempre pregunta qué
   aceite corresponde la primera vez. Si se agrega esa columna (con el ID del universal
   correcto, ej. `UNI-002`), el motor la usa directo y deja de preguntar.
4. **Matching de vehículo por texto libre**: `conversation_flow._match_vehiculos_en_texto`
   hace un matching simple por substring de marca/modelo. Funciona bien para los 10
   vehículos del piloto; con un catálogo más grande convendría o bien un buscador más
   robusto, o cambiar el flujo a listas guiadas (marca → modelo → motor) en vez de texto libre.
5. **Notificación a Comercial/Repuestos** (`conversation_flow._notificar_comercial`):
   hoy solo loguea. Falta conectar el canal real (mail, Slack, etc.) una vez que se
   decida cuál usar.
6. **Sin tests automatizados en el repo todavía**: la lógica se validó manualmente
   (ver sección siguiente) pero no hay un `pytest` corriendo en CI.

## Validación manual hecha

Se corrieron 4 casos contra `rules_engine.armar_presupuesto` con los datos reales del
Excel piloto (Kangoo 1.6 SCe / Don Torcuato / Service):
- Sin confirmar tipo de aceite → bloquea y pide confirmación (no inventa).
- Con 5W-30 confirmado → total s/IVA $299.227,79 / c/IVA $362.065,62.
- Con 10W-40 confirmado → total s/IVA $279.564,00.
- Motor no especificado con dos Kangoo cargadas (VEH-001 y VEH-004) → bloquea y pide
  confirmar cuál vehículo, en vez de asumir uno.
