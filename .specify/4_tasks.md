# 4. Desglose de Tareas (Tasks) — Campus Marte

> **Fase SDD:** `4/4 — Task Breakdown`
> **Estado:** `🟡 Listo para ejecutar (v1.0.0)`
> **Versión:** `1.0.0`
> **Última actualización:** 2026-09-16
> **Trazabilidad:** ejecuta [`3_plan.md`](./3_plan.md) v1.0.0, verifica [`2_spec.md`](./2_spec.md) v1.0.0
> **Ejecución:** TDD estricto en dominio (M2) y HTTP (M3+). Orden estricto **dentro** de cada hito. Commits frecuentes en `joaldico/marte-campus`.
> **Para agentes:** usar subagent-driven-development o executing-plans; cada tarea acaba en test verde + commit.

---

## 4.1. Convenciones

- **ID:** `T-<hito>.<n>`. El número ES el orden.
- **TDD:** test que falla → código mínimo → verde. Dominio sin Nest.
- **DoD global:** types strict, sin progreso calculado en `web/`, OpenAPI no se desvía del DTO, DECISIONS.md se actualiza si se descarta algo.
- **Est.:** S ≤ 30 min · M ≤ 90 min · L sesión larga (partir si crece).

---

## 4.2. Hitos

| Hito | Nombre | Gate verificable | BDD | Estado |
|---|---|---|---|---|
| **M1** | Repo, compose, health | `docker compose up` → GET `/api/health` 200 `{db:ok}`; web en :80 | — | ⏳ |
| **M2** | Dominio puro | Tests de unión, ingest sucio, estados, heatmap verdes **sin** DB | CA-03, CA-06 (unidad) | ⏳ |
| **M3** | Auth + seed | Login lista, cookie, seed 4 usuarios / 6 vídeos / 3 cursos / eventos | CA-01 | ⏳ |
| **M4** | Catálogo + enroll + progreso leído | Bruno/Carla/Diego como spec | CA-02, CA-03 | ⏳ |
| **M5** | Reproductor + flush | Ranges del API, cursor, beacon | CA-04 | ⏳ |
| **M6** | Admin + estados + drag + versiones | 409 en transiciones ilegales | CA-05, CA-06, CA-07 | ⏳ |
| **M7** | Import + heatmap + Swagger | CSV 3.1 + `/api/docs` | CA-08 | ⏳ |
| **M8** | Entrega: README, DECISIONS, CI, demo | Ceros del enunciado cubiertos; subdominio | OBJ-01..08 | ⏳ |

Bonus (§4 del PDF) = hito **M9 opcional**, no se abre hasta M8 verde.

---

## 4.3. Backlog

### M1 — Fundaciones

| ID | Tarea | Traza | Dep. | Est. | DoD |
|---|---|---|---|---|---|
| T-1.1 | Scaffold `api/` Nest + Prisma + Vitest/Jest + TS strict | ADR-001/003 | — | M | `npm test` 0 tests OK; `tsc --noEmit` |
| T-1.2 | Scaffold `web/` Vite Vue 3 + Naive UI + Router + logo copiado | ADR-005 | — | M | `npm run build` |
| T-1.3 | `GET /health` + Prisma `SELECT 1` | RNF-01 | T-1.1 | S | Test HTTP 200 `{ status:'ok', db:'ok' }` |
| T-1.4 | Dockerfiles multi-stage + `docker-compose.yml` (db healthcheck, api migrate, web nginx `/api` proxy) | ADR-009, RNF-01 | T-1.2, T-1.3 | M | `docker compose up` sirve `/` y `/api/health` |
| T-1.5 | Spike CORS de las 6 URLs archive.org (script). Si falla, `VIDEO_PROXY=true` en compose | ADR-006, RSK-01 | T-1.4 | S | Nota en DECISIONS.md: proxy sí/no + evidencia |
| T-1.6 | Probe duraciones → constantes en `prisma/seed.ts` | spec 2.2.2 | T-1.5 | S | 6 `durationSeconds` commiteados |

