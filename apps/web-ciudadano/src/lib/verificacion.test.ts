/**
 * Publicación sin moderación previa (plan 2026-09-26, S22): un reporte sin revisar se ve con el
 * texto exacto «NO SE HA VERIFICADO», con icono y contraste AA, en el detalle, las tarjetas, las
 * pastillas del mapa y la leyenda; la coropleta pública se pinta solo con los verificados.
 *
 * Sin DOM: el marcado con `renderToStaticMarkup`, las reglas como funciones y lo que corre dentro
 * de MapLibre (que arma nodos a mano) leyendo el código fuente.
 */
import {
  type AgregadoUv,
  CONFIG_DOMINIO,
  type EstadoPublico,
  ETIQUETAS,
  type Severidad,
} from 'contracts';
import { type ComponentProps, createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChipEstado } from '@/componentes/ChipSeveridad';
import { ComoFunciona } from '@/componentes/ComoFunciona';
import { HojaDetalle } from '@/componentes/HojaDetalle';
import { LeyendaMapa } from '@/componentes/LeyendaMapa';
import { TarjetaReporte } from '@/componentes/TarjetaReporte';
import type { ReporteFeature } from './api';
import { ProveedorCiudad } from './ciudad-contexto';
import { colorSeveridad } from './formato';
import { archivosDeLaApp, leerFuente } from './fuente-para-pruebas';
import { textoDelResumen } from './mapa-datos';
import {
  ariaPastilla,
  COLOR_UV_SIN_VERIFICAR,
  COLORES_ICONO_SIN_VERIFICAR,
  contraste,
  ESTILO_ESTADO,
  estadoDeUv,
  estaVerificado,
  etiquetaDeUv,
  expresionColorUv,
  TEXTO_SIN_VERIFICAR,
} from './verificacion';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: '' }),
}));

function reporte(estado: EstadoPublico, extra: Record<string, unknown> = {}): ReporteFeature {
  return {
    type: 'Feature',
    id: '22222222-2222-4222-8222-222222222222',
    geometry: { type: 'Point', coordinates: [-63.18, -17.78] },
    properties: {
      id: '22222222-2222-4222-8222-222222222222',
      creado_en: '2026-09-27T10:00:00-04:00',
      evento_en: null,
      distrito: { id: 'distrito_municipal:01', codigo: '01', nombre: 'Distrito 01' },
      unidad_vecinal: { id: 'unidad_vecinal:57', codigo: '57', nombre: 'Unidad Vecinal 57' },
      descripcion: 'Se junta el agua en la esquina después de cada lluvia fuerte.',
      fotos: [],
      profundidad_estimada: 'rodilla',
      frecuencia: 'cada_lluvia_fuerte',
      causa_presunta: 'desconocida',
      severidad: 'alta',
      severidad_calculada: 'alta',
      estado,
      verificado: estado !== 'nuevo',
      punto_critico_id: null,
      n_reportes_punto: null,
      precision_degradada: false,
      ...extra,
    },
  } as ReporteFeature;
}

function conCiudad(hijo: ReactNode) {
  return createElement(
    ProveedorCiudad,
    { ciudad: CONFIG_DOMINIO.CIUDAD_POR_DEFECTO } as ComponentProps<typeof ProveedorCiudad>,
    hijo,
  );
}

const html = (nodo: ReactNode) =>
  renderToStaticMarkup(nodo as Parameters<typeof renderToStaticMarkup>[0]);

