## Parte y carpeta designada

- Parte: `P_` (1 frontend público · 2 frontend administrativo · 3 backend/API · 4 datos/geoespacial · 5 GIS/DevOps/seguridad/infra/calidad)
- Carpeta designada:

## Qué cambia

## Cómo verificarlo

```bash
```

## Cambios de contrato (`packages/contracts`)

- [ ] No hay
- [ ] Sí, anunciados en el plan y listados aquí:

## Hallazgos fuera de la carpeta designada (documentados, NO tocados)

## Definition of Done (CLAUDE.md §10.3)

- [ ] Compila sin warnings nuevos
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` en verde
- [ ] Al menos un test cubre el camino crítico de la parte
- [ ] README propio con comandos y variables de entorno
- [ ] `.env.example` sin valores reales
- [ ] Sin datos ficticios presentados como reales
- [ ] Sin cambios fuera de la carpeta designada (o autorización registrada aquí)
- [ ] Checklist de seguridad revisado (`docs/seguridad/checklist-pr.md`) si toca api-core, fotos o auth
