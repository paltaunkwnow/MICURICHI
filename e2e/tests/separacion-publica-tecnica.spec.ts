/**
 * Que la vista pública siga siendo pública aunque el navegador lleve una sesión de técnico.
 *
 * ORIGEN. La auditoría de seguridad encontró que `GET /api/v1/reportes` devolvía coordenadas
 * exactas y reportes sin moderar con solo llevar la cookie de sesión. Las cookies no distinguen
 * puertos ni rutas, así que con el panel y el mapa público en el mismo host el navegador mandaba
 * la misma cookie a los dos: comprobado contra la pila local, el mapa público mostraba 47 reportes
 * con la ubicación exacta en lugar de los 35 publicados. Y como la URL era idéntica en los dos
 * casos y no salía ninguna cabecera de caché, cualquier caché intermedia podía guardar la
 * respuesta del técnico y servírsela después a un anónimo.
 *
 * Los tests unitarios de api-core fijan la lógica. Estos la comprueban donde de verdad importa:
 * contra los servicios en marcha, con un contexto que arrastra la cookie igual que lo haría el
 * técnico que deja el panel abierto en otra pestaña.
 *
 * SE INICIA SESIÓN UNA SOLA VEZ para todo el archivo. `/auth/login` tiene su propio tope por IP
 * (`LOGIN_PETICIONES_POR_VENTANA`, 20 por defecto) y la suite entera comparte ese presupuesto:
 * un archivo que entra tres veces deja sin cupo a los que vienen después, y el síntoma —un 401 en
 * otra prueba cualquiera— no se parece en nada a la causa.
 */
import { type APIRequestContext, expect, test } from '@playwright/test';
import { API, CREDENCIALES_TECNICO, esperarPila, GEO } from './ayudas';

/** Señas inequívocas de que una respuesta es la vista técnica. */
const CAMPOS_TECNICOS = ['autor_id', 'ubicacion_metodo', 'estado_motivo', 'resolucion_flags'];

function tieneCamposTecnicos(props: Record<string, unknown>): boolean {
  return CAMPOS_TECNICOS.some((c) => c in props);
}

test.describe.configure({ mode: 'serial' });

