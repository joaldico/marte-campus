# 1. Intención del Producto (Intent) — Campus Marte (prueba Beonit)

> **Fase SDD:** `1/4 — Intent`
> **Estado:** `🟡 En revisión — pendiente de aprobación (v1.0.0)`
> **Versión:** `1.0.0`
> **Última actualización:** 2026-09-16
> **Autor(es):** Josué Díaz Contreras
> **Contexto:** Prueba técnica Full Stack (Vue 3 · NestJS · PostgreSQL · TypeScript) para Beonit. Entrega = repositorio GitHub que arranca con `docker compose up` en máquina limpia. Demo pública en subdominio propio para que el evaluador no dependa de clonar si no quiere.

---

## 1.1. Declaración de Intención (Elevator Pitch)

```text
Construir un campus de formación en vídeo donde el progreso de un alumno es
el tiempo de vídeo realmente reproducido — no el seek, no el reloj, no el
doble conteo — calculado siempre en el servidor. Los alumnos ven el catálogo
publicado, se apuntan y reproducen capítulos con una barra de tramos vistos.
Los administradores crean cursos, ordenan capítulos, recorren una máquina de
estados estricta y versionan sin romper lo que ya está publicado. Arranca
con un comando, se recarga de cero, se documenta en DECISIONS.md y se
despliega en https://beonittest.josuediazcontreras.com.
```

---

## 1.2. Problema a Resolver

| Campo | Descripción |
|---|---|
| **Problema central** | Una plataforma de cursos en vídeo (curso → capítulos → un vídeo cada uno) donde “progreso” suele mentir: el cliente marca visto al hacer seek, cuenta dos veces el mismo tramo, o pierde el visionado al cerrar la pestaña. El enunciado exige progreso **real** (unión de intervalos reproducidos, persistido, reanudable) y una administración con estados y versiones que el servidor no puede saltarse. |
| **Afectados** | Evaluadores de la prueba (criterio de cero automático si el progreso vive en el cliente o `docker compose up` falla); alumnos de demo (Bruno, Carla, Diego); administradora (Ana). |
| **Costo de no actuar** | Cero automático en la prueba; salario objetivo (~50 k€ vs 35 k€ actuales) fuera de alcance. |
| **Soluciones actuales** | Ninguna en este repo (workspace vacío). El enunciado aporta seed (usuarios, vídeos de archive.org, cursos, inscripciones, CSV de eventos con casos sucios a propósito). |

---

## 1.3. Visión de la Solución

Aplicación web desacoplada: SPA Vue 3 + API NestJS + PostgreSQL, todo TypeScript, todo contenedorizado.

- **Qué hará (MVP = parte obligatoria 3.1–3.4, ni un bonus más):**
  - Seed reproducible: 4 usuarios, 6 vídeos, 3 cursos, inscripciones y eventos de reproducción (incluidos los sucios: duplicados, solapes, intervalo invertido, vídeo inexistente `rio`, evento de no inscrito, evento sobre curso no publicado).
  - Login sin contraseña: se elige un usuario de una lista. El servidor emite una sesión; el cliente no calcula progreso.
  - Catálogo alumno: cursos **publicados**; progreso solo en los que está apuntado; apuntarse; entrar a un curso inscrito.
  - Reproductor: vídeo del capítulo, lista de capítulos, barra de tramos ya vistos, registro de eventos mientras reproduce, resume al último segundo, no pierde progreso al cerrar pestaña.
  - Administración: todos los cursos y estados; crear curso; añadir capítulos (título + URL); reordenar arrastrando; transiciones de estado **solo las documentadas**; no publicar sin capítulos; retirado no admite altas; editar publicado → nueva versión en borrador; alumnos siguen en la versión publicada hasta republicar.
  - Importación CSV de eventos (formato 3.1) y, tras importar, heatmap por vídeo (tramos más vistos vs más saltados) en admin.
  - OpenAPI/Swagger generado desde el código Nest; dominio con interfaces/puertos limpios (progreso, estados, versiones).
  - UI con librería de componentes (no diseño desde cero) + logo personal de Josué.
  - Entrega local: `docker-compose.yml`, `README.md`, `DECISIONS.md`.
  - Entrega demo: GitHub Actions (cuenta `joaldico`) → GHCR → misma EC2 y `proxy-reverse` que `josue-diaz-web`.
