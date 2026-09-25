# Spec — <título corto del cambio>

- **Corrida:** `docs/sdd/<aaaa-mm-dd>-<slug>/`
- **Rama:** `feat|fix/<scope>/<slug>`
- **Parte:** P_ · **Carpeta designada:** `<ruta>`
- **Banderas:** `base`, …
- **Cambio de contrato:** no | sí (ver §3)
- **Estado:** borrador | aprobada el <fecha>

## 1. Objetivo

Una frase.

## 2. Alcance y fuera de alcance

- Dentro: …
- Fuera: …

## 3. Cambios de contrato (`packages/contracts`)

| Esquema / enum / campo | Cambio | ¿Ruptura? | Consumidores afectados |
|---|---|---|---|

## 4. Criterios de aceptación

### CA-1 — <nombre>
- **Dado** …
- **Cuando** …
- **Entonces** … (observable y verificable por una prueba automática; con número o condición concreta)
- **Capa de prueba:** contracts | unitaria | integración PGlite | PostgreSQL real | E2E

### CA-2 — …

## 5. Invariantes que no se pueden romper

| Invariante | De dónde sale | Test existente que la cubre |
|---|---|---|

## 6. Riesgos por bandera

| Bandera | Riesgo concreto | Qué prueba lo cubre |
|---|---|---|

## 7. Lo que no se va a poder verificar en esta máquina

Se rellena en F4; la spec deja el hueco con lo previsible (Docker, shapefiles reales, …).

## 8. Preguntas abiertas para el usuario

- [ ] … (`BLOQUEANTE` si impide seguir)