### M2 — Dominio (TDD primero, sin HTTP)

| ID | Tarea | Traza | Dep. | Est. | DoD |
|---|---|---|---|---|---|
| T-2.1 | `ProgressEngine.merge` + `uniqueSeconds` | spec 2.5, CA-03 | T-1.1 | M | Tabla: cascada Bruno = 10; playa Carla = 10; duplicado no suma |
| T-2.2 | `chapterProgress` 90 % + `courseProgress` media | spec 2.5 | T-2.1 | S | duration 10, unique 9 → completed; 8.9 → no |
| T-2.3 | `PlaybackIngestor` (invertido, nan, unknown video, rate≤0) | spec 2.2.4, 2.9 | T-2.1 | M | 8–2 → `inverted_interval`; `rio` → `unknown_video` |
| T-2.4 | `CourseStateMachine` solo 3 aristas legales | spec 2.6, CA-06 | T-1.1 | M | cada par ilegal lanza `STATE_TRANSITION_FORBIDDEN`; empty publish → `COURSE_EMPTY` |
| T-2.5 | `HeatmapEngine` buckets 1 s | spec 2.9, CA-08 | T-2.1 | S | hueco en segundo 7 de cascada Bruno |

**Test canónico T-2.1 (escribir primero):**

```ts
it('Bruno cascada seed unions to 10s', () => {
  const merged = merge([
    { from: 0, to: 4 },
    { from: 3, to: 7 },
    { from: 8, to: 11 },
    { from: 0, to: 4 },
  ]);
  expect(uniqueSeconds(merged)).toBe(10);
});
```

### M3 — Auth, esquema, seed

| ID | Tarea | Traza | Dep. | Est. | DoD |
|---|---|---|---|---|---|
| T-3.1 | `schema.prisma` = ER de spec 2.10 + migrate | spec 2.10 | T-1.4 | M | migrate up/down en CI |
| T-3.2 | Seed usuarios, vídeos (URLs completas), cursos, enrollments, eventos con `accepted`/`rejectReason` | spec 2.2 | T-3.1, T-1.6, T-2.3 | L | Tras seed, uniqueSeconds Bruno cascada = 10 vía query+engine |
| T-3.3 | `GET /auth/users` + `POST /auth/login` cookie + `GET /me` + logout | RF-01, CA-01, ADR-004 | T-3.2 | M | CA-01 HTTP verde |
| T-3.4 | LoginPage Naive UI + logo + router guard | RNF-08 | T-1.2, T-3.3 | M | Elegir Bruno entra al catálogo (puede ser stub) |
| T-3.5 | Swagger bootstrap `/api/docs` (esqueleto) | ADR-007 | T-3.3 | S | UI carga |

### M4 — Catálogo

| ID | Tarea | Traza | Dep. | Est. | DoD |
|---|---|---|---|---|---|
| T-4.1 | `GET /catalog/courses` solo published + progress si enrolled | RF-02/04, CA-02 | T-3.2, T-2.2 | M | Diego sin progress; Bruno con ratios |
| T-4.2 | `POST .../enroll` + 409 retired/not published | RF-03 | T-4.1 | M | Diego enroll → playa 10 s visibles |
| T-4.3 | `GET /catalog/courses/:id` capítulos versión publicada | CA-02 | T-4.1 | M | Paisajes II 403/404 para alumno |
| T-4.4 | CatalogPage + CoursePage (Naive cards/tags, **pintan JSON**) | RF-02 | T-3.4, T-4.3 | M | No hay `union` en Vue (grep gate) |

**Grep gate (DoD T-4.4 y T-5.3):** `rg "uniqueSeconds|0\\.9|merge\\(" web/src` → 0 hits de negocio.

### M5 — Reproductor