test.describe('la cookie de técnico no cambia lo que ve el público', () => {
  let conSesion: APIRequestContext;
  let anonimo: APIRequestContext;

  test.beforeAll(async ({ playwright, request }) => {
    await esperarPila(request);
    conSesion = await playwright.request.newContext();
    anonimo = await playwright.request.newContext();
    const login = await conSesion.post(`${API}/api/v1/auth/login`, { data: CREDENCIALES_TECNICO });
    // El mensaje importa: si el tope de logins se agotó, el fallo real es 429 aquí y no el 401
    // que aparecería después en cualquier ruta técnica.
    expect(
      login.status(),
      login.status() === 429
        ? 'se agotó el tope de /auth/login (LOGIN_PETICIONES_POR_VENTANA); esperá la ventana o subilo'
        : 'el técnico debe poder iniciar sesión con los usuarios del seed',
    ).toBe(200);
  });

  test.afterAll(async () => {
    await conSesion?.dispose();
    await anonimo?.dispose();
  });

  test('el listado público responde igual con sesión y sin ella', async () => {
    const url = `${API}/api/v1/reportes?limite=500`;
    const rCon = await conSesion.get(url);
    const rSin = await anonimo.get(url);
    expect(rCon.status()).toBe(200);
    expect(rSin.status()).toBe(200);

    const con = await rCon.json();
    const sin = await rSin.json();

    // Si la cookie cambiara algo, `con.total` sería mayor: incluiría los que están en revisión.
    expect(con.total, 'la sesión no puede añadir reportes al listado público').toBe(sin.total);
    expect(JSON.stringify(con)).toBe(JSON.stringify(sin));

    for (const f of con.features as Array<{ properties: Record<string, unknown> }>)
      expect(tieneCamposTecnicos(f.properties), 'campos técnicos en la vista pública').toBe(false);

    // Ningún reporte sin moderar puede aparecer (§7.3: solo validado y resuelto se publican).
    for (const f of con.features as Array<{ properties: { estado: string } }>)
      expect(['validado', 'resuelto']).toContain(f.properties.estado);
  });

  test('el detalle público tampoco cambia con la sesión puesta', async () => {
    const lista = await (await anonimo.get(`${API}/api/v1/reportes?limite=1`)).json();
    const id = lista.features[0]?.properties?.id;
    expect(id, 'hace falta al menos un reporte publicado en el seed').toBeTruthy();

    const con = await conSesion.get(`${API}/api/v1/reportes/${id}`);
    const sin = await anonimo.get(`${API}/api/v1/reportes/${id}`);
    expect(con.status()).toBe(200);
    expect(await con.text()).toBe(await sin.text());
    expect(tieneCamposTecnicos((await con.json()).properties)).toBe(false);
  });

  test('la ruta pública se declara cacheable y la técnica prohíbe guardarla', async () => {
    const publica = await conSesion.get(`${API}/api/v1/reportes?limite=5`);
    expect(publica.status()).toBe(200);
    expect(publica.headers()['cache-control']).toBe('public, no-cache');

    const tecnica = await conSesion.get(`${API}/api/v1/tecnico/reportes?limite=5`);
    expect(tecnica.status()).toBe(200);
    // `no-store` es lo que impide que un proxy del municipio guarde coordenadas exactas, y
    // `Vary: Cookie` es la segunda barrera por si alguna caché ignorara lo anterior.
    expect(tecnica.headers()['cache-control']).toBe('private, no-store');
    expect(tecnica.headers().vary ?? '').toMatch(/Cookie/i);
  });

  test('la vista técnica exige sesión: sin ella no cae a la pública, responde 401', async () => {
    const r = await anonimo.get(`${API}/api/v1/tecnico/reportes`);
    expect(r.status()).toBe(401);
    expect((await r.json()).codigo).toBe('SIN_SESION');

    // Cookie con el formato correcto pero inventada: tampoco.
    const falsa = await anonimo.get(`${API}/api/v1/tecnico/reportes`, {
      headers: { cookie: `curichi_sesion=${'a'.repeat(64)}` },
    });
    expect(falsa.status()).toBe(401);

    const detalle = await anonimo.get(
      `${API}/api/v1/tecnico/reportes/00000000-0000-0000-0000-000000000000`,
    );
    expect(detalle.status()).toBe(401);
  });

  test('el técnico sí obtiene su vista por la ruta técnica', async () => {
    const r = await conSesion.get(`${API}/api/v1/tecnico/reportes?limite=5`);
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(j.features.length).toBeGreaterThan(0);
    expect(
      tieneCamposTecnicos(j.features[0].properties),
      'el panel necesita las propiedades de moderación',
    ).toBe(true);
  });

  test('los puntos críticos no publican medidas de la geometría exacta', async ({ request }) => {
    // `diametro_m` era la distancia real entre los dos reportes más separados del grupo, con
    // precisión de 0,1 m, publicada junto a un centroide deliberadamente desplazado.
    const r = await request.get(`${GEO}/geo/v1/puntos-criticos`);
    expect(r.status()).toBe(200);
    const cuerpo = await r.text();
    for (const campo of ['radio_m', 'diametro_m', 'advertencia_diametro'])
      expect(cuerpo, `«${campo}» no puede salir por una ruta pública`).not.toContain(campo);

    const puntos = JSON.parse(cuerpo) as Array<Record<string, unknown>>;
    if (puntos.length) {
      // Y lo que el mapa necesita sigue estando.
      for (const campo of ['id', 'lat', 'lon', 'n_reportes', 'severidad_max'])
        expect(puntos[0]).toHaveProperty(campo);
    }
  });
});
