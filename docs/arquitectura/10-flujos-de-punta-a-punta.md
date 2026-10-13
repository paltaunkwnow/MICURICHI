# 10 · Flujos de punta a punta

> Cómo viaja cada acción importante por todas las partes. Diagramas en Mermaid (GitHub los dibuja).
> Leyenda: **[C]** confirmado en código · **[I]** inferido.

## 1. Ver el mapa público (sin cuenta) [C]

```mermaid
sequenceDiagram
  autonumber
  participant N as Navegador
  participant W as web-ciudadano (Next)
  participant A as api-core
  participant G as geo-service
  participant DB as PostgreSQL/PostGIS
  N->>W: GET /
  W->>W: proxy.ts: nonce + CSP
  W->>A: GET /api/v1/configuracion (servidor, caché 5 min)
  A-->>W: ciudad (centro, zoom, zona, locale)
  W-->>N: HTML (render por petición)
  par datos del mapa (credentials: omit)
    N->>W: GET /api/v1/reportes?bbox&limite=300
    W->>A: rewrite (borra XFF si no hay proxy de confianza)
    A->>DB: SELECT … WHERE estado público AND publicar_en<=now() AND geom_publico && bbox
    A-->>N: FeatureCollection pública (jitter, sin autor) · public, no-cache
  and
    N->>W: GET /geo/v1/capas
    W->>G: rewrite
    G-->>N: [{capa, modo, url con huella}]
    N->>G: GET /geo/v1/capas/{capa}/v/{huella} o /teselas/… (immutable 1 año)
  and
    N->>G: GET /geo/v1/agregados/unidades-vecinales (SWR ≤ 120 s)
  end
  N->>N: MapLibre: base OSM + capas + clusters
```

## 2. Crear cuenta e iniciar sesión [C]

```mermaid
sequenceDiagram
  autonumber
  participant N as Navegador
  participant A as api-core
  participant DB as PostgreSQL
  N->>A: POST /api/v1/auth/registro {email, nombre, password}
  A->>DB: advisory lock(alta-cuenta:ipHash) · topes hora/día por IP (intento_login)
  A->>A: hash Argon2id (worker) SIEMPRE
  A->>DB: INSERT usuario … ON CONFLICT DO NOTHING (rol = DEFAULT ciudadano)
  A-->>N: 201 CUENTA_LISTA (igual exista o no el correo; sin cookie)
  N->>A: POST /api/v1/auth/login {email|usuario, password}
  A->>DB: freno fuerza bruta (antes de verificar)
  A->>A: verificarPassword (hash señuelo si no existe) · rehash scrypt→argon2
  A->>DB: DELETE sesión previa · INSERT sesion (32 bytes) · auditoría login
  A-->>N: Set-Cookie curichi_sesion (HttpOnly, Lax, Secure según config)
```

## 3. Reportar un punto [C]

```mermaid
sequenceDiagram
  autonumber
  participant N as Navegador (FormularioReporte)
  participant A as api-core
  participant G as geo-service
  participant S as Almacén de fotos
  participant DB as PostgreSQL
  N->>A: GET /auth/yo → cupo, demora_proximo_s
  N->>N: «Compartir mi ubicación» → watchPosition (≤ 50 m) o «aproximada»
  loop al mover el punto (600 ms quieto)
    N->>G: POST /geo/v1/resolver (cupo por IP) → UV / fuera
  end
  opt foto (hasta 3)
    N->>A: POST /api/v1/fotos (multipart)
    A->>DB: guarda de disco · reservar turno de foto (12/día)
    A->>A: magic bytes · ≤60 MP · sharp → WebP 1600 px sin metadatos · verificación RIFF
    A->>DB: INSERT reporte_foto (subido_por)
    A->>S: guardar <uuid>.webp
    A-->>N: {objeto_key}
  end
  N->>N: releer la posición · decidirEnvio · congelar dispositivo
  N->>A: POST /api/v1/reportes + Idempotency-Key {…, dispositivo, fotos}
  A->>A: Zod · revisarDispositivo (422 sin gastar cupo)
  A->>G: POST /geo/v1/resolver (x-token-interno, fuera del cupo)
  G-->>A: distrito/UV o fuera de cobertura (→ 422)
  A->>A: severidad · coordenadaPublica(id|JITTER_SAL)
  A->>DB: BEGIN · reclamar clave · reservar turno (n) · INSERT (publicar_en = now()+60|240 s)
  A->>DB: asociar fotos (misma cuenta, < 24 h) · auditoría crear · COMMIT
  A-->>N: 201 MiReporte {publicar_en, segundos_para_publicar}
  N->>N: cuenta regresiva · invalidar ['yo'], ['mis-reportes'], ['reportes'], ['agregados']
  Note over DB: al vencer publicar_en, el filtro publicar_en<=now() lo vuelve público. No hay ningún proceso que «publique».
```

