'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type PuntoLatLon,
  type ReporteTecnicoFeature,
  type Rol,
  SEVERIDADES,
  type Severidad,
} from 'contracts';
import { Check, EyeOff, GitMerge, RotateCcw, Wrench, X } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { Aviso, type TipoAviso } from '@/componentes/Aviso';
import { CandidatosFusion } from '@/componentes/CandidatosFusion';
import { cambiarEstado, ErrorApi, fusionarReporte, reclasificarSeveridad } from '@/lib/api';
import { consultaCandidatosFusion } from '@/lib/consultas';
import { etiquetaSeveridad } from '@/lib/formato';
import {
  avisoRecorte,
  candidatosCercanos,
  puedeConfirmarFusion,
  RADIO_FUSION_INICIAL_M,
} from '@/lib/fusion-cercana';
import {
  type AccionModeracion,
  accionesModeracion,
  cuerpoCambioEstado,
  TEXTOS_ACCION,
} from '@/lib/moderacion';

function describirError(e: unknown): string {
  if (e instanceof ErrorApi) {
    if (e.estado === 409) return `No permitido (409): ${e.message}`;
    if (e.estado === 400) return `Datos inválidos (400): ${e.message}`;
    if (e.estado === 403) return 'Tu rol no puede hacer esta acción (403).';
    return `${e.codigo} (${e.estado}): ${e.message}`;
  }
  return e instanceof Error ? e.message : 'Error desconocido.';
}