- **Qué NO hará (anti-objetivos del MVP):**
  - Bonus: subida mp4, subtítulos/búsqueda, heatmap en el reproductor alumno, revisor ≠ autor, E2E que arranquen el compose (si sobra tiempo **después** del MVP verde, se reabre el intent).
  - Auth con contraseña, OAuth, JWT de producción, multi-tenant.
  - Microservicios, Kubernetes, RDS gestionado, CDN de vídeo propio.
  - Calcular progreso, “capítulo visto” o heatmap en el cliente (el cliente solo pinta lo que el API devuelve).
  - Aceptar transiciones de estado no listadas en este producto / spec.

- **Diferenciador clave (lo que puntúa):** `DECISIONS.md` honesto (qué se decidió, qué se descartó, por qué) + progreso correcto en servidor + `docker compose up` en máquina limpia sin errores de consola.

---

## 1.4. Usuarios y Stakeholders

| Actor | Tipo | Necesidad principal | Nivel de impacto |
|---|---|---|---|
| **Alumno** (Bruno, Carla, Diego) | Primario | Ver publicados, apuntarse, reproducir, ver su progreso real, retomar donde lo dejó. | Crítico |
| **Administradora** (Ana) | Primario | CRUD de cursos/capítulos, máquina de estados, versiones, importar eventos, ver heatmap. | Crítico |
| **Evaluador Beonit** | Primario | Clonar, `docker compose up`, recorrer flujos sin consola en rojo, leer DECISIONS.md. | Crítico |
| **Josué (candidato)** | Secundario | Demo pública HTTPS con su marca (logo + subdominio) y pipeline igual al de su web. | Alto |

---

## 1.5. Objetivos de Negocio y Métricas de Éxito

| ID | Objetivo | Métrica (KPI) | Valor objetivo | Plazo |
|---|---|---|---|---|
| **OBJ-01** | Arranque en máquina limpia | `docker compose up` deja UI + API + DB + seed listos | 1 comando, sin pasos extra no documentados | MVP |
| **OBJ-02** | Recarga de datos a cero | Comando documentado (p. ej. `docker compose down -v && docker compose up`) restaura seed | Idéntico al 3.1 | MVP |
| **OBJ-03** | Cero automático evitado: progreso en servidor | Ningún endpoint de progreso/visto/heatmap se deriva solo en el cliente | 100% de las reglas en API | MVP |
| **OBJ-04** | Cero automático evitado: estados | Toda transición ilegal → 4xx con mensaje claro | 0 transiciones fantasma | MVP |
| **OBJ-05** | Consola limpia en uso normal | 0 errores en consola browser / logs API en el happy path | 0 | MVP |
| **OBJ-06** | Persistencia al cerrar pestaña | Eventos flushed lo bastante a menudo como para no perder tramos al kill del tab | Tramos enviados ≤ umbral documentado | MVP |
| **OBJ-07** | Demo pública | `https://beonittest.josuediazcontreras.com` sirve el campus con TLS | HTTP 200 + login usable | Mismo MVP |
| **OBJ-08** | OpenAPI | Swagger UI en `/api/docs` refleja los contratos reales | 1 fuente de verdad | MVP |

---

## 1.6. Restricciones Globales

