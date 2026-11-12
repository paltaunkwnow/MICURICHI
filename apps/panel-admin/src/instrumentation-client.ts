import { z } from 'zod';

// Evita la sonda de eval de Zod bajo la CSP estricta del navegador.
z.config({ jitless: true });