export function PanelAcciones({
  reporte,
  rol,
  accionInicial = null,
}: {
  reporte: ReporteTecnicoFeature;
  rol: Rol;
  /**
   * Formulario abierto al montar. La pantalla no lo usa (arranca cerrado): sirve a las pruebas, que
   * corren sin DOM y no pueden hacer clic en el botón de la acción.
   */
  accionInicial?: AccionModeracion | null;
}) {
  const p = reporte.properties;
  const cliente = useQueryClient();
  const [accion, setAccion] = useState<AccionModeracion | null>(accionInicial);
  const [motivo, setMotivo] = useState('');
  // Reporte canónico elegido de la lista de cercanos ('' = ninguno) y radio de esa búsqueda.
  const [canonicoId, setCanonicoId] = useState('');
  const [radioFusion, setRadioFusion] = useState<number>(RADIO_FUSION_INICIAL_M);
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: TipoAviso; texto: string } | null>(null);

  const refrescar = async () => {
    await Promise.all([
      cliente.invalidateQueries({ queryKey: ['reporte'] }),
      cliente.invalidateQueries({ queryKey: ['reportes'] }),
      cliente.invalidateQueries({ queryKey: ['indicadores'] }),
    ]);
  };

  const estado = useMutation({
    mutationFn: (entrada: Parameters<typeof cambiarEstado>[1]) => cambiarEstado(p.id, entrada),
    onSuccess: async (r) => {
      setAccion(null);
      setMotivo('');
      setMensaje({ tipo: 'ok', texto: `Estado actualizado a "${r.properties.estado}".` });
      await refrescar();
    },
    onError: (e) => setMensaje({ tipo: 'error', texto: describirError(e) }),
  });

  const fusionar = useMutation({
    mutationFn: (entrada: { canonico_id: string; motivo: string }) =>
      fusionarReporte(p.id, entrada),
    onSuccess: async () => {
      setAccion(null);
      setMotivo('');
      setCanonicoId('');
      setRadioFusion(RADIO_FUSION_INICIAL_M);
      setMensaje({ tipo: 'ok', texto: 'Reporte fusionado como duplicado del canónico.' });
      await refrescar();
    },
    onError: (e) => setMensaje({ tipo: 'error', texto: describirError(e) }),
  });

  const ocupado = estado.isPending || fusionar.isPending;

  const puede = accionesModeracion(p.estado, rol);
  const hayAcciones = Object.values(puede).some(Boolean);

  // Fusionar solo ofrece validados cerca de la coordenada exacta de este reporte, y la búsqueda
  // sale únicamente con el formulario de fusión abierto (`lib/fusion-cercana.ts`).
  const [lon, lat] = reporte.geometry.coordinates;
  const centro = useMemo<PuntoLatLon>(() => ({ lon, lat }), [lon, lat]);
  const busqueda = useQuery(consultaCandidatosFusion(centro, radioFusion, accion === 'fusionar'));
  const cercanos = useMemo(
    () => candidatosCercanos(busqueda.data?.features ?? [], { id: p.id, centro }, radioFusion),
    [busqueda.data, p.id, centro, radioFusion],
  );
  const avisoDeRecorte = busqueda.data
    ? avisoRecorte(busqueda.data.features.length, busqueda.data.total)
    : null;
  // Solo vale lo elegido que sigue en la lista: si otro técnico lo rechazó mientras tanto y la
  // lista se actualizó, no queda nada elegido y «Confirmar fusión» se vuelve a deshabilitar.
  const elegido = cercanos.find((c) => c.id === canonicoId) ?? null;
  const estadoBusqueda = busqueda.data ? 'listo' : busqueda.isError ? 'error' : 'cargando';

  const abrirFormulario = (a: AccionModeracion) => {
    setAccion(a);
    setErrorFormulario(null);
    setMensaje(null);
    if (a === 'fusionar') {
      setCanonicoId('');
      setRadioFusion(RADIO_FUSION_INICIAL_M);
      if (!motivo.trim()) setMotivo('Duplicado del mismo punto');
    }
  };

  const confirmar = (ev: FormEvent) => {
    ev.preventDefault();
    if (!accion) return;
    if (accion === 'fusionar') {
      const texto = motivo.trim();
      if (texto.length < 3) {
        setErrorFormulario('Escribí un motivo de al menos 3 caracteres.');
        return;
      }
      if (!elegido) {
        setErrorFormulario('Elegí de la lista el reporte con el que se fusiona.');
        return;
      }
      setErrorFormulario(null);
      fusionar.mutate({ canonico_id: elegido.id, motivo: texto });
      return;
    }
    // Rechazar, resolver y reabrir se validan con el esquema del contrato, el mismo de api-core.
    const cambio = cuerpoCambioEstado(accion, motivo);
    if (!cambio.ok) {
      setErrorFormulario(cambio.error);
      return;
    }
    setErrorFormulario(null);
    estado.mutate(cambio.cuerpo);
  };

  return (
    <section className="tarjeta flex flex-col gap-4 p-5" aria-labelledby="titulo-acciones">
      <h2 id="titulo-acciones" className="text-xl">
        Moderación
      </h2>

      <Aviso tipo={mensaje?.tipo ?? 'info'} testId="mensaje-accion">
        {mensaje?.texto}
      </Aviso>

      {!hayAcciones && (
        <p className="text-tinta-600">
          No hay acciones disponibles para el estado actual con tu rol.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {puede.validar && (
          <button
            type="button"
            className="btn btn-primario"
            data-testid="boton-validar"
            disabled={ocupado}
            onClick={() => {
              setMensaje(null);
              setAccion(null);
              estado.mutate({ estado: 'validado' });
            }}
          >
            <Check size={18} aria-hidden="true" />
            Validar
          </button>
        )}
        {puede.rechazar && (
          <button
            type="button"
            className="btn btn-secundario"
            data-testid="boton-rechazar"
            disabled={ocupado}
            aria-expanded={accion === 'rechazar'}
            onClick={() => abrirFormulario('rechazar')}
          >
            <X size={18} aria-hidden="true" />
            Rechazar
          </button>
        )}
        {puede.retirar && (
          <button
            type="button"
            className="btn btn-secundario"
            data-testid="boton-retirar"
            disabled={ocupado}
            aria-expanded={accion === 'retirar'}
            onClick={() => abrirFormulario('retirar')}
          >
            <EyeOff size={18} aria-hidden="true" />
            Retirar del mapa
          </button>
        )}
        {puede.resolver && (
          <button
            type="button"
            className="btn btn-primario"
            data-testid="boton-resolver"
            disabled={ocupado}
            aria-expanded={accion === 'resolver'}
            onClick={() => abrirFormulario('resolver')}
          >
            <Wrench size={18} aria-hidden="true" />
            Resolver
          </button>
        )}
        {puede.fusionar && (
          <button
            type="button"
            className="btn btn-secundario"
            data-testid="boton-fusionar"
            disabled={ocupado}
            aria-expanded={accion === 'fusionar'}
            onClick={() => abrirFormulario('fusionar')}
          >
            <GitMerge size={18} aria-hidden="true" />
            Fusionar
          </button>
        )}
        {puede.reabrir && (
          <button
            type="button"
            className="btn btn-tinta"
            data-testid="boton-reabrir"
            disabled={ocupado}
            aria-expanded={accion === 'reabrir'}
            onClick={() => abrirFormulario('reabrir')}
          >
            <RotateCcw size={18} aria-hidden="true" />
            Reabrir
          </button>
        )}
      </div>

      {accion && (
        <form
          onSubmit={confirmar}
          // `confirmar` valida cada campo con mensajes propios (los mismos del contrato); sin
          // noValidate, el globo nativo del navegador se adelantaba con el motivo vacío.
          noValidate
          className="flex flex-col gap-3 rounded-[14px] border border-filete bg-fondo p-4"
          aria-labelledby="titulo-formulario-accion"
        >
          <h3 id="titulo-formulario-accion" className="text-lg">
            {TEXTOS_ACCION[accion].titulo}
          </h3>
          <p className="ayuda">{TEXTOS_ACCION[accion].ayuda}</p>

          {accion === 'fusionar' && (
            <CandidatosFusion
              estado={estadoBusqueda}
              radioM={radioFusion}
              candidatos={cercanos}
              aviso={avisoDeRecorte}
              elegido={elegido?.id ?? ''}
              onElegir={setCanonicoId}
              onAmpliar={(radioM) => {
                setCanonicoId('');
                setRadioFusion(radioM);
              }}
              onReintentar={() => {
                busqueda.refetch();
              }}
            />
          )}

          <div>
            <label htmlFor="motivo" className="mb-1 block font-semibold">
              Motivo
            </label>
            <textarea
              id="motivo"
              name="motivo"
              className="campo min-h-28"
              value={motivo}
              onChange={(ev) => setMotivo(ev.target.value)}
              maxLength={1000}
              required
              aria-invalid={errorFormulario ? 'true' : undefined}
              aria-describedby="ayuda-motivo"
            />
            <p id="ayuda-motivo" className="ayuda mt-1">
              Mínimo 3 caracteres · {motivo.length}/1000
            </p>
          </div>

          <Aviso tipo="error">{errorFormulario}</Aviso>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="btn btn-primario"
              data-testid="confirmar-accion"
              disabled={accion === 'fusionar' ? !puedeConfirmarFusion(elegido, ocupado) : ocupado}
            >
              {ocupado ? 'Guardando…' : TEXTOS_ACCION[accion].confirmar}
            </button>
            <button
              type="button"
              className="btn btn-secundario"
              onClick={() => {
                setAccion(null);
                setErrorFormulario(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <Reclasificacion reporte={reporte} onMensaje={setMensaje} onRefrescar={refrescar} />
    </section>
  );
}

function Reclasificacion({
  reporte,
  onMensaje,
  onRefrescar,
}: {
  reporte: ReporteTecnicoFeature;
  onMensaje: (m: { tipo: TipoAviso; texto: string } | null) => void;
  onRefrescar: () => Promise<void>;
}) {
  const p = reporte.properties;
  const [severidad, setSeveridad] = useState<Severidad | ''>(p.severidad_manual ?? '');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reclasificar = useMutation({
    mutationFn: (entrada: { severidad_manual: Severidad | null; severidad_motivo?: string }) =>
      reclasificarSeveridad(p.id, entrada),
    onSuccess: async (r) => {
      setMotivo('');
      setSeveridad(r.properties.severidad_manual ?? '');
      onMensaje({
        tipo: 'ok',
        texto:
          r.properties.severidad_manual === null
            ? `Se volvió a la severidad calculada (${etiquetaSeveridad(r.properties.severidad)}).`
            : `Severidad reclasificada a ${etiquetaSeveridad(r.properties.severidad)}.`,
      });
      await onRefrescar();
    },
    onError: (e) => onMensaje({ tipo: 'error', texto: describirError(e) }),
  });

  const enviar = (ev: FormEvent) => {
    ev.preventDefault();
    if (!severidad) {
      setError('Elegí la severidad manual.');
      return;
    }
    if (motivo.trim().length < 3) {
      setError('Escribí un motivo de al menos 3 caracteres.');
      return;
    }
    setError(null);
    onMensaje(null);
    reclasificar.mutate({ severidad_manual: severidad, severidad_motivo: motivo.trim() });
  };

  return (
    <form
      onSubmit={enviar}
      className="flex flex-col gap-3 border-t border-filete pt-4"
      aria-labelledby="titulo-reclasificar"
    >
      <h3 id="titulo-reclasificar" className="text-lg">
        Reclasificar severidad
      </h3>
      <p className="ayuda">
        Calculada: {etiquetaSeveridad(p.severidad_calculada)} (puntaje {p.severidad_puntaje}).{' '}
        {p.severidad_manual
          ? `Manual vigente: ${etiquetaSeveridad(p.severidad_manual)}.`
          : 'Sin reclasificación manual.'}
      </p>

      <div>
        <label htmlFor="severidad_manual" className="mb-1 block font-semibold">
          Severidad manual
        </label>
        <select
          id="severidad_manual"
          name="severidad_manual"
          className="campo"
          value={severidad}
          onChange={(ev) => setSeveridad(ev.target.value as Severidad | '')}
        >
          <option value="">Elegí una severidad</option>
          {SEVERIDADES.map((s) => (
            <option key={s} value={s}>
              {etiquetaSeveridad(s)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="severidad_motivo" className="mb-1 block font-semibold">
          Motivo de la reclasificación
        </label>
        <textarea
          id="severidad_motivo"
          name="severidad_motivo"
          className="campo min-h-24"
          value={motivo}
          onChange={(ev) => setMotivo(ev.target.value)}
          maxLength={1000}
          aria-invalid={error ? 'true' : undefined}
        />
      </div>

      <Aviso tipo="error">{error}</Aviso>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="btn btn-primario"
          data-testid="reclasificar"
          disabled={reclasificar.isPending}
        >
          {reclasificar.isPending ? 'Guardando…' : 'Reclasificar'}
        </button>
        {p.severidad_manual !== null && (
          <button
            type="button"
            className="btn btn-secundario"
            data-testid="volver-calculada"
            disabled={reclasificar.isPending}
            onClick={() => {
              setError(null);
              onMensaje(null);
              reclasificar.mutate({ severidad_manual: null });
            }}
          >
            Volver a la calculada
          </button>
        )}
      </div>
    </form>
  );
}