- **Stack impuesto por el enunciado:** Vue 3, NestJS, PostgreSQL, TypeScript. Librerías libres.
- **UI:** librería de componentes Vue 3 (propuesta: Naive UI; ver enfoques). Logo: `josue-diaz-web/public/logo.png`.
- **Login de prueba:** sin contraseña; lista de usuarios. Sesión emitida por el servidor (cookie httpOnly o token opaco). El id de usuario elegido **no** autoriza a calcular progreso en el cliente.
- **Vídeos:** URLs de `archive.org` del PDF (las de los hipervínculos, no el texto recortado). El reproductor debe funcionar pese a CORS/Range; si archive.org bloquea, proxy de rangos en API documentado en DECISIONS.md.
- **Idioma UI:** español (el enunciado y los evaluadores están en ES).
- **CI/CD:** GitHub Actions en cuenta personal `joaldico`, mismo patrón que `josue-diaz-web`: runner `[self-hosted, Linux, X64]`, push a `ghcr.io`, `docker compose up -d` en la EC2.
- **Producción:** reutilizar la EC2 y `proxy-reverse` (puertos libres tras 3000/3001/3002). Subdominio `beonittest.josuediazcontreras.com` + certbot Let's Encrypt. Postgres **solo en red Docker**, no publicado a internet.
- **Calidad:** TDD en reglas de dominio (unión de intervalos, 90 %, máquina de estados, importación sucia). OpenAPI generado, no escrito a mano y olvidado.
- **Entrega GitHub:** repo en `joaldico` (nombre propuesto: `marte-campus`). En raíz: `docker-compose.yml`, `README.md`, `DECISIONS.md`.
- **Presupuesto / tiempo:** fast-track. Obligatorio pulido > bonus. Una decisión bien explicada pesa más que una feature extra.

---

## 1.7. Supuestos y Riesgos Iniciales

| ID | Tipo | Descripción | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|---|
| **RSK-01** | Riesgo | CORS / Range requests de `archive.org` rompen el `<video>` o llenan la consola (cero por errores). | Alta | Crítico | Probar URLs reales al inicio; si fallan, el API hace proxy de bytes con `Accept-Ranges`. Documentar en DECISIONS.md. |
| **RSK-02** | Riesgo | Seed sucio mal interpretado (evento invertido, `rio`, Diego no inscrito, Bruno en `atardecer` no publicado). | Alta | Alto | Reglas explícitas en spec; tests que clavan el comportamiento; no “arreglar” el CSV en silencio. |
| **RSK-03** | Riesgo | Calcular progreso en el cliente “por UX” y suspender. | Media | Crítico | Contrato: el cliente envía `(videoId, from, to, rate, at)` y pinta `watchedRanges` del servidor. Lint/revisión de que no haya `reduce` de progreso en Vue. |
| **RSK-04** | Riesgo | Cerrar pestaña pierde eventos (buffer en memoria). | Media | Alto | Beacon/`visibilitychange` + heartbeat cada N segundos + flush al `pause`. Posición de resume persistida en servidor. |
| **RSK-05** | Riesgo | Máquina de estados incompleta → el servidor acepta un cambio no documentado (cero). | Media | Crítico | Enum + tabla de transiciones en spec; cualquier otro par `from→to` = 409/400. |
| **RSK-06** | Riesgo | Versionar un publicado y romper progreso de inscritos. | Media | Alto | Alumnos anclados a `publishedVersionId`. Al publicar la nueva, política de remap por **identidad de vídeo**, no por orden de capítulo (DETALLE en spec). |
| **RSK-07** | Riesgo | `docker compose up` en limpio falla (migraciones, seed, wait de Postgres). | Media | Crítico | Healthchecks, seed idempotente al arrancar API, README con recarga `-v`. |
| **RSK-08** | Riesgo | Subdominio/cert/DNS bloquea la demo. | Baja | Medio | El evaluador **no depende** de la demo: el compose local es el entregable. La demo es extra. |
| **SUP-01** | Supuesto | Duración de cada vídeo se puede leer (HEAD/ffprobe o metadata al seed). Necesaria para el 90 %. | — | — | Seed guarda `durationSeconds` medido; si un URL nuevo no da duración, el capítulo no se puede marcar visto hasta conocerla. |
| **SUP-02** | Supuesto | Transiciones de estado del enunciado: `borrador → en revisión → publicado → retirado`, más volver atrás razonables que **hay que fijar** en spec (el enunciado dice que lo no escrito se rechaza). | — | — | Lista cerrada en `2_spec.md`; nada de “supongo que de publicado se puede volver a revisión”. |
| **SUP-03** | Supuesto | El runner self-hosted de `joaldico` sigue activo en la EC2 (como en `josue-diaz-web` y `proxy-reverse`). | — | — | El workflow copia ese `runs-on`. Si el runner está caído, se documenta el fallback. |
| **SUP-04** | Supuesto | DNS del dominio `josuediazcontreras.com` admite un registro A/CNAME de subdominio hacia la misma IP pública de la EC2. | — | — | Alta en Route53 o registrador en la fase de infra; certbot webroot ya usado en el proxy. |

