# Spec — <título corto del cambio>

- **Corrida:** `docs/sdd/<aaaa-mm-dd>-<slug>/`
- **Rama:** `feat|fix/<scope>/<slug>` · **Foto:** `refs/sdd/<slug>`
- **Parte:** P_ · **Carpeta designada:** `<ruta>`
- **Banderas:** `base`, …
- **Cambio de contrato:** no | sí (ver §3)
- **Línea base:** `linea-base.md` (rojos que ya estaban: …; decisión de la puerta 1: …)
- **Cambios ajenos en el árbol:** ninguno | N archivos (lista en `linea-base.md`). Archivos ajenos que este cambio necesitaría tocar: ninguno | … (BLOQUEANTE)
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
- **Capa de prueba:** contracts | unitaria | integración (base efímera) | PostgreSQL real (base efímera) | E2E (ventana) | en vivo (Docker) | túnel (sin sesión)

### CA-2 — …

## 5. Invariantes que no se pueden romper

| Invariante | De dónde sale | Test existente que la cubre | Estado en la línea base |
|---|---|---|---|

La última columna la completa el agente principal antes de la puerta 1: un invariante cubierto por
un test rojo no está cubierto.

## 6. Riesgos por bandera

| Bandera | Riesgo concreto | Qué prueba lo cubre |
|---|---|---|

## 7. Lo que no se va a poder verificar en esta máquina

Previsible: E2E sin ventana autorizada; reemplazar la pila sin permiso; lo que exige sesión por el
túnel (lo prueba el usuario); comandos pesados sin memoria libre. PostgreSQL real sí se puede, en
una base efímera. F4 completa el resto.

## 8. Preguntas abiertas para el usuario

- [ ] … (`BLOQUEANTE` si impide seguir)