describe('la etiqueta «NO SE HA VERIFICADO»', () => {
  it('es el texto exacto del contrato', () => {
    expect(TEXTO_SIN_VERIFICAR).toBe('NO SE HA VERIFICADO');
    expect(TEXTO_SIN_VERIFICAR).toBe(ETIQUETAS.estado_publico.nuevo);
    expect(ESTILO_ESTADO.nuevo.etiqueta).toBe('NO SE HA VERIFICADO');
    expect(ESTILO_ESTADO.validado.etiqueta).toBe('Verificado');
    expect(ESTILO_ESTADO.resuelto.etiqueta).toBe('Resuelto');
  });

  it('verificado sale del campo del servidor y, si falta, del estado', () => {
    expect(estaVerificado({ estado: 'nuevo', verificado: false })).toBe(false);
    expect(estaVerificado({ estado: 'validado', verificado: true })).toBe(true);
    expect(estaVerificado({ estado: 'nuevo' })).toBe(false);
    expect(estaVerificado({ estado: 'validado' })).toBe(true);
    expect(estaVerificado({ estado: 'resuelto' })).toBe(true);
  });

  it('cada estado tiene contraste AA (4,5:1) entre su texto y su fondo', () => {
    for (const [estado, e] of Object.entries(ESTILO_ESTADO))
      expect(contraste(e.texto, e.fondo), estado).toBeGreaterThanOrEqual(4.5);
    // El icono de la pastilla del mapa: signo blanco sobre su círculo.
    expect(
      contraste(COLORES_ICONO_SIN_VERIFICAR.signo, COLORES_ICONO_SIN_VERIFICAR.fondo),
    ).toBeGreaterThanOrEqual(4.5);
    // Y el círculo se distingue del blanco de la pastilla (1.4.11: 3:1 para lo gráfico).
    expect(contraste(COLORES_ICONO_SIN_VERIFICAR.fondo, '#ffffff')).toBeGreaterThanOrEqual(3);
  });

  it('el cálculo de contraste es el de WCAG', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contraste('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contraste('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });

  it('el chip lleva el texto visible y un icono', () => {
    const chip = html(createElement(ChipEstado, { estado: 'nuevo' }));
    expect(chip).toContain('NO SE HA VERIFICADO');
    expect(chip).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html(createElement(ChipEstado, { estado: 'validado' }))).toContain('Verificado');
  });

  it('aparece en la tarjeta de la lista', () => {
    const tarjeta = html(createElement(TarjetaReporte, { reporte: reporte('nuevo') }));
    expect(tarjeta).toContain('NO SE HA VERIFICADO');
    expect(tarjeta).toMatch(/<svg/);
    const verificada = html(
      createElement(TarjetaReporte, { reporte: reporte('validado', { verificado: true }) }),
    );
    expect(verificada).toContain('Verificado');
    expect(verificada).not.toContain('NO SE HA VERIFICADO');
  });

  it('aparece en el detalle, con qué significa', () => {
    const detalle = html(conCiudad(createElement(HojaDetalle, { reporte: reporte('nuevo') })));
    expect(detalle).toContain('NO SE HA VERIFICADO');
    expect(detalle).toMatch(/todavía no lo revisó un técnico/);
    const verificado = html(
      conCiudad(createElement(HojaDetalle, { reporte: reporte('validado') })),
    );
    expect(verificado).toContain('Verificado');
    expect(verificado).not.toContain('NO SE HA VERIFICADO');
  });

  it('aparece en la leyenda del mapa, con su icono al lado', () => {
    const leyenda = html(createElement(LeyendaMapa));
    expect(leyenda).toMatch(/data-testid="leyenda-mapa"/);
    expect(leyenda).toMatch(/<svg[^>]*aria-hidden="true"[^>]*>.*?<\/svg>\s*NO SE HA VERIFICADO/);
    expect(leyenda).toContain('Verificado');
    // La coropleta también se explica: gris es «sin reportes verificados».
    expect(leyenda).toMatch(/sin reportes verificados/);
  });
});

