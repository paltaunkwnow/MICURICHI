/**
 * Configuración del registro (CLAUDE.md §13: «Nunca la IP en claro: el log es un dato personal más»).
 *
 * EL PROBLEMA QUE ESTO CIERRA
 *
 * El código se tomaba el trabajo de no registrar IPs: `privacidad.ts` existe para eso y
 * `rutas/auth.ts` registra `ipHash` y no `req.ip`. Pero el serializador por defecto de Fastify
 * escribe `remoteAddress` en CADA petición, así que el log real decía:
 *
 *   {"req":{"method":"GET","url":"/health","remoteAddress":"172.18.0.1","remotePort":36666}, …}
 *
 * Es decir, la IP en claro de todo el que entra al mapa, dos líneas por petición, y encima sin la
 * retención que sí se aplica al `ip_hash` de la base (30 días, §13): el log vive lo que dure la
 * rotación del contenedor. Todo el cuidado del resto del código no servía de nada.
 *
 * Ahora el serializador sustituye la IP por el mismo hash con sal que usa el antispam. Sigue
 * valiendo para lo que hace falta —agrupar las peticiones de un mismo origen al investigar un
 * abuso— y deja de identificar a una persona.
 */
import type { FastifyRequest } from 'fastify';
import { hashIp } from './privacidad.js';

export interface OpcionesRegistro {
  /** Sal del hash de IP. La misma que el antispam, para poder cruzar log y base. */
  salIp: string;
  produccion: boolean;
}

/**
 * Serializadores de pino. Se sustituye el de `req` entero en vez de añadir un campo: si se deja el
 * de por defecto y se añade el hash al lado, la IP en claro sigue saliendo.
 */
export function serializadores(salIp: string) {
  return {
    req(req: FastifyRequest) {
      return {
        method: req.method,
        // `url` lleva la cadena de consulta, que en este servicio son filtros del mapa (bbox,
        // fechas, severidad): no identifica a nadie y es lo que hace falta para diagnosticar.
        url: req.url,
        // Hash con sal en lugar de la dirección. `remotePort` desaparece: no sirve para nada y
        // junto con la hora estrecha la identificación.
        ipHash: hashIp(req.ip, salIp),
      };
    },
    // El de por defecto ya no incluye cabeceras, pero se fija explícitamente: una cabecera
    // registrada sin querer sería la cookie de sesión de un técnico en texto plano.
    res(res: { statusCode: number }) {
      return { statusCode: res.statusCode };
    },
  };
}

/** Opciones de logger para Fastify, con el formato legible fuera de producción. */
export function opcionesLogger(o: OpcionesRegistro) {
  const base = { serializers: serializadores(o.salIp) };
  if (o.produccion) return base;
  return {
    ...base,
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    },
  };
}
