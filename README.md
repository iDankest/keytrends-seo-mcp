# `@keytrends/seo-mcp` — Servidor MCP para SEO y Visibilidad en IA

Servidor MCP (*Model Context Protocol*) ejecutable mediante transporte `stdio` que conecta agentes de IA (como Cognitiv) con las capacidades analíticas de **Google Search Console** y rastreo técnico en vivo del sitio web, garantizando procedencia, nivel de confianza y trazabilidad métrica sin inventar datos.

---

## 1. Qué es y qué NO es

### Qué es:
- Un servidor MCP desacoplado, publicado como repo público `github:iDankest/keytrends-seo-mcp` (ejecutable hoy con `npx -y github:iDankest/keytrends-seo-mcp`) y publicable en npm como `@keytrends/seo-mcp`.
- Diseñado para conectarse directamente a **Cognitiv** mediante "Custom tool → stdio" sin requerir cambios de código en Cognitiv.
- Expone exactamente **7 herramientas especializadas** que cubren salud de configuración, resumen ejecutivo, rendimiento detallado, visibilidad en IA (AEO), páginas citadas por IA, inspección de indexación masiva y salud de sitemaps.
- Cada respuesta es un sobre JSON con metadatos de procedencia (`source`, `source_type`, `confidence`, `retrieved_at`) y advertencias metodológicas oficiales.
- Arquitectura desacoplada en proveedores intercambiables (`GscClient`, `AIVisibilityProvider`, `SitemapFetcher`, `IndexationInspector`).

### Qué NO es:
- **No inventa métricas de IA inexistentes en la API de Google**: la API oficial de Search Console (v1 rev. 20260902) **no** expone desgloses de AI Overviews ni AI Mode. El servidor documenta esto formalmente, advierte que las impresiones están incluidas en los totales WEB y habilita un proveedor basado en exportación CSV desde la UI de GSC.
- No es un proxy HTTP/SSE (el MVP opera exclusivamente en transporte estándar `stdio`).
- No realiza escrituras destructivas ni modificaciones en Search Console (`sitemaps.submit` está fuera del alcance).
- No depende de scrapers inestables de terceros para IA.

---

## 2. Conexión en Cognitiv

Para registrar `@keytrends/seo-mcp` en **Cognitiv**, navega a:
**Tools → Add tool → Custom tool**

Configura el formulario con estos valores exactos:

| Campo en Cognitiv | Valor |
| --- | --- |
| **Tool Name** | `Keytrends SEO MCP` |
| **Connection Type** | `stdio` |
| **Command** | `npx` |
| **Arguments** | `-y`<br>`github:iDankest/keytrends-seo-mcp` *(en líneas separadas)* |

*(Nota: `npx` descarga y ejecuta el paquete desde el repo público de GitHub en cada arranque en frío; no requiere publicación en npm. Cuando el paquete se publique en npm como `@keytrends/seo-mcp`, el argumento puede acortarse a `-y` + `@keytrends/seo-mcp`. Si el runner no resuelve paquetes scoped, usa los argumentos alternativos: `-y`, `-p`, `github:iDankest/keytrends-seo-mcp`, `keytrends-seo-mcp`.)*

### Variables de entorno (Credentials):

Añade las variables en la sección de credenciales de la herramienta personalizada:

