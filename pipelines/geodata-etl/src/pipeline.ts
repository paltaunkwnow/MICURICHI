/**
 * Orquestación del ETL por versión (CLAUDE.md §6): inspección → reproyección → validación →
 * normalización → simplificación → salida + reporte de calidad + metadata. Idempotente.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as turf from '@turf/turf';
import type { TipoCapa } from 'contracts';
import type { Feature, FeatureCollection } from 'geojson';
import { type Config, dirProcessed, rutaAbsoluta, type VersionConfig } from './config.js';
import { limpiar, shapefileAWgs84, simplificar } from './mapshaper.js';
import {
  asignarPadre,
  detectarHuecos,
  detectarSolapes,
  estadisticas,
  geometriaVacia,
  type Hallazgo,
  idDe,
  type ReporteCalidad,
  resumir,
  validarGeometrias,
} from './pasos/calidad.js';
import {
  autodetectarCampo,
  normalizar,
  redondearCoordenadas,
  soloCamposDeRender,
} from './pasos/normalizar.js';
import {
  type ConjuntoShapefile,
  detectarCapa,
  leerCrs,
  leerEncoding,
  listarShapefiles,
} from './shapefile.js';

export class ErrorEtl extends Error {}

export interface CapaResuelta {
  capa: TipoCapa;
  conjunto: ConjuntoShapefile;
  campos: {
    codigo: string | null;
    nombre: string | null;
    distrito: string | null;
    unidad_vecinal: string | null;
    respaldo: string | null;
    plantilla_nombre: string | null;
  };
}

const ORDEN: TipoCapa[] = ['distrito_municipal', 'unidad_vecinal', 'manzana'];

/** Resuelve qué archivo corresponde a cada capa (config explícita o autodetección por nombre). */
export function resolverCapas(v: VersionConfig): CapaResuelta[] {
  const carpeta = rutaAbsoluta(v.carpeta);
  const conjuntos = listarShapefiles(carpeta);
  if (!conjuntos.length)
    throw new ErrorEtl(
      `No hay shapefiles en ${carpeta}. Copiá la carpeta ${v.version} a data/raw/ con su MANIFEST.md.`,
    );
  const salida: CapaResuelta[] = [];
  for (const capa of ORDEN) {
    const cfg = v.capas[capa];
    if (!cfg) continue;
    let conjunto: ConjuntoShapefile | undefined;
    if (cfg.archivo) {
      const base = cfg.archivo.replace(/\.shp$/i, '');
      conjunto = conjuntos.find((c) => c.nombre === base);
      if (!conjunto)
        throw new ErrorEtl(
          `La capa ${capa} declara archivo ${cfg.archivo}, que no existe en ${carpeta}`,
        );
    } else {
      const candidatos = conjuntos.filter((c) => detectarCapa(c.nombre) === capa);
      if (candidatos.length === 1) conjunto = candidatos[0];
      else if (candidatos.length > 1)
        throw new ErrorEtl(
          `Varios archivos podrían ser ${capa}: ${candidatos.map((c) => c.nombre).join(', ')}. Fijá 'archivo' en config/capas.yaml.`,
        );
      else if (capa !== 'manzana')
        throw new ErrorEtl(
          `No se pudo autodetectar el archivo de ${capa} en ${carpeta}. Fijá 'archivo' en config/capas.yaml. Archivos: ${conjuntos.map((c) => c.nombre).join(', ')}`,
        );
      else continue;
    }
    if (!conjunto) continue;
    salida.push({
      capa,
      conjunto,
      campos: {
        codigo: cfg.campos.codigo,
        nombre: cfg.campos.nombre,
        distrito: cfg.campos.distrito ?? null,
        unidad_vecinal: cfg.campos.unidad_vecinal ?? null,
        respaldo: cfg.campos.respaldo ?? null,
        plantilla_nombre: cfg.campos.plantilla_nombre ?? null,
      },
    });
  }
  return salida;
}