| ID | Tarea | Traza | Dep. | Est. | DoD |
|---|---|---|---|---|---|
| T-5.1 | `GET /player/chapters/:id` + stream/proxy según T-1.5 | RF-05, ADR-006 | T-4.3 | M | 200 con url, ranges, cursor |
| T-5.2 | `POST /playback/events` + `PATCH /playback/cursor` | RF-06/07 | T-2.3, T-5.1 | M | CA-04 HTTP: 10–12 une a [0,12) |
| T-5.3 | PlayerPage: `<video>`, barra ranges, heartbeat 5s, seeked cierra tramo, pagehide keepalive | CA-04, plan 3.6 | T-5.2 | L | Consola limpia en happy path |
| T-5.4 | Resume: `currentTime = cursor` en loadedmetadata | RF-05 | T-5.3 | S | Carla playa arranca en 10 |

### M6 — Admin

| ID | Tarea | Traza | Dep. | Est. | DoD |
|---|---|---|---|---|---|
| T-6.1 | CRUD admin cursos/capítulos + order PATCH | RF-08/09, CA-05 | T-3.3 | L | Guard role=admin |
| T-6.2 | `POST .../transition` tabla §2.6 | RF-10/11, CA-06 | T-2.4, T-6.1 | M | Todos los 409 del Gherkin |
| T-6.3 | Clone working version al editar published + submit/publish revision | RF-12/13, CA-07 | T-6.1 | L | Bruno no ve título nuevo hasta publish; progreso playa intacto |
| T-6.4 | UI admin: tabla, detalle, drag, botones **solo legales** | CA-05/06 | T-6.2, T-6.3 | L | Forzar fetch ilegal sigue 409 |
| T-6.5 | Retired bloquea enroll | RF-03 | T-6.2, T-4.2 | S | 409 `COURSE_RETIRED` |

### M7 — Import, heatmap, OpenAPI cerrado

| ID | Tarea | Traza | Dep. | Est. | DoD |
|---|---|---|---|---|---|
| T-7.1 | `POST /admin/events/import` CSV 3.1 | RF-14, CA-08 | T-2.3, T-6.1 | M | conteos accepted/rejected = spec 2.2.4 |
| T-7.2 | `GET /admin/videos/:id/heatmap` | RF-14 | T-2.5, T-7.1 | M | cascada hueco t=7 |
| T-7.3 | AdminHeatmapPage barra | CA-08 | T-7.2 | M | Una línea por vídeo |
| T-7.4 | Completar decoradores Swagger = mapa spec 2.8 | RF-15 | T-5.2, T-6.2, T-7.2 | M | `/api/docs` lista todos los endpoints |

### M8 — Entrega y demo

| ID | Tarea | Traza | Dep. | Est. | DoD |
|---|---|---|---|---|---|
| T-8.1 | README: up, recarga `-v`, usuarios, URLs, Swagger, demo | enunciado §5 | T-1.4 | S | Un evaluador no pregunta |
| T-8.2 | DECISIONS.md = spec 2.13 + spike T-1.5 + duraciones | enunciado §5 | T-1.5 | M | No está vacío (cero) |
| T-8.3 | `ci.yml` lint+test+build | plan 3.7 | T-7.4 | M | PR verde |
| T-8.4 | `deploy.yml` + `docker-compose.prod.yml` patrón josue-diaz-web | ADR-008 | T-8.3 | M | Push main despliega |
| T-8.5 | DNS A `beonittest` + certbot + server block `proxy-reverse` | OBJ-07 | T-8.4 | M | HTTPS 200 login |
| T-8.6 | Artifact HTML `artifacts/index.html` (mapa SDD + cómo probar CA) | pedido Josué | T-8.2 | S | Abrir en browser |
| T-8.7 | Recorrido manual CA-01..08 + consola limpia | ceros | T-8.1 | M | Checklist en README |

---

## 4.4. Orden de ejecución inmediato

`T-1.1 → T-1.2 → T-1.3 → T-1.4 → T-1.5 → T-1.6 → T-2.1 …`

No mezclar UI admin (M6) antes de dominio (M2): el cero de progreso se juega en M2/M4/M5.

---

## 4.5. Handoff de ejecución

Plan de implementación listo en `.specify/4_tasks.md`.