```env
GSC_PROPERTY=sc-domain:tudominio.com
GOOGLE_CLIENT_ID=xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_REFRESH_TOKEN=1//xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

*Variables opcionales:*
```env
KEYTRENDS_SITE_URL=https://tudominio.com/
KEYTRENDS_AI_PROVIDER=auto
KEYTRENDS_AI_EXPORT_DIR=/ruta/a/exportaciones-ia
KEYTRENDS_LOG_LEVEL=info
KEYTRENDS_MAX_INSPECT_URLS=50
```

---

## 3. Catálogo de las 7 Herramientas

### 3.1. `keytrends_healthcheck`
Verifica credenciales, conectividad OAuth, permisos en la propiedad de GSC, sonda Search Analytics, accesibilidad del sitemap y estado del provider de IA.

- **Parámetros:**
  - `deep` (*boolean*, opcional, default: `true`): Si es `true`, ejecuta llamadas reales a la API.
- **Ejemplo de llamada:**
  ```json
  { "deep": true }
  ```
- **Ejemplo de respuesta:**
  ```json
  {
    "ok": true,
    "tool": "keytrends_healthcheck",
    "data": {
      "overall": "pass",
      "checks": [
        { "id": "env_config", "status": "pass", "detail": "Variables obligatorias presentes" },
        { "id": "oauth_token", "status": "pass", "detail": "Token de acceso OAuth2 obtenido correctamente", "latency_ms": 142 },
        { "id": "gsc_property_access", "status": "pass", "detail": "Propiedad accesible con nivel de permiso: SITE_OWNER", "latency_ms": 89 },
        { "id": "search_analytics_probe", "status": "pass", "detail": "Consulta de prueba Search Analytics ejecutada correctamente", "latency_ms": 210 },
        { "id": "sitemap_reachable", "status": "pass", "detail": "Entrypoint de sitemap detectado: https://keytrends.ai/sitemap_index.xml" },
        { "id": "ai_provider", "status": "warn", "detail": "Provider de IA none: la API oficial no expone métricas de IA generativa." }
      ],
      "capabilities": {
        "search_analytics": true,
        "url_inspection": true,
        "sitemaps_api": true,
        "ai_visibility": "unavailable_official"
      }
    }
  }
  ```

### 3.2. `keytrends_get_gsc_summary`
Resumen ejecutivo de métricas web oficiales (`clicks`, `impressions`, `ctr`, `position`), variaciones porcentuales frente al periodo contiguo anterior, desglose por dispositivo y top 5 países.

- **Parámetros:**
  - `range` (*string*, default: `'28d'`): `'7d'` | `'28d'` | `'90d'` | `'12mo'` | `'custom'`.
  - `start_date` (*string YYYY-MM-DD*, opcional).
  - `end_date` (*string YYYY-MM-DD*, opcional).
  - `compare_previous` (*boolean*, default: `true`).
  - `data_state` (*string*, default: `'FINAL'`): `'FINAL'` | `'ALL'`.
- **Ejemplo de llamada:**
  ```json
  { "range": "28d", "compare_previous": true }
  ```
- **Respuesta:**
  Incluye totales agregados, deltas comparativos, desglose de dispositivos y `ai_note` que clarifica que las impresiones de IA están computadas dentro del tipo de búsqueda WEB.

### 3.3. `keytrends_get_search_performance`
Consulta de rendimiento granular en Search Console agrupada por cualquier dimensión admitida.

- **Parámetros:**
  - `dimension` (*string*, default: `'QUERY'`): `'QUERY'` | `'PAGE'` | `'COUNTRY'` | `'DEVICE'` | `'DATE'` | `'SEARCH_APPEARANCE'`.
  - `search_type` (*string*, default: `'WEB'`): `'WEB'` | `'IMAGE'` | `'VIDEO'` | `'NEWS'` | `'DISCOVER'` | `'GOOGLE_NEWS'`.
  - `limit` (*number*, default: `25`, máx: `25000`).
  - `start_row` (*number*, default: `0`).
  - `filter` (*object*, opcional): `{ dimension, operator, expression }`. Operadores: `'EQUALS'`, `'NOT_EQUALS'`, `'CONTAINS'`, `'NOT_CONTAINS'`, `'INCLUDING_REGEX'`, `'EXCLUDING_REGEX'`.
- **Advertencias metodológicas automáticas:**
  Avisa cuando el recuento es cota inferior (filtrado de baja frecuencia por Google al agrupar por página o consulta) o que `SEARCH_APPEARANCE` es catálogo de resultados enriquecidos y no métricas de IA.

### 3.4. `keytrends_get_ai_visibility`
Consulta de visibilidad en IA generativa (AI Overviews y AI Mode) a través de la interfaz `AIVisibilityProvider` con contraste automático de los totales WEB oficiales.

- **Parámetros:**
  - `range` (*string*, default: `'28d'`).
  - `surface` (*string*, default: `'SEARCH'`): `'SEARCH'` | `'DISCOVER'`.
  - `include_timeseries` (*boolean*, default: `false`).
  - `granularity` (*string*, default: `'DAY'`): `'DAY'` | `'WEEK'` | `'MONTH'`.
- **Invariante garantizado:**
  Si no hay provider activo (`none`), devuelve `available: false`, las 4 opciones de activación, y **ningún cero numérico inventado**. Si hay exportación CSV activa (`gsc_export`), calcula `impressions`, `pages_count` y la cuota de visibilidad `ai_share_of_web_impressions`.

### 3.5. `keytrends_get_ai_pages`
Listado de páginas del sitio citadas o con impresiones en experiencias de IA generativa.

- **Parámetros:**
  - `surface` (*string*, default: `'SEARCH'`).
  - `limit` (*number*, default: `25`, máx: `1000`).
- **Respuesta:** URLs ordenadas descendentemente por impresiones con advertencia de límite de 1.000 filas de la interfaz de Search Console.

### 3.6. `keytrends_get_indexation`
Inspección masiva controlada de estado de indexación mediante la API de URL Inspection de Google.

- **Parámetros:**
  - `source` (*string*, default: `'SITEMAP'`): `'SITEMAP'` (autodetecta y extrae URLs del sitemap) o `'ARGS'` (array explícito).
  - `urls` (*array de strings*, obligatorio si `source: 'ARGS'`).
  - `max_urls` (*number*, default: `25`, acotado por `KEYTRENDS_MAX_INSPECT_URLS`).
  - `sampling` (*string*, default: `'FIRST'`): `'FIRST'` o `'RANDOM'`.
  - `seed` (*number*, default: `7`): Semilla determinista (mulberry32) para reproducibilidad del muestreo aleatorio.
  - `include_rows` (*boolean*, default: `true`).
- **Respuesta:** Distribución de recuentos (`verdict`, `coverage_state`, `indexing_state`, `robots_txt_state`, `page_fetch_state`), total de URLs con `PASS` y detalle fila a fila con reintento automático anti-rate limit.

### 3.7. `keytrends_get_sitemap_health`
Auditoría integral del sitemap comparando los sitemaps registrados en Google Search Console con el sitemap accesible en vivo mediante rastreo directo (live fetch).

- **Parámetros:**
  - `include_urls` (*boolean*, default: `false`).
  - `max_sub_sitemaps` (*number*, default: `50`).
- **Respuesta:** Comparativa de paths, cálculo de discrepancia entre URLs enviadas a Google y detectadas en vivo, y detección de sitemaps faltantes en GSC o caídos en el servidor. *(Nota: el campo `indexed` de la API de GSC está formalmente marcado como obsoleto por Google y no se reporta).*

---

## 4. Semántica de Procedencia y Confianza

Cada métrica devuelta por el servidor incluye metadatos de procedencia:

| `source_type` | Significado | Confianza habitual |
| --- | --- | --- |
| `official` | Obtenido directamente de la API REST oficial de Google Search Console. | `official` |
| `export` | Extraído de una exportación CSV oficial generada desde la interfaz web (UI) de Search Console. | `high` |
| `first_party` | Obtenido mediante petición HTTP directa al servidor del sitio web auditado (ej. sitemap.xml, robots.txt). | `high` |
| `third_party` | Proveedor externo independiente (reservado para futuras extensiones). | `medium` / `low` |
| `inferred` | Calculado por este servidor (ej. deltas de variación, agregados, ratios porcentuales). | `medium` |

---

## 5. Visibilidad en IA: Estado y Activación

### ¿Por qué la API oficial de Search Console no desglosa IA?
La API v1 de Google Search Console (revisión `20260902` del discovery document oficial) **no expone ningún tipo de búsqueda ni dimensión de IA generativa**. Los enums admitidos por la API son:
- `type`: `WEB`, `IMAGE`, `VIDEO`, `NEWS`, `DISCOVER`, `GOOGLE_NEWS`.
- `dimensions`: `DATE`, `QUERY`, `PAGE`, `COUNTRY`, `DEVICE`, `SEARCH_APPEARANCE`, `HOUR`.

Ninguno de estos campos permite segmentar impresiones exclusivas de AI Overviews ni AI Mode. **Google sí computa y agrega las impresiones y clics de IA dentro del tipo `WEB`**, pero no los separa en su API pública. El informe dedicado solo existe actualmente en la interfaz web de Search Console.

### Requisitos y Vías de Activación:
1. **Opción A (Disponible hoy - Provider `gsc_export`):**
   - Accede al informe de IA generativa en la UI de Google Search Console:
     - Search: `https://search.google.com/search-console/performance/search-analytics/ai`
     - Discover: `https://search.google.com/search-console/performance/discover/ai`
   - Pulsa en **Exportar → Descargar CSV**.
   - **Flujo URL (recomendado para Cognitiv):** publica los CSV en el repo privado
     [`iDankest/keytrends-gsc-ai-exports`](https://github.com/iDankest/keytrends-gsc-ai-exports) y configura el
     server por URL, sin depender de un directorio local del runner:
     1. Exporta el CSV de la tabla por fechas y por páginas desde la UI de GSC.
     2. Publica cada CSV (requiere `gh` CLI autenticado):
        ```bash
        node scripts/publish-ai-export.mjs Descargas/Tabla\ de\ fechas.csv --as search-dates
        node scripts/publish-ai-export.mjs Descargas/Tabla\ de\ páginas.csv --as search-pages
        ```
        El script imprime la línea `KEYTRENDS_AI_EXPORT_URL=<url1>,<url2>` lista para pegar.
     3. Crea un **PAT fine-grained de solo lectura**: `github.com/settings/personal-access-tokens`
        → **Generate new token** → *Fine-grained tokens* → Repository access: *Only select repositories* →
        `iDankest/keytrends-gsc-ai-exports` → Permissions → **Contents: Read-only**.
     4. En el panel de credenciales de la tool de Cognitiv añade:
        ```env
        KEYTRENDS_AI_PROVIDER=auto
        KEYTRENDS_AI_EXPORT_URL=<la línea que imprimió el script>
        KEYTRENDS_AI_EXPORT_TOKEN=github_pat_xxxxxxxxxxxx
        ```
     El provider descarga cada CSV con `Authorization: Bearer <token>` (tope 10 MB por fichero),
     clasifica por nombre canónico (`search-ai-dates.csv`, `search-ai-pages.csv`, `discover-ai-dates.csv`,
     `discover-ai-pages.csv`) y avisa en `provenance.notes` si el export tiene más de 30 días.
   - **Flujo directorio (solo ejecución local):**
     ```env
     KEYTRENDS_AI_PROVIDER=gsc_export
     KEYTRENDS_AI_EXPORT_DIR=/ruta/a/tus/csvs
     ```
     Si se configuran ambas, `KEYTRENDS_AI_EXPORT_URL` tiene prioridad sobre `KEYTRENDS_AI_EXPORT_DIR`.
2. **Opción B (Pendiente de publicación por Google):**
   - Que Google amplíe la API v1 o publique una API v2 con enums o recursos dedicados de IA. Este servidor MCP detectará la presencia releyendo el discovery de la API.
3. **Opción C (Exportación masiva a BigQuery):**
   - Si Google añade el `search_type` de IA a la exportación programada de Search Console a BigQuery (actualmente limitado a `web`, `image`, `video`, `news`, `discover`, `googleNews`).
4. **Requisito de elegibilidad del sitio web:**
   - Para que un sitio aparezca en AI Overviews debe estar indexado, permitir fragmentos (sin directivas `nosnippet` ni `max-snippet: 0`) y no haber solicitado exclusión en la configuración de IA generativa de Search Console (`https://search.google.com/search-console/settings/search-gen-ai`).

---

## 6. Modo Healthcheck CLI

El servidor incluye un modo de diagnóstico ejecutable sin iniciar el protocolo MCP:

```bash
npx -y github:iDankest/keytrends-seo-mcp --healthcheck
```

- Salida: Informe JSON completo en `stdout` detallando cada comprobación, latencias y capacidades activas.
- Código de salida:
  - `0`: Configuración válida (`pass` o `warn`).
  - `1`: Faltan variables obligatorias o fallo en las pruebas de conectividad (`fail`).

---

## 7. Referencia Completa de Variables de Entorno

| Variable | Obligatoria | Default | Descripción |
| --- | --- | --- | --- |
| `GSC_PROPERTY` | Sí (para tools GSC) | — | Identificador de la propiedad en GSC (`sc-domain:midominio.com` o `https://midominio.com/`). |
| `GOOGLE_CLIENT_ID` | Sí | — | Client ID de la credencial OAuth 2.0 en Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | Sí | — | Client Secret de la credencial OAuth 2.0. |
| `GOOGLE_REFRESH_TOKEN` | Sí | — | Refresh token con scope `https://www.googleapis.com/auth/webmasters.readonly`. |
| `KEYTRENDS_SITE_URL` | No | Derivado de `GSC_PROPERTY` | Origen público del sitio web con barra final para peticiones directas. |
| `KEYTRENDS_SITEMAP_URL` | No | Autodetectado | Entrypoint explícito del sitemap si no sigue las convenciones estándar. |
| `KEYTRENDS_AI_EXPORT_DIR` | No | — | Ruta absoluta o relativa al directorio con exportaciones CSV de la UI de GSC (solo ejecución local). |
| `KEYTRENDS_AI_EXPORT_URL` | No | — | Lista de URLs (separadas por comas) de los CSV del informe de IA en `iDankest/keytrends-gsc-ai-exports`. Tiene prioridad sobre `KEYTRENDS_AI_EXPORT_DIR`. Generada por `scripts/publish-ai-export.mjs`. |
| `KEYTRENDS_AI_EXPORT_TOKEN` | Sí (solo con `KEYTRENDS_AI_EXPORT_URL`) | — | PAT fine-grained de GitHub de solo lectura (Contents: Read-only) sobre el repo de datos. |
| `KEYTRENDS_LOG_LEVEL` | No | `info` | Nivel de registro a stderr: `silent`, `error`, `warn`, `info`, `debug`. |
| `KEYTRENDS_HTTP_TIMEOUT_MS` | No | `20000` | Timeout máximo en milisegundos por petición HTTP saliente. |
| `KEYTRENDS_MAX_INSPECT_URLS` | No | `50` | Límite máximo de seguridad para URLs inspeccionadas por lote. |

---

## Licencia

MIT © Keytrends