export interface Inspeccion {
  capa: TipoCapa;
  archivo: string;
  conjunto_completo: boolean;
  faltantes: string[];
  crs: ReturnType<typeof leerCrs>;
  encoding_cpg: string | null;
  n_features: number;
  tipos_geometria: Record<string, number>;
  atributos: ReporteCalidad['atributos'];
  bbox_4326: [number, number, number, number] | null;
  campos_sugeridos: Record<string, string | null>;
}

export async function inspeccionar(v: VersionConfig, cr: CapaResuelta): Promise<Inspeccion> {
  const c = cr.conjunto;
  const faltantes = (['shx', 'dbf', 'prj', 'cpg'] as const).filter((k) => !c[k]);
  const crs = leerCrs(c.prj);
  const puedeLeer = !!c.prj || !!v.crs_origen;
  let fc: FeatureCollection = { type: 'FeatureCollection', features: [] };
  if (puedeLeer)
    fc = await shapefileAWgs84(c, {
      crsOrigen: v.crs_origen,
      encoding: v.encoding ?? leerEncoding(c.cpg),
    });
  const est = estadisticas(fc, cr.capa);
  const campos = est.atributos.map((a) => a.campo);
  return {
    capa: cr.capa,
    archivo: c.shp,
    conjunto_completo: faltantes.length === 0,
    faltantes,
    crs,
    encoding_cpg: leerEncoding(c.cpg),
    n_features: est.n_entrada,
    tipos_geometria: est.tipos_geometria,
    atributos: est.atributos,
    bbox_4326: est.bbox,
    campos_sugeridos: {
      codigo: cr.campos.codigo ?? autodetectarCampo(campos, 'codigo', cr.capa),
      nombre: cr.campos.nombre ?? autodetectarCampo(campos, 'nombre', cr.capa),
      distrito:
        cr.capa === 'distrito_municipal'
          ? null
          : (cr.campos.distrito ?? autodetectarCampo(campos, 'distrito', cr.capa)),
      unidad_vecinal:
        cr.capa === 'manzana'
          ? (cr.campos.unidad_vecinal ?? autodetectarCampo(campos, 'unidad_vecinal', cr.capa))
          : null,
    },
  };
}

export interface ResultadoCapa {
  capa: TipoCapa;
  n_entrada: number;
  n_salida: number;
  bytes_full: number;
  bytes_web: number;
  reparada: boolean;
  hallazgos: Record<string, number>;
  salida_dir: string;
}

function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

function escribirJson(ruta: string, obj: unknown): number {
  const texto = `${JSON.stringify(obj)}\n`;
  writeFileSync(ruta, texto);
  return Buffer.byteLength(texto);
}

