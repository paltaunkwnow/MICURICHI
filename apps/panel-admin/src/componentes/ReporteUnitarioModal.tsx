'use client';

import { type Ciudad, NOTA_METODOLOGICA, type ReporteTecnicoFeature } from 'contracts';
import { Download, FileCode, FileText, Printer, X } from 'lucide-react';
import type { RefObject } from 'react';
import { useCiudad, useFormato } from '@/lib/ciudad-contexto';
import { useDialogoModal } from '@/lib/dialogo';
import {
  aclaracionMetodo,
  etiquetaCausa,
  etiquetaDistrito,
  etiquetaEstado,
  etiquetaFrecuencia,
  etiquetaMetodo,
  etiquetaProfundidad,
  etiquetaSeveridad,
  etiquetaSiNo,
  etiquetaSumideroCercano,
  etiquetaSumideroEstado,
  etiquetaUbicacionTipo,
  etiquetaUnidadVecinal,
  idCorto,
  precisionGps,
} from '@/lib/formato';
import { textoPuntaje } from '@/lib/severidad';

/** Ancho de la ficha en texto plano: el de sus rayas. */
const ANCHO_TXT = 80;

/**
 * Encabezado de la ficha: el sistema y la ciudad de la instalación, nada más. La ficha no es un
 * formulario de ninguna oficina: ningún organismo, cargo ni unidad sale de este código.
 */
function encabezadoFicha(ciudad: Pick<Ciudad, 'nombre'>): string {
  return `Mi Curichi · ${ciudad.nombre}`;
}

/** Parte un párrafo en líneas de hasta `ancho` columnas, sin cortar palabras. */
function ajustarLineas(texto: string, ancho: number): string {
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of texto.split(/\s+/)) {
    if (actual && actual.length + 1 + palabra.length > ancho) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = actual ? `${actual} ${palabra}` : palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.join('\n');
}

/** Sangría de los valores del .txt: el ancho de «Método de Captura:  ». */
const SANGRIA_TXT = ' '.repeat(20);

/**
 * El valor del renglón «Método de Captura» del .txt. Con una aclaración (ubicación aproximada, ADR
 * 0007) la suma debajo, sangrada bajo el valor y partida para que la ficha siga en `ANCHO_TXT`
 * columnas.
 */
function metodoDeCapturaTxt(p: ReporteTecnicoFeature['properties']): string {
  const etiqueta = etiquetaMetodo(p.ubicacion_metodo, p.distancia_dispositivo_m);
  const aclaracion = aclaracionMetodo(p.ubicacion_metodo);
  if (!aclaracion) return etiqueta;
  const renglones = ajustarLineas(aclaracion, ANCHO_TXT - SANGRIA_TXT.length)
    .split('\n')
    .map((renglon) => `${SANGRIA_TXT}${renglon}`);
  return [etiqueta, ...renglones].join('\n');
}