## 4. Moderar (técnico o admin) [C]

```mermaid
sequenceDiagram
  autonumber
  participant P as panel-admin
  participant A as api-core
  participant DB as PostgreSQL
  participant G as geo-service
  loop cada 10 s, pestaña visible (x-curichi-sondeo: 1)
    P->>A: GET /api/v1/tecnico/reportes?filtros
  end
  P->>A: PATCH /api/v1/reportes/:id/estado {estado, estado_motivo} (o POST /fusionar)
  A->>A: requerirRol(tecnico, admin) · Zod · resolverIdReporte (solo publicados)
  A->>DB: BEGIN · SELECT … FOR UPDATE (reporte + canónico, por id)
  A->>A: transicionPermitida(desde, hacia, rol) → 403/409
  A->>DB: UPDATE · auditoría · reapuntar duplicados · COMMIT
  A->>DB: recalcularEntornoDeReporte (lock 4021, componente conexa a 25 m)
  A->>A: invalidar indicadores y resumen en vuelo
  A-->>P: Feature técnica actualizada
  Note over G: geo-service ve el cambio en su próxima revalidación (agregados ≤ 120 s)
```

## 5. Publicación diferida (cómo se «publica» sin un proceso) [C]

```text
t = 0      INSERT … estado='nuevo', publicar_en = now() + 60 s (1.º del día) | + 240 s (2.º y 3.º)
0 < t < 60 solo el AUTOR lo ve (GET /mis-reportes, cualquier estado)
           técnicos: 404 (nadie modera ni exporta antes de publicar_en)
t ≥ 60     GET /reportes (público) lo devuelve: estado ∈ ESTADOS_PUBLICOS AND publicar_en <= now()
           con «NO SE HA VERIFICADO» · aparece en la bandeja técnica
validar    → «Verificado», entra en los puntos críticos y en el color por UV
rechazar/fusionar → sale del mapa; la foto deja de servirse (no-cache + ETag)
```

## 6. Activar una versión nueva de capas [C]

```text
operador:  data/raw/<V>/ + MANIFEST → etl:inspect → etl:run (reporte_calidad) → etl:load (vigente=false)
admin:     panel /capas → POST /api/v1/admin/capas/:id/activar
api-core:  BEGIN · vigente=false (capa) · vigente=true (id) · auditoría · COMMIT → POST /geo/v1/capas/invalidar
geo-svc:   vacía caché → próxima /geo/v1/capas trae una huella nueva → los clientes con la URL vieja reciben 410
           → vuelven a pedir la lista → service worker borra las huellas viejas
reportes:  los anteriores conservan version_capa: sus nombres se leen de SU versión, no de la vigente
```

## 7. Mantenimiento (cada 6 h, una sola réplica) [C]

```text
pg_try_advisory_lock(4023) → (otra réplica lo tiene → saltar)
  rellenar geom_publico pendientes → si hubo, recálculo completo de puntos críticos
  si hay verificados sin punto crítico (desbordes, fallos) → recálculo completo
  ejecutarMantenimiento: sesiones caducadas · ip_hash > 30 d · fotos huérfanas > 24 h (+ borrar objeto)
                         · intentos > 24 h · idempotencia > 24 h · cuotas de días pasados
pg_advisory_unlock(4023)
```

## 8. Dónde se decide cada cosa (resumen)

| Decisión | Dónde |
|---|---|
| ¿Quién es? | api-core `auth.ts` (cookie → `sesion`) |
| ¿Puede hacerlo? | api-core `requerirRol` + `TRANSICIONES` (contracts) |
| ¿Es válido el dato? | Zod de contracts en api-core (el cliente valida solo como UX) |
| ¿Es coherente la ubicación? | api-core `ubicacion-dispositivo.ts` (y el cliente recorta al círculo) |
| ¿En qué distrito y UV cae? | geo-service `resolver.ts` (PostGIS) |
| ¿Qué tan grave es? | contracts `calcularSeveridad` (api-core guarda el resultado) |
| ¿Cuándo se ve y quién lo ve? | api-core `visibilidad.ts` + `publicar_en` en la base |
| ¿Dónde se ve en público? | `geom_publico` (jitter de contracts calculado en api-core) |
| ¿Cuántos puede enviar? | Base: `cuota_reporte_diaria` (+ rate limit por IP en memoria) |
| ¿Qué recurrencia hay? | db `puntos-criticos*.ts` (DBSCAN en PostGIS) |