function reporteMarkdown(
  v: VersionConfig,
  r: ReporteCalidad,
  insp: Inspeccion,
  extra: Record<string, unknown>,
): string {
  const lineas = [
    `# Reporte de calidad — ${r.capa} · versión ${v.version}`,
    '',
    `Generado por pipelines/geodata-etl (Parte 5). Fuente: ${v.fuente}.`,
    '',
    '## Inspección',
    `- Archivo: \`${insp.archivo}\``,
    `- Conjunto completo: ${insp.conjunto_completo ? 'sí' : `NO, faltan: ${insp.faltantes.join(', ')}`}`,
    `- CRS declarado (.prj): ${insp.crs.nombre ?? 'sin .prj'}${insp.crs.epsg_probable ? ` (≈ ${insp.crs.epsg_probable})` : ''}${v.crs_origen ? ` · forzado por config: ${v.crs_origen}` : ''}`,
    `- Encoding (.cpg): ${insp.encoding_cpg ?? 'no declarado'}${v.encoding ? ` · forzado: ${v.encoding}` : ''}`,
    `- Features: ${r.n_entrada} → ${r.n_salida}`,
    `- Tipos de geometría: ${Object.entries(r.tipos_geometria)
      .map(([k, n]) => `${k}=${n}`)
      .join(', ')}`,
    `- Bbox EPSG:4326: ${r.bbox ? r.bbox.map((n) => n.toFixed(5)).join(', ') : '—'}`,
    '',
    '## Atributos de entrada',
    '| campo | tipo | nulos |',
    '|---|---|---|',
    ...r.atributos.map((a) => `| ${a.campo} | ${a.tipo} | ${a.nulos} |`),
    '',
    '## Resumen de hallazgos',
    ...(Object.keys(r.resumen).length
      ? Object.entries(r.resumen).map(([k, n]) => `- ${k}: ${n}`)
      : ['- sin hallazgos']),
    '',
    '## Detalle (máximo 200)',
    ...r.hallazgos
      .slice(0, 200)
      .map(
        (h) =>
          `- **${h.tipo}** ${h.ids.join(' · ')}${h.area_m2 !== undefined ? ` · ${h.area_m2} m²` : ''}${h.detalle ? ` — ${h.detalle}` : ''}`,
      ),
    '',
    '## Proceso',
    ...Object.entries(extra).map(
      ([k, val]) => `- ${k}: ${typeof val === 'object' ? JSON.stringify(val) : String(val)}`,
    ),
    '',
  ];
  return lineas.join('\n');
}

export interface OpcionesRun {
  forzar?: boolean;
  log?: (m: string) => void;
}