export function generarTextoReporteUnitario(
  f: ReporteTecnicoFeature,
  formato: { fechaHora: (f: string | null | undefined) => string; numero: (n: number) => string },
  ciudad: Pick<Ciudad, 'nombre'>,
): string {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;

  return `================================================================================
${encabezadoFicha(ciudad)}
FICHA TÉCNICA - REPORTE UNITARIO DE INUNDACIÓN
================================================================================
FECHA DE EMISIÓN: ${formato.fechaHora(new Date().toISOString())}

1. IDENTIFICACIÓN DEL REPORTE
--------------------------------------------------------------------------------
ID Reporte (UUID):  ${p.id}
Código de Rastreo:  ${idCorto(p.id)}
Fecha de Recepción: ${formato.fechaHora(p.creado_en)}
Fecha del Evento:   ${formato.fechaHora(p.evento_en) || 'No especificada'}
Estado Actual:      ${etiquetaEstado(p.estado).toUpperCase()}
Condición:          ${p.verificado ? 'TÉCNICAMENTE VERIFICADO' : 'NO SE HA VERIFICADO'}
Punto Crítico:      ${p.punto_critico_id ? idCorto(p.punto_critico_id) : 'Ninguno'}

2. LOCALIZACIÓN TERRITORIAL Y GEOGRÁFICA
--------------------------------------------------------------------------------
Distrito Municipal: ${p.distrito?.nombre || etiquetaDistrito(p.distrito?.codigo) || 'Sin asignar'}
Unidad Vecinal:     ${p.unidad_vecinal?.nombre || etiquetaUnidadVecinal(p.unidad_vecinal?.codigo) || 'Sin asignar'}
Coordenadas WGS84:  Latitud: ${lat.toFixed(6)}, Longitud: ${lon.toFixed(6)}
Tipo de Ubicación:  ${etiquetaUbicacionTipo(p.ubicacion_tipo)}
Método de Captura:  ${metodoDeCapturaTxt(p)}
Precisión GPS:      ${precisionGps(p.precision_gps_m)}

3. DATOS DEL REPORTE Y SEVERIDAD
--------------------------------------------------------------------------------
Profundidad Estimada: ${etiquetaProfundidad(p.profundidad_estimada)}
Frecuencia de Agua:   ${etiquetaFrecuencia(p.frecuencia)}
Causa Presunta:       ${etiquetaCausa(p.causa_presunta)}
Sumidero Cercano:     ${p.sumidero_cercano ? etiquetaSumideroCercano(p.sumidero_cercano) : 'Sin dato'}
Sumidero Tapado:      ${p.sumidero_estado ? etiquetaSumideroEstado(p.sumidero_estado) : 'Sin dato'}
Agua Brota Sumidero:  ${etiquetaSiNo(p.agua_brota_sumidero)}
Puntaje de Severidad: ${textoPuntaje(p.severidad_puntaje)}
Severidad Calculada:  ${etiquetaSeveridad(p.severidad_calculada).toUpperCase()}
Severidad Efectiva:   ${etiquetaSeveridad(p.severidad).toUpperCase()}
Reclasif. Manual:     ${p.severidad_manual ? etiquetaSeveridad(p.severidad_manual) : 'No aplicada'}
Motivo Reclasif.:     ${p.severidad_motivo || 'Ninguno'}

4. DESCRIPCIÓN DEL CIUDADANO
--------------------------------------------------------------------------------
"${p.descripcion}"

5. MODERACIÓN Y CIERRE TÉCNICO
--------------------------------------------------------------------------------
Validado Por:       ${p.validado_por || 'Pendiente de asignación'}
Fecha Validación:   ${formato.fechaHora(p.validado_en) || 'Pendiente'}
Motivo de Estado:   ${p.estado_motivo || 'Sin observaciones'}
Autor Registrado:   ${p.autor_id ? `Cuenta registrada (${p.autor_id})` : 'Anónimo'}

6. REGISTRO FOTOGRÁFICO
--------------------------------------------------------------------------------
${p.fotos.length === 0 ? 'Sin fotografías adjuntas.' : p.fotos.map((u, i) => `[Foto ${i + 1}] ${u}`).join('\n')}

7. LIMITACIONES
--------------------------------------------------------------------------------
${ajustarLineas(NOTA_METODOLOGICA, ANCHO_TXT)}

================================================================================


________________________________            ________________________________
Firma y aclaración                          Firma y aclaración
================================================================================
`;
}

/**
 * El Feature tal como llegó, más la nota metodológica (§9.4) como miembro propio: GeoJSON admite
 * miembros extra en un Feature (RFC 7946, §6.1) y así el archivo no viaja sin sus limitaciones.
 */
export function generarJsonReporteUnitario(f: ReporteTecnicoFeature): string {
  return JSON.stringify({ ...f, nota_metodologica: NOTA_METODOLOGICA }, null, 2);
}

