/** Regresiones de seguridad y privacidad (CLAUDE.md §13). Todas son funciones puras. */
import Fastify from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import { leerConfig, verificarProduccion } from '../src/config.js';
import { igualEnTiempoConstante } from '../src/observabilidad.js';
import { leerConfianzaProxy, opcionFastify } from '../src/proxy.js';
import { serializadores } from '../src/registro.js';
import { csvCelda } from '../src/rutas/admin.js';
import { type FilaReporte, vistaPublica, vistaTecnica } from '../src/vistas.js';

const ENTORNO_MINIMO = {
  // Las sales tienen que superar SAL_MIN_LONGITUD: el jitter siembra con un hash no
  // criptográfico y una sal corta se prueba por fuerza bruta en segundos.
  IP_HASH_SAL: 'sal-real-de-produccion-con-largo-suficiente',
  JITTER_SAL: 'jitter-real-de-produccion-con-largo-suficiente',
  COOKIE_SEGURA: '1',
  CORS_ORIGENES: 'https://curichi.gob.bo',
  METRICAS_TOKEN: 'token-de-metricas',
  GEO_TOKEN_INTERNO: 'token-interno-de-produccion-con-largo-suficiente',
  // Obligatoria y https en producción desde contracts 0.7.0 (config.ts: verificarProduccion).
  PANEL_ADMIN_URL: 'https://panel.curichi.gob.bo',
  NODE_ENV: 'production',
} satisfies NodeJS.ProcessEnv;

describe('configuración de producción', () => {
  it('acepta una configuración completa', () => {
    expect(() => leerConfig(ENTORNO_MINIMO)).not.toThrow();
  });

  it('no arranca con la sal de IP de ejemplo', () => {
    expect(() => leerConfig({ ...ENTORNO_MINIMO, IP_HASH_SAL: '' })).toThrow(/IP_HASH_SAL/);
  });

  it('no arranca con la sal de jitter de ejemplo', () => {
    expect(() => leerConfig({ ...ENTORNO_MINIMO, JITTER_SAL: '' })).toThrow(/JITTER_SAL/);
  });

  it('no arranca sin cookie segura ni con CORS abierto', () => {
    expect(() => leerConfig({ ...ENTORNO_MINIMO, COOKIE_SEGURA: '0' })).toThrow(/COOKIE_SEGURA/);
    expect(() => leerConfig({ ...ENTORNO_MINIMO, CORS_ORIGENES: '*' })).toThrow(/CORS_ORIGENES/);
  });

  it('en local no exige nada y no expone /docs en producción', () => {
    expect(leerConfig({}).exponerDocs).toBe(true);
    expect(leerConfig(ENTORNO_MINIMO).exponerDocs).toBe(false);
  });

  it('no confía en X-Forwarded-For salvo que se declare el proxy', () => {
    expect(leerConfig({}).confiarEnProxy).toBe(false);
    // Un salto, no "confiar en todo": ver la descripción en proxy.ts.
    expect(leerConfig({ TRUST_PROXY: '1' }).confiarEnProxy).toBe(1);
  });

  it('verificarProduccion enumera todos los fallos a la vez', () => {
    const cfg = leerConfig({});
    expect(() => verificarProduccion(cfg)).toThrow(/IP_HASH_SAL[\s\S]*JITTER_SAL/);
  });

  /**
   * Sin token, geo-service no reconoce a api-core: cada `POST /reportes` gasta el cupo por IP del
   * resolver (todas salen del mismo origen, así que una tormenta lo agota y crear reportes da
   * 503) y la invalidación de capas recibe 403. Mismo criterio de longitud que las sales.
   */
  it('no arranca sin GEO_TOKEN_INTERNO ni con uno corto', () => {
    expect(() => leerConfig({ ...ENTORNO_MINIMO, GEO_TOKEN_INTERNO: '' })).toThrow(
      /GEO_TOKEN_INTERNO/,
    );
    expect(() => leerConfig({ ...ENTORNO_MINIMO, GEO_TOKEN_INTERNO: 'corto' })).toThrow(
      /GEO_TOKEN_INTERNO[^\n]*32/,
    );
    expect(() =>
      leerConfig({ ...ENTORNO_MINIMO, GEO_TOKEN_INTERNO: 'x'.repeat(32) }),
    ).not.toThrow();
  });
});

/**
 * Con qué rol se conecta api-core. El `.env` raíz trae `DATABASE_URL` con el rol DUEÑO del esquema
 * (lo usan las migraciones, los seeds y el ETL); api-core tiene su propio rol con privilegios
 * mínimos (`curichi_api`, migración 0008) en `API_DATABASE_URL`, que manda cuando está.
 */