/** Procesa todas las capas de una versión. Las capas padre se procesan primero para inferir jerarquías. */
export async function procesarVersion(
  cfg: Config,
  v: VersionConfig,
  o: OpcionesRun = {},
): Promise<ResultadoCapa[]> {
  const log = o.log ?? console.log;
  const capas = resolverCapas(v);
  const salidaDir = dirProcessed(v.version);
  mkdirSync(salidaDir, { recursive: true });
  const procesadas = new Map<TipoCapa, FeatureCollection>();
  const resultados: ResultadoCapa[] = [];

  for (const cr of capas) {
    const c = cr.conjunto;
    log(`\n[${v.version}/${cr.capa}] ${c.shp}`);
    if (!c.prj && !v.crs_origen) {
      throw new ErrorEtl(
        `${c.nombre}.shp no tiene .prj y la versión ${v.version} no declara crs_origen. DETENIDO: confirmá el CRS de origen (p. ej. EPSG:32720) y ponelo en config/capas.yaml. No se adivina.`,
      );
    }
    const insp = await inspeccionar(v, cr);
    const hallazgos: Hallazgo[] = [];
    const proceso: Record<string, unknown> = {};

    // 1) reproyección
    const crudo = await shapefileAWgs84(c, {
      crsOrigen: v.crs_origen,
      encoding: v.encoding ?? leerEncoding(c.cpg),
    });
    proceso.reproyeccion = `${insp.crs.epsg_probable ?? insp.crs.nombre ?? v.crs_origen} → EPSG:4326 (mapshaper -proj wgs84)`;
    log(`  reproyectado: ${crudo.features.length} features`);

    // 2) clave estable por feature: los shapefiles crudos no traen `id`, así que se arma con los
    //    campos configurados. Si no es única, la verificación de la reparación se hace por área total.
    const campos = insp.atributos.map((a) => a.campo);
    const campoCodigo = cr.campos.codigo ?? autodetectarCampo(campos, 'codigo', cr.capa);
    if (!campoCodigo)
      throw new ErrorEtl(
        `${cr.capa}: no se pudo determinar el campo de código. Campos: ${campos.join(', ')}. Fijalo en config/capas.yaml.`,
      );
    const campoNombre = cr.campos.nombre ?? autodetectarCampo(campos, 'nombre', cr.capa);
    const claveDe = (f: Feature): string | null => {
      const p = f.properties ?? {};
      const partes = [campoCodigo, cr.campos.respaldo, cr.campos.distrito, cr.campos.unidad_vecinal]
        .filter((c): c is string => !!c)
        .map((c) => String(p[c] ?? ''));
      const clave = partes.join('|');
      return clave.replace(/\|/g, '') ? clave : null;
    };
    const claves = crudo.features.map(claveDe);
    const clavesUnicas =
      claves.every((k) => k !== null) && new Set(claves as string[]).size === claves.length;
    const identificar = (f: Feature, i: number) => claveDe(f) ?? idDe(f, i);
    proceso.claves = clavesUnicas
      ? `únicas por (${[campoCodigo, cr.campos.respaldo].filter(Boolean).join(', ')})`
      : 'NO únicas: la reparación se verifica por área total de la capa, no feature por feature';

    // 3) validación antes de reparar
    const antes = [
      ...validarGeometrias(crudo),
      ...(cr.capa === 'manzana' ? [] : detectarSolapes(crudo)),
    ];
    hallazgos.push(...antes);

    // 4) exclusión de geometrías vacías y duplicadas (antes de reparar, para no arrastrarlas)
    const excluir = new Set(
      antes
        .filter((h) => h.tipo === 'vacia')
        .flatMap((h) => h.ids)
        .concat(antes.filter((h) => h.tipo === 'duplicada').map((h) => h.ids[1] as string)),
    );
    let fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: crudo.features.filter((f, i) => !excluir.has(idDe(f, i))),
    };
    if (excluir.size) log(`  excluidas ${excluir.size} geometrías vacías o duplicadas`);

    // 5) reparación con -clean, verificada por área (por feature si las claves son únicas)
    let reparada = false;
    const areaTotal = (x: FeatureCollection) =>
      x.features.reduce((s, f) => s + (f.geometry ? turf.area(f) : 0), 0);
    if (antes.some((h) => h.tipo === 'invalida' || h.tipo === 'solape')) {
      const teselada = cr.capa !== 'manzana';
      const limpio = await limpiar(fc, teselada);
      const areaAntes = areaTotal(fc);
      const areaDespues = areaTotal(limpio);
      const cambioTotal = areaAntes ? Math.abs(areaDespues - areaAntes) / areaAntes : 0;
      let noSeguras = 0;
      if (clavesUnicas) {
        const areasAntes = new Map(
          fc.features.map((f, i) => [identificar(f, i), f.geometry ? turf.area(f) : 0]),
        );
        limpio.features.forEach((f, i) => {
          const id = identificar(f, i);
          const a0 = areasAntes.get(id);
          if (a0 === undefined) return; // feature nueva o sin par: se refleja en el área total
          const a1 = f.geometry ? turf.area(f) : 0;
          const cambio = a0 ? Math.abs(a1 - a0) / a0 : 0;
          if (cambio > cfg.tolerancia_cambio_area_feature) {
            noSeguras++;
            hallazgos.push({
              tipo: 'reparacion_no_segura',
              ids: [id],
              detalle: `área ${a0.toFixed(1)} → ${a1.toFixed(1)} m² (${(cambio * 100).toFixed(2)} %)`,
            });
          } else if (a0 !== a1)
            hallazgos.push({
              tipo: 'reparada',
              ids: [id],
              detalle: `área ${a0.toFixed(1)} → ${a1.toFixed(1)} m²`,
            });
        });
      }
      const despues = [
        ...validarGeometrias(limpio),
        ...(cr.capa === 'manzana' ? [] : detectarSolapes(limpio)),
      ];
      proceso.reparacion = {
        modo: teselada
          ? '-clean (topológico: la capa debe teselar)'
          : '-clean allow-overlaps no-snap (conserva vértices)',
        antes: resumir(antes),
        despues: resumir(despues),
        features: `${fc.features.length} → ${limpio.features.length}`,
        area_km2: `${(areaAntes / 1e6).toFixed(3)} → ${(areaDespues / 1e6).toFixed(3)}`,
        cambio_area_total_pct: Number((cambioTotal * 100).toFixed(4)),
        no_seguras: clavesUnicas ? noSeguras : 'no evaluable por feature (claves no únicas)',
      };
      const limite = cfg.tolerancia_cambio_area;
      const limiteFeature = cfg.tolerancia_cambio_area_feature;
      if (cambioTotal > limite && !o.forzar)
        throw new ErrorEtl(
          `${cr.capa}: la reparación cambia el área total de la capa un ${(cambioTotal * 100).toFixed(3)} % (límite ${limite * 100} %). Revisá ${join(salidaDir, cr.capa, 'reporte_calidad.md')} y reejecutá con --forzar si es aceptable.`,
        );
      if (noSeguras && !o.forzar)
        throw new ErrorEtl(
          `${cr.capa}: ${noSeguras} features cambian de área más de ${limiteFeature * 100} %. Revisá el reporte y reejecutá con --forzar si es aceptable.`,
        );
      // `-clean` puede dejar polígonos con anillos vacíos: se descartan para que turf no falle después
      const sanas = limpio.features.filter((f) => !geometriaVacia(f));
      if (sanas.length !== limpio.features.length) {
        const n = limpio.features.length - sanas.length;
        hallazgos.push({
          tipo: 'vacia',
          ids: [],
          detalle: `${n} geometrías quedaron sin coordenadas tras la reparación y se descartaron`,
        });
        log(`  descartadas ${n} geometrías vacías tras la reparación`);
      }
      fc = { type: 'FeatureCollection', features: sanas };
      reparada = true;
      log(`  reparado con -clean: ${JSON.stringify(proceso.reparacion)}`);
    }

    // 6) jerarquía y normalización
    let padreResuelto: Map<number, string> | undefined;
    let distritoInferido: Set<number> | undefined;
    let uvResuelta: Map<number, string> | undefined;
    if (cr.capa !== 'distrito_municipal') {
      const padres = procesadas.get('distrito_municipal');
      if (padres) {
        const campoDistrito = cr.campos.distrito ?? autodetectarCampo(campos, 'distrito', cr.capa);
        const r = asignarPadre(fc, padres, campoDistrito);
        // asignarPadre devuelve ids ya normalizados del padre (distrito_municipal:XX) y resuelve
        // por su cuenta declarado vs. contención, así que su resultado es el que manda.
        padreResuelto = r.asignacion;
        distritoInferido = r.inferidos;
        hallazgos.push(...r.hallazgos);
        proceso.distrito = {
          campo: campoDistrito ?? 'inferido espacialmente',
          inferidos: r.inferidos.size,
        };
      }
    }
    if (cr.capa === 'manzana') {
      const uvs = procesadas.get('unidad_vecinal');
      if (uvs) {
        const campoUv =
          cr.campos.unidad_vecinal ?? autodetectarCampo(campos, 'unidad_vecinal', cr.capa);
        const r = asignarPadre(fc, uvs, campoUv);
        uvResuelta = r.asignacion;
        hallazgos.push(...r.hallazgos);
        proceso.unidad_vecinal = {
          campo: campoUv ?? 'inferida espacialmente',
          inferidas: r.inferidos.size,
        };
      }
    }
    const normalizado = redondearCoordenadas(
      normalizar(fc, {
        capa: cr.capa,
        version: v.version,
        fuente: v.fuente,
        fecha_vigencia: v.fecha_vigencia,
        campoCodigo,
        campoNombre,
        campoDistrito: cr.campos.distrito ?? autodetectarCampo(campos, 'distrito', cr.capa),
        campoUv: cr.campos.unidad_vecinal ?? autodetectarCampo(campos, 'unidad_vecinal', cr.capa),
        padreResuelto,
        uvResuelta,
        distritoInferido,
        campoRespaldo: cr.campos.respaldo,
        plantillaNombre: cr.campos.plantilla_nombre,
        alResolverId: (aviso) =>
          hallazgos.push({
            tipo: aviso.tipo === 'codigo_vacio' ? 'sin_codigo' : 'codigo_repetido',
            ids: [aviso.id],
            detalle: aviso.detalle,
          }),
      }),
      7,
    );
    // 7) huecos (solo UV respecto de distritos)
    if (cr.capa === 'unidad_vecinal') {
      const padres = procesadas.get('distrito_municipal');
      if (padres) hallazgos.push(...detectarHuecos(padres, normalizado, 'distrito_id'));
    }
    procesadas.set(cr.capa, normalizado);

    // 8) salidas
    const dirCapa = join(salidaDir, cr.capa);
    mkdirSync(dirCapa, { recursive: true });
    const bytesFull = escribirJson(join(dirCapa, `${cr.capa}.full.geojson`), normalizado);
    const intervalo = cfg.simplificacion[cr.capa];
    const web = soloCamposDeRender(
      redondearCoordenadas(await simplificar(normalizado, intervalo), 6),
    );
    const bytesWeb = escribirJson(join(dirCapa, `${cr.capa}.web.geojson`), web);
    proceso.simplificacion = {
      herramienta: 'mapshaper visvalingam keep-shapes',
      intervalo_m: intervalo,
      bytes_full: bytesFull,
      bytes_web: bytesWeb,
      teselas: bytesWeb > cfg.umbral_teselas_bytes,
    };

    const reporte: ReporteCalidad = {
      ...estadisticas(crudo, cr.capa),
      n_salida: normalizado.features.length,
      hallazgos,
      resumen: resumir(hallazgos),
    };
    writeFileSync(join(dirCapa, 'reporte_calidad.json'), `${JSON.stringify(reporte, null, 2)}\n`);
    writeFileSync(join(dirCapa, 'reporte_calidad.md'), reporteMarkdown(v, reporte, insp, proceso));
    const manifiesto = join(rutaAbsoluta(v.carpeta), 'MANIFEST.md');
    writeFileSync(
      join(dirCapa, 'metadata.json'),
      `${JSON.stringify(
        {
          capa: cr.capa,
          version: v.version,
          fuente: v.fuente,
          fecha_vigencia: v.fecha_vigencia,
          crs_origen: v.crs_origen ?? insp.crs.epsg_probable ?? insp.crs.nombre,
          crs_origen_wkt: insp.crs.wkt,
          crs_salida: 'EPSG:4326',
          n_features_entrada: crudo.features.length,
          n_features_salida: normalizado.features.length,
          tolerancia_web_m: intervalo,
          reparada,
          sha256_entrada: {
            shp: sha256(readFileSync(c.shp)),
            dbf: c.dbf ? sha256(readFileSync(c.dbf)) : null,
          },
          sha256_manifiesto: existsSync(manifiesto) ? sha256(readFileSync(manifiesto)) : null,
          sha256_salida: {
            full: sha256(readFileSync(join(dirCapa, `${cr.capa}.full.geojson`))),
            web: sha256(readFileSync(join(dirCapa, `${cr.capa}.web.geojson`))),
          },
          herramientas: { mapshaper: '0.7.x', turf: '7.4.x' },
          fecha_ejecucion: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    );
    log(
      `  salida: ${dirCapa} (full ${(bytesFull / 1024).toFixed(0)} KB, web ${(bytesWeb / 1024).toFixed(0)} KB, hallazgos ${JSON.stringify(reporte.resumen)})`,
    );
    resultados.push({
      capa: cr.capa,
      n_entrada: crudo.features.length,
      n_salida: normalizado.features.length,
      bytes_full: bytesFull,
      bytes_web: bytesWeb,
      reparada,
      hallazgos: reporte.resumen,
      salida_dir: dirCapa,
    });
  }
  return resultados;
}