---

## 1.8. Decisiones de producto ya cerradas (esta conversación)

1. **Alcance = obligatorio 3.1–3.4.** Bonus fuera del primer plan.
2. **UI = librería**, no diseño pixel-perfect desde cero. Logo personal en header.
3. **CI/CD = GitHub Actions cuenta personal**, patrón `josue-diaz-web` (GHCR + compose + runner self-hosted).
4. **Demo = subdominio** `beonittest.josuediazcontreras.com` detrás de `proxy-reverse`.
5. **SDD =** `.specify/1_intent.md` → `2_spec.md` → `3_plan.md` → `4_tasks.md`, ejecución TDD, artifacts HTML de lo hecho.
6. **IA permitida** por el enunciado; no se oculta en DECISIONS.md tampoco se hace teatro: se explican decisiones de dominio.

---

## 1.9. Glosario del Dominio

| Término | Definición |
|---|---|
| **Curso** | Contenedor versionado de capítulos, con estado de ciclo de vida. |
| **Capítulo** | Unidad pedagógica: título + URL de vídeo + orden dentro de una versión. |
| **Versión de curso** | Instantánea inmutable una vez publicada. Editar un publicado crea otra versión en borrador. |
| **Evento de reproducción** | `(usuario, vídeo, desde, hasta, velocidad, fecha)`. Hecho bruto. Puede ser inválido. |
| **Tramo visto** | Intervalo `[from, to)` en **tiempo de vídeo** (no de reloj) atribuible a un usuario+vídeo tras validar y unir. |
| **Progreso de capítulo** | `union(tramos) / duration`. “Visto” si ≥ 0.90. Ver dos veces no suma. Seek no genera tramo. x2 cuenta segundos de vídeo. |
| **Progreso de curso** | Agregado del progreso de sus capítulos (fórmula exacta en spec). |
| **Heatmap** | Histograma de cobertura de un vídeo a partir de eventos (cuánto se ve / se salta cada segundo). |
| **Máquina de estados** | Grafo dirigido cerrado de estados de curso; arista ausente = rechazo del servidor. |

---

## 1.10. Criterios de cero del enunciado (innegociables)

| Cero si… | Cómo lo evitamos |
|---|---|
| No arranca con `docker compose up` en limpio | Compose + healthchecks + seed al boot + README |
| Falta `docker-compose.yml`, `README.md` o `DECISIONS.md` vacío | Tarea explícita de entrega; DECISIONS se escribe **durante**, no al final |
| El servidor acepta un cambio de estado no documentado | Tabla cerrada + tests de rechazo |
| El progreso se calcula en el cliente | Motor `ProgressCalculator` en Nest, cubierto por tests |
| Errores en consola en uso normal | Proxy de vídeo si hace falta; toasts de API; sin 404 de favicon/logo |

---

## ✅ Criterio de salida de fase (Gate)

- [x] Elevator pitch inequívoco: progreso real en servidor + admin con estados/versiones + compose + demo.
- [x] Anti-objetivos: bonus fuera; no auth “de producción”; no progreso en Vue.
- [x] Stakeholders del concurso (evaluador) y de la demo (subdominio) explícitos.
- [x] Riesgo CORS/archive.org y seed sucio promovidos a requisitos, no a notas a pie.
- [ ] **Aprobación de Josué de la v1.0.0** (UI concreta + transiciones de estado se cierran en `2_spec.md`).

> **Siguiente fase (bloqueada hasta aprobación de enfoques UI + estados):** [`2_spec.md`](./2_spec.md) — contratos, Gherkin, seed sucio, máquina de estados cerrada, política de progreso al republicar.