describe('URL de la base de api-core', () => {
  const DUENO = 'postgresql://curichi:x@127.0.0.1:5432/curichi';
  const API = 'postgresql://curichi_api:y@127.0.0.1:5432/curichi';

  it('API_DATABASE_URL tiene prioridad sobre DATABASE_URL', () => {
    expect(leerConfig({ API_DATABASE_URL: API, DATABASE_URL: DUENO }).databaseUrl).toBe(API);
  });

  it('vacía cuenta como ausente: el .env.example la declara sin valor', () => {
    // Con `??` una cadena vacía ganaba y el servicio arrancaba sin URL.
    expect(leerConfig({ API_DATABASE_URL: '', DATABASE_URL: DUENO }).databaseUrl).toBe(DUENO);
    expect(leerConfig({ API_DATABASE_URL: '', DATABASE_URL: '' }).databaseUrl).toBe(
      leerConfig({}).databaseUrl,
    );
  });

  it('sin ninguna de las dos cae en la base local sin Docker (ADR 0002)', () => {
    expect(leerConfig({}).databaseUrl).toBe('postgresql://curichi:curichi@127.0.0.1:5433/curichi');
  });
});

describe('CSV: inyección de fórmulas', () => {
  it('neutraliza las celdas que empiezan por =, +, - o @', () => {
    expect(csvCelda('=1+1')).toBe("'=1+1");
    expect(csvCelda('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCelda('+49+cmd')).toBe("'+49+cmd");
    expect(csvCelda('-2+3+cmd')).toBe("'-2+3+cmd");
    expect(csvCelda('\t=1')).toBe("'\t=1");
    // El apóstrofo obliga a entrecomillar cuando además hay comas.
    expect(csvCelda('=HYPERLINK("http://x","ver")')).toBe('"\'=HYPERLINK(""http://x"",""ver"")"');
  });

  it('deja intactos los números: las coordenadas empiezan por -', () => {
    expect(csvCelda(-17.7891)).toBe('-17.7891');
    expect(csvCelda('-63.1953')).toBe('-63.1953');
    expect(csvCelda(0)).toBe('0');
    // La exención es solo para lo que realmente es un número; un valor que parsea a número
    // no puede ser una fórmula peligrosa (cualquier función o referencia da NaN y se escapa).
    expect(csvCelda('+49')).toBe('+49');
  });

  it('sigue escapando comillas y comas como antes', () => {
    expect(csvCelda('dice "hola", y algo')).toBe('"dice ""hola"", y algo"');
    expect(csvCelda(null)).toBe('');
  });

  it('entrecomilla el \\r suelto: sin comillas parte el registro y la fila nueva empieza con =', () => {
    // Excel y LibreOffice cortan el registro en un CR aunque no venga seguido de LF.
    expect(csvCelda("agua en la esquina\r=cmd|' /C calc'!A0")).toBe(
      `"agua en la esquina\r=cmd|' /C calc'!A0"`,
    );
    expect(csvCelda('primera línea\r\nsegunda')).toBe('"primera línea\r\nsegunda"');
    expect(csvCelda('uno;dos')).toBe('"uno;dos"');
  });

  it('una celda que empieza por salto de línea también se neutraliza', () => {
    expect(csvCelda('\n=1+1')).toBe(`"'\n=1+1"`);
    expect(csvCelda('\r@SUM(A1)')).toBe(`"'\r@SUM(A1)"`);
  });
});

function fila(parcial: Partial<FilaReporte> = {}): FilaReporte {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    lon: -63.1953,
    lat: -17.7891,
    creado_en: new Date('2026-01-01T12:00:00Z'),
    actualizado_en: new Date('2026-01-01T12:00:00Z'),
    evento_en: null,
    autor_id: null,
    distrito_id: 'distrito_municipal:01',
    distrito_codigo: '01',
    distrito_nombre: 'Distrito Uno',
    unidad_vecinal_id: 'unidad_vecinal:A',
    uv_codigo: 'A',
    uv_nombre: 'UV A',
    version_capa: 'test',
    resolucion_flags: {},
    ubicacion_metodo: 'manual',
    precision_gps_m: null,
    distancia_dispositivo_m: null,
    ubicacion_tipo: 'vivienda_o_predio',
    descripcion: 'Se junta agua hasta la rodilla en la puerta de casa cada lluvia.',
    profundidad_estimada: 'rodilla',
    frecuencia: 'ocasional',
    causa_presunta: 'desconocida',
    sumidero_cercano: null,
    sumidero_estado: null,
    agua_brota_sumidero: null,
    severidad_calculada: 'media',
    severidad_puntaje: 6, // v2: rodilla (2·2) + ocasional (2)
    severidad_manual: null,
    severidad_motivo: null,
    estado: 'validado',
    estado_motivo: null,
    fusionado_en_id: null,
    punto_critico_id: null,
    n_reportes_punto: null,
    validado_por: null,
    validado_en: null,
    fotos: null,
    ...parcial,
  };
}

describe('jitter público (§13)', () => {
  // CA-A6: la dirección aproximada ya no existe en el reporte (migración 0010); la vista sigue
  // obligada a desplazar la vivienda y ahora a no traer la clave en absoluto.
  it('CA-A6: desplaza la vivienda y oculta la dirección', () => {
    const f = fila();
    const v = vistaPublica(f, '', 'sal-secreta');
    expect(v.props.precision_degradada).toBe(true);
    expect(v.props).not.toHaveProperty('direccion_aprox');
    expect(v.props).not.toHaveProperty('manzana_id');
    expect(v.lat).not.toBe(f.lat);
  });

  it('con la misma sal el desplazamiento es estable (el punto no baila en el mapa)', () => {
    const a = vistaPublica(fila(), '', 'sal-secreta');
    const b = vistaPublica(fila(), '', 'sal-secreta');
    expect([a.lat, a.lon]).toEqual([b.lat, b.lon]);
  });

  it('la sal cambia el resultado: sin ella el offset sería reproducible desde el id público', () => {
    const a = vistaPublica(fila(), '', 'sal-secreta');
    const b = vistaPublica(fila(), '', 'otra-sal');
    expect([a.lat, a.lon]).not.toEqual([b.lat, b.lon]);
  });

  it('CA-A6: la vía pública no se degrada y el técnico siempre ve la coordenada exacta', () => {
    const f = fila({ ubicacion_tipo: 'via_publica' });
    expect(vistaPublica(f, '', 'sal-secreta').props.precision_degradada).toBe(false);
    const t = vistaTecnica(fila(), '');
    expect([t.lat, t.lon]).toEqual([fila().lat, fila().lon]);
    // Antes el técnico sí veía la dirección; el campo desaparece también de su vista (CA-A4).
    expect(t.props).not.toHaveProperty('direccion_aprox');
    expect(t.props).not.toHaveProperty('manzana_id');
  });
});

describe('confianza en el proxy (X-Forwarded-For)', () => {
  it('sin valor o con 0 no se mira la cabecera', () => {
    expect(leerConfianzaProxy(undefined)).toBe(false);
    expect(leerConfianzaProxy('')).toBe(false);
    expect(leerConfianzaProxy('0')).toBe(false);
  });

  it('un número es un número de saltos, no "confiar en todo"', () => {
    // Con "confiar en todo", Fastify toma el valor más a la izquierda de X-Forwarded-For,
    // que es justo el que escribe el cliente: era la forma de elegirse la propia IP.
    expect(leerConfianzaProxy('1')).toBe(1);
    expect(leerConfianzaProxy('2')).toBe(2);
  });

  it('acepta listas de IP y redes con nombre', () => {
    expect(leerConfianzaProxy('10.0.0.0/8, loopback')).toEqual(['10.0.0.0/8', 'loopback']);
  });

  it('rechaza el comodín y el "true" heredado', () => {
    expect(leerConfianzaProxy('true')).toBe(false);
    expect(leerConfianzaProxy('*')).toBe(false);
  });
});

describe('endurecimiento de la configuración de producción', () => {
  const base = { ...ENTORNO_MINIMO, METRICAS_TOKEN: '' };

  it('exige sales largas: el jitter usa un hash no criptográfico y una sal corta se adivina', () => {
    expect(() => leerConfig({ ...base, JITTER_SAL: 'corta' })).toThrow(/JITTER_SAL/);
    expect(() => leerConfig({ ...base, IP_HASH_SAL: 'corta' })).toThrow(/IP_HASH_SAL/);
    expect(() => leerConfig({ ...base, METRICAS_TOKEN: 't' })).not.toThrow();
  });

  it('no publica /metrics sin token: enumera rutas, conteos y errores', () => {
    expect(() => leerConfig(base)).toThrow(/METRICAS_TOKEN/);
    expect(() => leerConfig({ ...base, METRICAS_RUTA: '' })).not.toThrow();
    expect(() => leerConfig({ ...base, METRICAS_TOKEN: 'secreto' })).not.toThrow();
  });
});

describe('comparación de tokens en tiempo constante', () => {
  it('acepta el token correcto y rechaza el resto sin salir antes de tiempo', () => {
    expect(igualEnTiempoConstante('abc123', 'abc123')).toBe(true);
    expect(igualEnTiempoConstante('abc124', 'abc123')).toBe(false);
    expect(igualEnTiempoConstante('abc', 'abc123')).toBe(false);
    expect(igualEnTiempoConstante(undefined, 'abc123')).toBe(false);
    expect(igualEnTiempoConstante(['abc123'], 'abc123')).toBe(false);
  });
});

/**
 * Falsificación de la IP del cliente para saltarse el rate limit y ensuciar el `ip_hash` del
 * antispam (CLAUDE.md §13).
 *
 * `TRUST_PROXY=1` significaba «confiar en todo»: Fastify tomaba entonces el valor MÁS A LA
 * IZQUIERDA de `X-Forwarded-For`, que es justamente el que escribe el cliente. La opción pensada
 * para poner el servicio detrás de un proxy era la que dejaba elegir tu propia IP —y con ella tu
 * cubo de rate limit—, y el reenvío de Next pasa la cabecera del cliente tal cual, así que era
 * alcanzable desde el navegador.
 *
 * Aquí se comprueba el comportamiento, no el parseo: se monta Fastify con la misma opción que usa
 * `crearApp` y se mira qué `req.ip` resulta. Contar saltos DESDE el servicio es lo que hace que
 * añadir entradas por delante no sirva de nada… siempre que el número de saltos sea el de los
 * proxies que de verdad ESCRIBEN en la cabecera.
 *
 * TOPOLOGÍA REAL (navegador → proxy TLS → Next → api-core), comprobada ejecutando:
 *   - el proxy TLS AÑADE la IP del cliente al final de lo que mandó el navegador;
 *   - el rewrite de Next reenvía la cabecera TAL CUAL y no añade entrada propia;
 *   - api-core ve como socket la IP de Next.
 * Solo hay UN salto que escribe, así que el valor correcto es `TRUST_PROXY=1`. La prueba anterior
 * suponía una entrada de Next que no existe y daba por buena `TRUST_PROXY=2`, que en esta
 * topología le entrega al cliente la elección de su IP.
 */
describe('la IP del cliente no se puede elegir desde el navegador', () => {
  /** IP de Next: la que abre el socket contra api-core. */
  const NEXT = '10.9.9.9';
  /** IP pública real del vecino, la que ve el proxy TLS. */
  const CLIENTE = '198.51.100.7';

  async function ipVista(confianza: string | undefined, cabeceras: Record<string, string>) {
    const app = Fastify({ trustProxy: opcionFastify(leerConfianzaProxy(confianza)) });
    app.get('/', async (req) => ({ ip: req.ip }));
    const r = await app.inject({
      method: 'GET',
      url: '/',
      headers: cabeceras,
      remoteAddress: NEXT,
    });
    await app.close();
    return r.json().ip as string;
  }

  /**
   * `X-Forwarded-For` tal como llega a api-core: lo que mandó el navegador (si mandó algo) más la
   * IP real que añade el proxy TLS. Next no añade nada.
   */
  function cabeceraQueLlega(xffDelNavegador?: string) {
    return { 'x-forwarded-for': xffDelNavegador ? `${xffDelNavegador}, ${CLIENTE}` : CLIENTE };
  }

  // La primera instancia de Fastify del proceso cuesta segundos cuando la suite corre en paralelo
  // con las que levantan PGlite, y ese coste se lo comía entero el primer `it` (se vio pasar de
  // los 5 s). Pagarlo aquí no cambia lo que se prueba; mismo criterio que resiliencia.test.ts.
  beforeAll(async () => {
    await ipVista('0', {});
  }, 60_000);

  it('sin proxy declarado, la cabecera se ignora por completo', async () => {
    expect(await ipVista('0', { 'x-forwarded-for': '203.0.113.1' })).toBe(NEXT);
    expect(await ipVista(undefined, { 'x-forwarded-for': '203.0.113.1' })).toBe(NEXT);
  });

  it('con TRUST_PROXY=1 la IP es la real, la que anotó el proxy TLS', async () => {
    expect(await ipVista('1', cabeceraQueLlega())).toBe(CLIENTE);
  });

  it('con TRUST_PROXY=1 el navegador no puede colarse mandando su propia cabecera', async () => {
    expect(await ipVista('1', cabeceraQueLlega('1.1.1.1'))).toBe(CLIENTE);
  });

  it('con TRUST_PROXY=1 añadir muchas entradas por delante tampoco desplaza el resultado', async () => {
    const ip = await ipVista('1', cabeceraQueLlega('1.1.1.1, 2.2.2.2, 3.3.3.3, 4.4.4.4'));
    expect(ip).toBe(CLIENTE);
  });

  it('con TRUST_PROXY=2 en esta topología el cliente SÍ elige su IP: por eso el valor es 1', async () => {
    // El segundo salto «de confianza» ya no es un proxy nuestro: es lo que escribió el navegador.
    expect(await ipVista('2', cabeceraQueLlega('1.1.1.1'))).toBe('1.1.1.1');
    // Y cambiándola en cada petición, estrena cubo de rate limit y de freno de login cada vez.
    expect(await ipVista('2', cabeceraQueLlega('5.5.5.5'))).toBe('5.5.5.5');
  });

  it('«true» y «*» ya no se aceptan: eran exactamente la configuración vulnerable', async () => {
    expect(await ipVista('true', { 'x-forwarded-for': '1.1.1.1' })).toBe(NEXT);
    expect(await ipVista('*', { 'x-forwarded-for': '1.1.1.1' })).toBe(NEXT);
  });

  it('otras cabeceras de proxy no se miran nunca', async () => {
    for (const cab of ['x-real-ip', 'cf-connecting-ip', 'true-client-ip'])
      expect(await ipVista('1', { [cab]: '203.0.113.9' }), cab).toBe(NEXT);
  });
});

/**
 * La IP del cliente en el registro (CLAUDE.md §13: «Nunca la IP en claro: el log es un dato
 * personal más»).
 *
 * El código ya evitaba registrarla a mano —`rutas/auth.ts` escribe `ipHash`, no `req.ip`— pero el
 * serializador POR DEFECTO de Fastify escribe `remoteAddress` en cada petición, y eso es lo que
 * salía de verdad en el log del contenedor:
 *
 *   {"req":{"method":"GET","url":"/health","remoteAddress":"172.18.0.1","remotePort":36666}, …}
 *
 * O sea: la IP de todo el que entra al mapa, dos líneas por petición, y sin la retención de 30
 * días que sí se aplica al `ip_hash` de la base. Todo el cuidado del resto del código quedaba en
 * nada por una opción por defecto.
 */
describe('el registro no identifica a quien entra', () => {
  const s = serializadores('sal-de-prueba-suficientemente-larga');
  /** Petición de mentira con todo lo que NO debe acabar en el log. */
  const comoPeticion = (ip = '203.0.113.42') => ({
    method: 'GET',
    url: '/api/v1/reportes?bbox=-63.2,-17.8,-63.1,-17.7',
    ip,
    socket: { remotePort: 51234 },
    headers: {
      cookie: `curichi_sesion=${'a'.repeat(64)}`,
      authorization: 'Bearer secreto',
    },
  });
  const peticion = comoPeticion() as never;

  it('sustituye la dirección por un hash y no deja rastro de la original', () => {
    const r = s.req(peticion) as Record<string, unknown>;
    const texto = JSON.stringify(r);
    expect(texto).not.toContain('203.0.113.42');
    expect(r).not.toHaveProperty('remoteAddress');
    expect(r).not.toHaveProperty('remotePort');
    expect(String(r.ipHash)).toMatch(/^[a-f0-9]{16}$/);
  });

  it('no registra cabeceras: ahí viajan la cookie de sesión y el Authorization', () => {
    const texto = JSON.stringify(s.req(peticion));
    expect(texto).not.toContain('cookie');
    expect(texto).not.toContain('curichi_sesion');
    expect(texto).not.toContain('authorization');
    expect(texto).not.toContain('secreto');
  });

  it('conserva lo que sirve para diagnosticar: método, ruta y estado', () => {
    const r = s.req(peticion) as Record<string, unknown>;
    expect(r.method).toBe('GET');
    expect(r.url).toContain('/api/v1/reportes');
    expect(s.res({ statusCode: 429 })).toEqual({ statusCode: 429 });
  });

  it('el mismo origen da el mismo hash y dos orígenes distintos dan hashes distintos', () => {
    const a = s.req(comoPeticion('203.0.113.42') as never) as { ipHash: string };
    const b = s.req(comoPeticion('203.0.113.42') as never) as { ipHash: string };
    const c = s.req(comoPeticion('203.0.113.43') as never) as { ipHash: string };
    expect(a.ipHash).toBe(b.ipHash); // sirve para agrupar en una investigación
    expect(a.ipHash).not.toBe(c.ipHash);
  });

  it('con otra sal el mismo origen ya no es correlacionable', () => {
    const otra = serializadores('otra-sal-distinta-igual-de-larga');
    const a = s.req(peticion) as { ipHash: string };
    const b = otra.req(peticion) as { ipHash: string };
    expect(a.ipHash).not.toBe(b.ipHash);
  });
});