**Opciones:**

1. **Subagent-driven (recomendado)** — un subagente por tarea, review entre tareas.
2. **Inline** — esta sesión, TDD, checkpoints por hito.

Arrancar por **T-1.1** en cuanto se dé el ok.

---

## Global Constraints

- Stack: Vue 3, NestJS, PostgreSQL, TypeScript strict.
- UI: Naive UI + `web/public/logo.png` (copiar de `/home/terraque/0_Josue_Proyectos/Proyectos/josue-diaz-web/public/logo.png`).
- Progreso, 90 %, heatmap y máquina de estados: **solo** en `api/src/domain/**`, cero `@nestjs/*` ahí, cero cálculo en `web/`.
- Estados de curso legales: `draft→in_review`, `in_review→published` (≥1 capítulo), `published→retired`. Cualquier otro par = `STATE_TRANSITION_FORBIDDEN`.
- Login sin contraseña: cookie de sesión, user de la sesión nunca del body (salvo import admin).
- OpenAPI generado (`@nestjs/swagger`) en `/api/docs`.
- `docker compose up` en raíz es el entregable. Recarga: `docker compose down -v && docker compose up --build`.
- No bonus del enunciado §4 hasta M8 verde.
- Commits en rama `feat/mvp`. No push a `main`. No `git config`.
- Work from the git worktree path given in the dispatch.

---

## SDD task headings (machine-readable)

### Task 1: Scaffold api/ Nest + Prisma + test runner + TS strict

**ID:** T-1.1  
**Files:**
- Create: `api/package.json`, `api/tsconfig.json`, `api/nest-cli.json`, `api/src/main.ts`, `api/src/app.module.ts`, `api/prisma/schema.prisma` (datasource PostgreSQL + generator client only; **no domain models** — those are Task 12 / T-3.1)
- Create: Jest or Vitest config so `npm test` exits 0
- Do **not** create Docker, health endpoint (Task 3), or Vue app (Task 2)

**DoD:** `cd api && npx tsc --noEmit` exits 0. `cd api && npm test` exits 0 (empty suite is OK; do not add a dummy `expect(true)`). Nest 10+ in TypeScript. Prisma installed, `schema.prisma` has `datasource db { provider = "postgresql" url = env("DATABASE_URL") }` and generator client.

**Tests:** none required beyond the runner succeeding.

### Task 2: Scaffold web/ Vite Vue 3 + Naive UI + Router + logo

**ID:** T-1.2  
**Files:** `web/` Vite Vue 3 TS, Vue Router, Naive UI, `web/public/logo.png` copied from `/home/terraque/0_Josue_Proyectos/Proyectos/josue-diaz-web/public/logo.png`. Minimal App.vue that shows the logo. Do not implement login/catalog.

**DoD:** `cd web && npm run build` exits 0.

### Task 3: GET /health + Prisma SELECT 1

**ID:** T-1.3  
**DoD:** HTTP test 200 `{ status:'ok', db:'ok' }`. Health can skip real DB if DATABASE_URL missing and report db accordingly — prefer a test that mocks Prisma `$queryRaw` SELECT 1.

### Task 4: Dockerfiles + docker-compose.yml

**ID:** T-1.4  
**DoD:** `docker compose up` serves `/` and `/api/health`. db healthcheck, api waits for db, nginx proxies `/api` to api.

### Task 5: Spike CORS archive.org

**ID:** T-1.5  
**DoD:** Script against the 6 video URLs in spec 2.2.2. Write `DECISIONS.md` note: proxy yes/no + evidence. If CORS fails, document `VIDEO_PROXY=true`.

### Task 6: Probe durations into prisma/seed.ts constants

**ID:** T-1.6  
**DoD:** 6 `durationSeconds` committed in `api/prisma/seed.ts` (seed may be a stub that only exports constants until T-3.2).

### Task 7: ProgressEngine.merge + uniqueSeconds