export function descargarArchivo(contenido: string, nombreArchivo: string, tipoMime: string) {
  const blob = new Blob([contenido], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Ficha del reporte, para imprimir o descargar. Es un diálogo modal (CLAUDE.md §14.1): el foco
 * entra al abrirlo, Tab no sale de él, Escape lo cierra y el foco vuelve a `retorno` (el botón que
 * lo abrió) al cerrarlo.
 */
export function ReporteUnitarioModal({
  reporte,
  onCerrar,
  retorno,
}: {
  reporte: ReporteTecnicoFeature;
  onCerrar: () => void;
  /** El botón que abre la ficha, para devolverle el foco al cerrarla. */
  retorno?: RefObject<HTMLElement | null>;
}) {
  const ciudad = useCiudad();
  const formato = useFormato();
  const { fechaHora, numero } = formato;
  const p = reporte.properties;
  const [lon, lat] = reporte.geometry.coordinates;
  const aclaracionUbicacion = aclaracionMetodo(p.ubicacion_metodo);
  const { dialogo, alTeclear } = useDialogoModal({ onCerrar, retorno });

  const imprimir = () => {
    window.print();
  };

  const descargarTxt = () => {
    const texto = generarTextoReporteUnitario(reporte, { fechaHora, numero }, ciudad);
    descargarArchivo(texto, `reporte-unitario-${idCorto(p.id)}.txt`, 'text/plain;charset=utf-8');
  };

  const descargarJson = () => {
    descargarArchivo(
      generarJsonReporteUnitario(reporte),
      `reporte-unitario-${idCorto(p.id)}.json`,
      'application/json;charset=utf-8',
    );
  };

  return (
    <div
      ref={dialogo}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-reporte-unitario"
      // Enfocable por código, no por Tab: ahí cae el foco al abrir (sin recuadro: no es un control).
      tabIndex={-1}
      onKeyDown={alTeclear}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 outline-none"
    >
      <div className="relative my-8 flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
        {/* Barra superior de herramientas (oculta al imprimir) */}
        <div className="no-imprimir flex flex-wrap items-center justify-between gap-3 border-b border-tinta-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <FileText className="text-agua-600" size={24} aria-hidden="true" />
            <h2 id="titulo-reporte-unitario" className="text-xl font-bold text-tinta-900">
              Reporte Unitario · Ficha Técnica {idCorto(p.id)}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={imprimir}
              className="btn btn-primario btn-sm flex items-center gap-1.5"
              data-testid="btn-imprimir-reporte-unitario"
            >
              <Printer size={16} aria-hidden="true" />
              <span>Imprimir / PDF</span>
            </button>
            <button
              type="button"
              onClick={descargarTxt}
              className="btn btn-secundario btn-sm flex items-center gap-1.5"
              data-testid="btn-descargar-txt"
            >
              <Download size={16} aria-hidden="true" />
              <span>Descargar .txt</span>
            </button>
            <button
              type="button"
              onClick={descargarJson}
              className="btn btn-fantasma btn-sm flex items-center gap-1.5"
              data-testid="btn-descargar-json"
            >
              <FileCode size={16} aria-hidden="true" />
              <span>GeoJSON</span>
            </button>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar ventana"
              className="rounded-lg p-1.5 text-tinta-600 hover:bg-tinta-100"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Cuerpo del documento imprimible */}
        <div className="overflow-y-auto p-6 md:p-8">
          <div className="ficha-unitaria mx-auto max-w-3xl space-y-6 text-tinta-900">
            {/* Encabezado: el sistema y la ciudad de la instalación */}
            <div className="border-b-2 border-tinta-900 pb-4 text-center">
              <p className="text-xs font-semibold tracking-wider text-tinta-600 uppercase">
                {encabezadoFicha(ciudad)}
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-tinta-900">
                FICHA TÉCNICA - REPORTE UNITARIO DE INUNDACIÓN
              </h1>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-tinta-600">
                <span>
                  Emisión: <b>{fechaHora(new Date().toISOString())}</b>
                </span>
                <span>•</span>
                <span>
                  Código: <b className="font-mono">{idCorto(p.id)}</b>
                </span>
                <span>•</span>
                <span className="rounded bg-tinta-100 px-2 py-0.5 font-semibold text-tinta-900 uppercase">
                  Estado: {etiquetaEstado(p.estado)}
                </span>
              </div>
            </div>

            {/* Sección 1: Identificación y Estado */}
            <div className="ficha-seccion rounded-xl border border-tinta-200 p-4">
              <h3 className="border-b border-tinta-200 pb-2 text-sm font-bold text-tinta-700 uppercase">
                1. Identificación del Evento
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
                <div>
                  <span className="text-tinta-600">ID Completo (UUID):</span>{' '}
                  <span className="font-mono text-xs">{p.id}</span>
                </div>
                <div>
                  <span className="text-tinta-600">Condición Técnica:</span>{' '}
                  <b className={p.verificado ? 'text-verde-700' : 'text-amber-700'}>
                    {p.verificado ? 'Verificado por técnico' : 'Sin verificación técnica previa'}
                  </b>
                </div>
                <div>
                  <span className="text-tinta-600">Fecha de Recepción:</span>{' '}
                  <b>{fechaHora(p.creado_en)}</b>
                </div>
                <div>
                  <span className="text-tinta-600">Fecha Estimada Evento:</span>{' '}
                  <b>{fechaHora(p.evento_en) || 'No especificada'}</b>
                </div>
              </div>
            </div>

            {/* Sección 2: Localización Territorial */}
            <div className="ficha-seccion rounded-xl border border-tinta-200 p-4">
              <h3 className="border-b border-tinta-200 pb-2 text-sm font-bold text-tinta-700 uppercase">
                2. Localización Territorial y Geográfica
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
                <div>
                  <span className="text-tinta-600">Distrito Municipal:</span>{' '}
                  <b>
                    {p.distrito?.nombre || etiquetaDistrito(p.distrito?.codigo) || 'Sin asignar'}
                  </b>
                </div>
                <div>
                  <span className="text-tinta-600">Unidad Vecinal:</span>{' '}
                  <b>
                    {p.unidad_vecinal?.nombre ||
                      etiquetaUnidadVecinal(p.unidad_vecinal?.codigo) ||
                      'Sin asignar'}
                  </b>
                </div>
                <div>
                  <span className="text-tinta-600">Coordenadas WGS84:</span>{' '}
                  <span className="font-mono font-semibold">
                    {lat.toFixed(6)}, {lon.toFixed(6)}
                  </span>
                </div>
                <div>
                  <span className="text-tinta-600">Tipo de Ubicación:</span>{' '}
                  <b>{etiquetaUbicacionTipo(p.ubicacion_tipo)}</b>
                </div>
                <div>
                  <span className="text-tinta-600">Método de Captura:</span>{' '}
                  <b>{etiquetaMetodo(p.ubicacion_metodo, p.distancia_dispositivo_m)}</b>
                  {aclaracionUbicacion ? (
                    <span className="block text-xs text-tinta-600">{aclaracionUbicacion}</span>
                  ) : null}
                </div>
                <div>
                  <span className="text-tinta-600">Precisión Declarada:</span>{' '}
                  <b>{precisionGps(p.precision_gps_m)}</b>
                </div>
              </div>
            </div>

            {/* Sección 3: lo que dijo el vecino y la severidad que sale de eso */}
            <div className="ficha-seccion rounded-xl border border-tinta-200 p-4">
              <h3 className="border-b border-tinta-200 pb-2 text-sm font-bold text-tinta-700 uppercase">
                3. Datos del reporte y severidad
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
                <div>
                  <span className="text-tinta-600">Profundidad del Agua:</span>{' '}
                  <b>{etiquetaProfundidad(p.profundidad_estimada)}</b>
                </div>
                <div>
                  <span className="text-tinta-600">Frecuencia:</span>{' '}
                  <b>{etiquetaFrecuencia(p.frecuencia)}</b>
                </div>
                <div>
                  <span className="text-tinta-600">Causa Presunta:</span>{' '}
                  <b>{etiquetaCausa(p.causa_presunta)}</b>
                </div>
                <div>
                  <span className="text-tinta-600">Puntaje Severidad:</span>{' '}
                  <b className="font-mono text-base">{textoPuntaje(p.severidad_puntaje)}</b>
                </div>
                <div>
                  <span className="text-tinta-600">Severidad Calculada:</span>{' '}
                  <span className="font-bold uppercase">
                    {etiquetaSeveridad(p.severidad_calculada)}
                  </span>
                </div>
                <div>
                  <span className="text-tinta-600">Severidad Efectiva:</span>{' '}
                  <span className="font-bold uppercase">{etiquetaSeveridad(p.severidad)}</span>
                </div>
                <div>
                  <span className="text-tinta-600">Sumidero Cercano:</span>{' '}
                  <b>
                    {p.sumidero_cercano ? etiquetaSumideroCercano(p.sumidero_cercano) : 'Sin dato'}
                  </b>
                </div>
                <div>
                  <span className="text-tinta-600">Sumidero Tapado:</span>{' '}
                  <b>
                    {p.sumidero_estado ? etiquetaSumideroEstado(p.sumidero_estado) : 'Sin dato'}
                  </b>
                </div>
                <div>
                  <span className="text-tinta-600">Agua Brota del Sumidero:</span>{' '}
                  <b>{etiquetaSiNo(p.agua_brota_sumidero)}</b>
                </div>
                <div>
                  <span className="text-tinta-600">Punto Crítico Asociado:</span>{' '}
                  <b>{p.punto_critico_id ? idCorto(p.punto_critico_id) : 'Ninguno'}</b>
                </div>
              </div>
            </div>

            {/* Sección 4: Descripción */}
            <div className="ficha-seccion rounded-xl border border-tinta-200 p-4">
              <h3 className="border-b border-tinta-200 pb-2 text-sm font-bold text-tinta-700 uppercase">
                4. Descripción y Testimonio del Vecino
              </h3>
              <p className="mt-2 text-sm italic text-tinta-800">
                "{p.descripcion || 'Sin descripción escrita'}"
              </p>
            </div>

            {/* Sección 5: Registro Fotográfico */}
            {p.fotos.length > 0 && (
              <div className="ficha-seccion rounded-xl border border-tinta-200 p-4">
                <h3 className="border-b border-tinta-200 pb-2 text-sm font-bold text-tinta-700 uppercase">
                  5. Evidencia Fotográfica Adjunta ({p.fotos.length})
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {p.fotos.map((url, i) => (
                    <div
                      key={url}
                      className="rounded-lg border border-tinta-200 overflow-hidden bg-tinta-50"
                    >
                      {/* biome-ignore lint/performance/noImgElement: fotos técnicas servidas por api-core */}
                      <img
                        src={url}
                        alt={`Evidencia ${i + 1}`}
                        className="h-28 w-full object-cover"
                      />
                      <p className="p-1 text-center font-mono text-[10px] text-tinta-600 truncate">
                        Evidencia #{i + 1}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sección 6: Moderación y Cierre */}
            <div className="ficha-seccion rounded-xl border border-tinta-200 p-4">
              <h3 className="border-b border-tinta-200 pb-2 text-sm font-bold text-tinta-700 uppercase">
                6. Trazabilidad y moderación
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
                <div>
                  <span className="text-tinta-600">Validado / Revisado Por:</span>{' '}
                  <b>{p.validado_por || 'Pendiente'}</b>
                </div>
                <div>
                  <span className="text-tinta-600">Fecha de Validación:</span>{' '}
                  <b>{fechaHora(p.validado_en) || 'Pendiente'}</b>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-tinta-600">Observaciones / Motivo de Resolución:</span>{' '}
                  <b>{p.estado_motivo || 'Sin observaciones registradas'}</b>
                </div>
                {p.severidad_motivo && (
                  <div className="sm:col-span-2">
                    <span className="text-tinta-600">Motivo Reclasificación Severidad:</span>{' '}
                    <b>{p.severidad_motivo}</b>
                  </div>
                )}
              </div>
            </div>

            {/* Sección 7: lo que este inventario no es (CLAUDE.md §9.4), igual que en toda exportación */}
            <div className="ficha-seccion rounded-xl border border-tinta-200 p-4">
              <h3 className="border-b border-tinta-200 pb-2 text-sm font-bold text-tinta-700 uppercase">
                7. Limitaciones
              </h3>
              <p className="mt-2 text-sm text-tinta-800" data-testid="ficha-limitaciones">
                {NOTA_METODOLOGICA}
              </p>
            </div>

            {/* Firmas: dos líneas en blanco, sin cargos ni oficinas */}
            <div className="ficha-seccion pt-6">
              <div className="grid grid-cols-2 gap-8 text-center text-xs">
                <div className="border-t border-tinta-400 pt-2">
                  <p className="font-bold text-tinta-800">Firma y aclaración</p>
                </div>
                <div className="border-t border-tinta-400 pt-2">
                  <p className="font-bold text-tinta-800">Firma y aclaración</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