describe('las pastillas del mapa', () => {
  it('dicen en su nombre accesible si el punto no se verificó', () => {
    expect(ariaPastilla('alta', 'nuevo')).toBe('Punto de severidad alta, no se ha verificado');
    expect(ariaPastilla('critica', 'nuevo')).toBe(
      'Punto de severidad crítica, no se ha verificado',
    );
    expect(ariaPastilla('media', 'validado')).toBe('Punto de severidad media, verificado');
    expect(ariaPastilla('baja', 'resuelto')).toBe('Punto de severidad baja, resuelto');
  });

  it('el mapa usa ese nombre y agrega el icono a las que no se verificaron', () => {
    const fuente = leerFuente('componentes/Mapa.tsx');
    expect(fuente).toMatch(/setAttribute\('aria-label', ariaPastilla\(/);
    expect(fuente).toMatch(/ICONO_SIN_VERIFICAR_SVG/);
    expect(fuente).not.toMatch(/`Punto de severidad \$\{/);
  });
});

describe('la coropleta pública, solo con verificados', () => {
  const agregado = (extra: Partial<AgregadoUv>): AgregadoUv => ({
    unidad_vecinal_id: 'unidad_vecinal:57',
    codigo: '57',
    nombre: 'Unidad Vecinal 57',
    distrito_id: 'distrito_municipal:01',
    n_reportes: 3,
    n_verificados: 0,
    n_puntos_criticos: 0,
    severidad_max: 'critica',
    severidad_max_verificada: null,
    ...extra,
  });

  it('una UV con solo reportes sin verificar no toma la gravedad de ellos', () => {
    // Un solo reporte falso de más de 70 cm pintaría de crítica una UV entera.
    expect(estadoDeUv(agregado({}))).toEqual({ n: 3, nVerificados: 0, sev: null });
  });

  it('con verificados usa severidad_max_verificada, no severidad_max', () => {
    expect(estadoDeUv(agregado({ n_verificados: 1, severidad_max_verificada: 'media' }))).toEqual({
      n: 3,
      nVerificados: 1,
      sev: 'media',
    });
  });

  it('con un geo-service anterior (sin los campos nuevos) todo queda neutro', () => {
    const viejo = { ...agregado({}) } as Partial<AgregadoUv>;
    delete viejo.n_verificados;
    delete viejo.severidad_max_verificada;
    expect(estadoDeUv(viejo as AgregadoUv).sev).toBeNull();
  });

  it('el color: el de la severidad verificada, y neutro sin verificados', () => {
    const expr = expresionColorUv() as unknown[];
    expect(expr[0]).toBe('match');
    for (const s of ['baja', 'media', 'alta', 'critica'] as Severidad[]) {
      const i = expr.indexOf(s);
      expect(i, s).toBeGreaterThan(0);
      expect(expr[i + 1]).toBe(colorSeveridad(s).relleno);
    }
    expect(expr.at(-1)).toBe(COLOR_UV_SIN_VERIFICAR);
    expect(JSON.stringify(expr[1])).toContain('feature-state');
  });

  it('la etiqueta de una UV sin verificados lleva la marca', () => {
    expect(etiquetaDeUv('UV 57', { n: 2, nVerificados: 0 })).toBe(
      'UV 57 · 2 reportes · NO SE HA VERIFICADO',
    );
    expect(etiquetaDeUv('UV 57', { n: 1, nVerificados: 1 })).toBe('UV 57 · 1 reporte');
    expect(etiquetaDeUv('UV 57', { n: 0, nVerificados: 0 })).toBe('UV 57');
  });

  it('el mapa pinta las unidades vecinales con esa expresión y ese estado', () => {
    const fuente = leerFuente('componentes/Mapa.tsx');
    expect(fuente).toMatch(/expresionColorUv\(\)/);
    expect(fuente).toMatch(/estadoDeUv\(/);
    expect(fuente).toMatch(/etiquetaDeUv\(/);
  });
});

describe('los textos de la moderación previa se reescribieron', () => {
  it('ningún texto de la app dice «antes de publicarlo» ni «solo vos»', () => {
    const culpables = archivosDeLaApp()
      .filter(({ texto }) =>
        /antes de publicarlo|antes de publicarse|solo vos|sólo vos/i.test(texto),
      )
      .map(({ ruta }) => ruta);
    expect(culpables).toEqual([]);
  });

  it('«puntos publicados» pasa a «puntos reportados»', () => {
    const culpables = archivosDeLaApp()
      .filter(({ texto }) => /puntos? publicados?/i.test(texto))
      .map(({ ruta }) => ruta);
    expect(culpables).toEqual([]);
    expect(textoDelResumen({ sueltos: 0, agrupaciones: 0, agrupados: 0 })).toBe(
      'Ningún punto reportado en la vista actual del mapa.',
    );
    expect(leerFuente('componentes/VistaMapa.tsx')).toMatch(/'puntos reportados'/);
    expect(leerFuente('componentes/Portada.tsx')).toMatch(/'puntos reportados'/);
  });

  it('un reporte que ya no está se explica como retirado o sumado a otro punto', () => {
    for (const ruta of ['app/reporte/[id]/page.tsx', 'componentes/VistaMapa.tsx'])
      expect(leerFuente(ruta), ruta).toContain('retirado del mapa o sumado a otro punto');
  });

  it('«Cómo funciona» explica la publicación sin revisión previa', () => {
    const texto = html(createElement(ComoFunciona));
    expect(texto).toContain('NO SE HA VERIFICADO');
    expect(texto).not.toMatch(/Recién cuando lo valida/);
  });

  it('las láminas de bienvenida y la portada ya no prometen una revisión previa', () => {
    for (const ruta of ['componentes/Bienvenida.tsx', 'componentes/Portada.tsx']) {
      const fuente = leerFuente(ruta);
      expect(fuente, ruta).toMatch(/TEXTO_SIN_VERIFICAR/);
      expect(fuente, ruta).not.toMatch(/lo verifica antes|revisa cada reporte antes/);
    }
  });
});