**ID:** T-2.1  
**Files:** `api/src/domain/progress.ts`, `api/test/domain/progress.spec.ts`  
**TDD required.** Canonical test:

```ts
it('Bruno cascada seed unions to 10s', () => {
  const merged = merge([
    { from: 0, to: 4 },
    { from: 3, to: 7 },
    { from: 8, to: 11 },
    { from: 0, to: 4 },
  ]);
  expect(uniqueSeconds(merged)).toBe(10);
});
```

Also: Carla playa `[5,10)+[0,5)+[2,4)` = 10. No Nest imports in domain.

### Task 8: chapterProgress 90% + courseProgress average

**ID:** T-2.2  
duration 10, unique 9 → completed; 8.9 → not. courseProgress = arithmetic mean of chapter ratios.

### Task 9: PlaybackIngestor

**ID:** T-2.3  
8–2 → `inverted_interval`; `rio` → `unknown_video`; nan/negative; rate≤0.

### Task 10: CourseStateMachine

**ID:** T-2.4  
Only 3 legal edges. Every illegal pair throws `STATE_TRANSITION_FORBIDDEN`. Empty publish → `COURSE_EMPTY`.

### Task 11: HeatmapEngine 1s buckets

**ID:** T-2.5  
Bruno cascada: second 7 skipWeight = 1; 0–7 and 8–11 watched.

### Task 12: schema.prisma ER spec 2.10 + migrate

**ID:** T-3.1

### Task 13: Seed users, videos, courses, enrollments, events

**ID:** T-3.2

### Task 14: Auth users/login/me/logout cookie

**ID:** T-3.3

### Task 15: LoginPage Naive UI + logo + router guard

**ID:** T-3.4

### Task 16: Swagger bootstrap /api/docs

**ID:** T-3.5

### Task 17: GET /catalog/courses published + progress if enrolled

**ID:** T-4.1

### Task 18: POST enroll + 409 retired/not published

**ID:** T-4.2

### Task 19: GET /catalog/courses/:id published version

**ID:** T-4.3

### Task 20: CatalogPage + CoursePage paint JSON only

**ID:** T-4.4  
Grep gate: no `uniqueSeconds|0\\.9|merge\\(` business logic in `web/src`.

### Task 21: GET /player/chapters/:id + stream/proxy

**ID:** T-5.1

### Task 22: POST /playback/events + PATCH cursor

**ID:** T-5.2

### Task 23: PlayerPage video, range bar, heartbeat, seeked, pagehide

**ID:** T-5.3

### Task 24: Resume currentTime = cursor

**ID:** T-5.4

### Task 25: Admin CRUD courses/chapters + order PATCH

**ID:** T-6.1

### Task 26: POST transition table spec 2.6

**ID:** T-6.2

### Task 27: Clone working version + submit/publish revision

**ID:** T-6.3

### Task 28: Admin UI table, detail, drag, legal buttons only

**ID:** T-6.4

### Task 29: Retired blocks enroll

**ID:** T-6.5

### Task 30: POST /admin/events/import CSV 3.1

**ID:** T-7.1

### Task 31: GET /admin/videos/:id/heatmap

**ID:** T-7.2

### Task 32: AdminHeatmapPage

**ID:** T-7.3

### Task 33: Complete Swagger decorators = spec 2.8 map

**ID:** T-7.4

### Task 34: README up/reload/users/swagger/demo

**ID:** T-8.1

### Task 35: DECISIONS.md spec 2.13 + spike + durations

**ID:** T-8.2

### Task 36: ci.yml lint+test+build

**ID:** T-8.3

### Task 37: deploy.yml + docker-compose.prod.yml

**ID:** T-8.4

### Task 38: DNS + certbot + proxy-reverse server block

**ID:** T-8.5  
**STOP for human:** this mutates DNS and the proxy-reverse repo. Implementer must stop and report BLOCKED until controller confirms.

### Task 39: artifacts/index.html map SDD + how to test CA

**ID:** T-8.6

### Task 40: Manual CA-01..08 + clean console checklist in README

**ID:** T-8.7

