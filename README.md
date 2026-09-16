# Campus Marte

Prueba técnica Full Stack (Vue 3 · NestJS 10 · PostgreSQL 16 · TypeScript). El progreso del alumno es la **unión de intervalos reproducidos en el servidor**. El cliente solo pinta JSON.

Repositorio: [github.com/joaldico/marte-campus](https://github.com/joaldico/marte-campus)

Demo: https://beonittest.josuediazcontreras.com

## Arranque (máquina limpia)

```bash
docker compose up --build
```

Luego abre [http://localhost](http://localhost).

- UI: `http://localhost`
- API: `http://localhost/api` (nginx quita el prefijo `/api` hacia Nest)
- Salud: `http://localhost/api/health` → `{ "status": "ok", "db": "ok" }`
- OpenAPI: `http://localhost/api/docs`

El contenedor `api` aplica migraciones Prisma y **siembra** el seed 3.1 al arrancar.

### Recarga a cero (restaura el seed)

```bash
docker compose down -v && docker compose up --build
```

## Usuarios (login sin contraseña)

Elige una tarjeta. No hay campo de clave. Cookie `sid` httpOnly.

| Usuario | Rol | Qué ver |
|---|---|---|
| **Ana** | admin | Tabla de cursos, drag de capítulos, transiciones legales, import CSV, heatmap |
| **Bruno** | alumno | Inscrito en Paisajes I. Cascada = 10 s únicos (solapes + duplicado). Atardecer no entra en Paisajes I |
| **Carla** | alumna | Inscrita. Playa resume en el segundo 10. `rate` x2 no dilata el intervalo |
| **Diego** | alumno | No inscrito. Catálogo sin barra. **Apuntarme** → sus 10 s de playa del seed cuentan |

Cursos seed: **Paisajes I** `published` (playa, cascada, bosque) · **Paisajes II** `in_review` · **Paisajes III** `draft` vacío. El alumno solo ve I.

## Recorrido rápido (aceptación)

1. **CA-01** — Abrir `/`. Elegir Bruno. Sesión alumno.
2. **CA-02** — Catálogo: solo Paisajes I. Con Diego: Apuntarme → entra al curso; playa ya tiene 10 s.
3. **CA-03** — Bruno: playa y cascada completas (90 %), bosque no. Atardecer no aparece en el curso.
4. **CA-04** — Carla → Playa: el vídeo arranca en 10; la barra pinta `[0,10)`. Seguir 10–12; la API une a `[0,12)`.
5. **CA-05** — Ana: crear «Paisajes IV», dos capítulos (título + URL archive.org), reordenar arrastrando.
6. **CA-06** — Ana: transiciones **solo** las que el UI muestra (`draft→in_review`, `in_review→published`, `published→retired`). Un `POST /api/admin/courses/:id/transition` ilegal sigue en 409. Publicar III vacío → 409 `COURSE_EMPTY`.
7. **CA-07** — Ana edita el título de Cascada en Paisajes I: Bruno sigue viendo el título viejo hasta **Enviar revisión** + **Publicar revisión**. El progreso de playa no baja.
8. **CA-08** — Ana → Mapa de calor: importar `api/test/fixtures/events-3.1.csv` (11 accepted / 2 rejected). Cascada: hueco en el segundo 7.

CSV de import: `POST /api/admin/events/import` campo `file`. Fixture: [`api/test/fixtures/events-3.1.csv`](api/test/fixtures/events-3.1.csv).

## API (Nest, detrás de `/api`)

Errores: `{ "code": "...", "message": "..." }`.

Progreso, 90 %, heatmap y máquina de estados viven en `api/src/domain/**` (sin Nest ni Prisma). El Vue no calcula uniones.

## Desarrollo local sin Docker (opcional)

Postgres 16 en `localhost:5432` con usuario/clave/db `campus`. Host que ya use 5432: cambia el mapeo del compose.

```bash
cd api && npm ci && npx prisma migrate deploy && npm run seed && npm run start:dev
cd web && npm ci && npm run dev   # Vite en :5173, proxy /api → :3000
```

Tests: `cd api && npm test -- --runInBand && npx tsc --noEmit` · `cd web && npm run build`.

## Decisiones

[`DECISIONS.md`](DECISIONS.md) — estados solo hacia adelante, eventos por vídeo (no por inscripción), `rate` metadato, proxy Range porque archive.org no envía CORS, duraciones `mvhd` commiteadas.

## Licencia

UNLICENSED — entrega de prueba técnica.
