'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import {
  CONFIG_DOMINIO,
  ETIQUETAS,
  type ReporteCrearEntrada,
  ReporteCrearSchema,
  type ResolverRespuesta,
} from 'contracts';
import { Crosshair, MapPin, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { crearReporte, resolverPunto, subirFoto } from '@/lib/api';
import { detallesDeError, mensajeDeError } from '@/lib/errores';
import { contadorDescripcion, urlFotoRelativa } from '@/lib/formato';
import { CENTRO_INICIAL, leerCoordenadas } from '@/lib/geo';
import { MapaDiferido } from './MapaDiferido';

interface Ubicacion {
  lat: number;
  lon: number;
  metodo: 'gps' | 'manual';
  precisionM: number | null;
}

interface FotoLista {
  objeto_key: string;
  url: string;
}

const TIRANTES = ['tobillo', 'rodilla', 'muslo', 'mas_70'] as const;
const DURACIONES = ['menos_30min', '30min_2h', '2h_12h', 'mas_12h'] as const;
const FRECUENCIAS = ['primera_vez', 'ocasional', 'cada_lluvia_fuerte', 'permanente'] as const;
const AFECTACIONES = ['peatonal', 'vehicular', 'ingreso_viviendas', 'corte_total_via'] as const;
const CAUSAS = [
  'desconocida',
  'sumidero_tapado',
  'falta_sumidero',
  'hundimiento_pavimento',
  'contrapendiente',
  'colector_saturado',
  'desborde_cauce',
] as const;
const UBICACION_TIPOS = ['via_publica', 'vivienda_o_predio', 'otro'] as const;

function GrupoRadio<T extends string>({
  nombre,
  leyenda,
  opciones,
  etiqueta,
  detalle,
  valor,
  onCambio,
}: {
  nombre: string;
  leyenda: string;
  opciones: readonly T[];
  etiqueta: (v: T) => string;
  detalle?: (v: T) => string | undefined;
  valor: T | undefined;
  onCambio: (v: T) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="titular mb-2 text-xl">{leyenda}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {opciones.map((o) => (
          // biome-ignore lint/a11y/noLabelWithoutControl: el input está dentro del label
          <label key={o} className="opcion-radio">
            <input
              type="radio"
              name={nombre}
              value={o}
              checked={valor === o}
              onChange={() => onCambio(o)}
            />
            <span className="flex-1">{etiqueta(o)}</span>
            {detalle?.(o) ? (
              <span className="text-[13.5px] text-tinta-600">{detalle(o)}</span>
            ) : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function FormularioReporte() {
  const [paso, setPaso] = useState<1 | 2>(1);
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [resuelto, setResuelto] = useState<ResolverRespuesta | null>(null);
  const [errorUbicacion, setErrorUbicacion] = useState<string | null>(null);
  const [mostrarCoordenadas, setMostrarCoordenadas] = useState(false);
  const [latTexto, setLatTexto] = useState('');
  const [lonTexto, setLonTexto] = useState('');
  const [fotos, setFotos] = useState<FotoLista[]>([]);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const [creado, setCreado] = useState<{ id: string } | null>(null);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  const form = useForm<ReporteCrearEntrada>({
    resolver: zodResolver(ReporteCrearSchema),
    mode: 'onSubmit',
    defaultValues: {
      ubicacion_tipo: 'via_publica',
      causa_presunta: 'desconocida',
      descripcion: '',
      fotos: [],
      sitio_web: '',
    },
  });
  const valores = form.watch();

  async function fijarUbicacion(
    lat: number,
    lon: number,
    metodo: 'gps' | 'manual',
    precisionM: number | null,
  ) {
    setUbicacion({ lat, lon, metodo, precisionM });
    setErrorUbicacion(null);
    setResuelto(null);
    try {
      const r = await resolverPunto(lat, lon);
      setResuelto(r);
      if (!r.dentro_cobertura) {
        setErrorUbicacion(
          'Ese punto queda fuera del municipio. Movelo dentro de la ciudad para poder reportar.',
        );
      }
    } catch (e) {
      setErrorUbicacion(mensajeDeError(e));
    }
  }

  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      setErrorUbicacion(
        'Tu navegador no permite compartir la ubicación. Podés elegir el punto en el mapa.',
      );
      return;
    }
    setErrorUbicacion('Buscando tu ubicación…');
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        fijarUbicacion(
          pos.coords.latitude,
          pos.coords.longitude,
          'gps',
          pos.coords.accuracy ?? null,
        ),
      () =>
        setErrorUbicacion(
          'No pudimos obtener tu ubicación. Elegí el punto en el mapa o escribí las coordenadas.',
        ),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  const subir = useMutation({
    mutationFn: subirFoto,
    onSuccess: (f) => {
      setFotos((prev) => [...prev, { objeto_key: f.objeto_key, url: f.url }]);
      setErrorFoto(null);
    },
    onError: (e) => setErrorFoto(mensajeDeError(e)),
  });

  const enviar = useMutation({
    mutationFn: crearReporte,
    onSuccess: (f) => setCreado({ id: f.properties.id }),
    onError: (e) => {
      setErrorEnvio(mensajeDeError(e));
      for (const d of detallesDeError(e)) {
        form.setError(d.campo as keyof ReporteCrearEntrada, { message: d.mensaje });
      }
    },
  });

  if (creado) {
    return (
      <section
        data-testid="reporte-creado"
        className="tarjeta mx-auto max-w-2xl space-y-4 p-6"
        aria-live="polite"
      >
        <h1 className="titular text-3xl">¡Gracias! Tu reporte quedó en revisión</h1>
        <p className="text-[18px] leading-7">
          Un técnico municipal lo va a revisar antes de que aparezca en el mapa público. Así
          evitamos duplicados y datos que no correspondan.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/reporte/${creado.id}`}
            data-id={creado.id}
            className="btn-secundario btn no-underline"
          >
            Ver mi reporte
          </Link>
          <Link href="/" className="btn-primario btn no-underline">
            Volver al mapa
          </Link>
        </div>
      </section>
    );
  }

  const puedeContinuar = !!ubicacion && !!resuelto?.dentro_cobertura;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
      <h1 className="titular text-4xl">Reportar un punto</h1>
      <ol className="flex gap-2 text-[13.5px] text-tinta-600">
        <li className={paso === 1 ? 'font-semibold text-tinta-900' : ''}>1. Dónde</li>
        <li aria-hidden="true">·</li>
        <li className={paso === 2 ? 'font-semibold text-tinta-900' : ''}>2. Qué ves</li>
      </ol>

      {paso === 1 ? (
        <section className="space-y-4">
          <h2 className="titular text-2xl">¿Dónde se junta el agua?</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primario btn" onClick={usarMiUbicacion}>
              <Crosshair aria-hidden="true" size={20} /> Usar mi ubicación
            </button>
            <button
              type="button"
              data-testid="opcion-coordenadas"
              className="btn-secundario btn"
              onClick={() => setMostrarCoordenadas((v) => !v)}
            >
              Ingresar coordenadas
            </button>
          </div>

          {mostrarCoordenadas ? (
            <div className="tarjeta space-y-3 p-4">
              <p className="ayuda">
                Alternativa sin mapa: escribí la latitud y la longitud en grados decimales
                (EPSG:4326).
              </p>
              <div className="flex flex-wrap gap-3">
                <div className="flex-1">
                  <label htmlFor="lat" className="block font-semibold">
                    Latitud
                  </label>
                  <input
                    id="lat"
                    inputMode="decimal"
                    className="campo"
                    value={latTexto}
                    onChange={(e) => setLatTexto(e.target.value)}
                    placeholder="-17.78"
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor="lon" className="block font-semibold">
                    Longitud
                  </label>
                  <input
                    id="lon"
                    inputMode="decimal"
                    className="campo"
                    value={lonTexto}
                    onChange={(e) => setLonTexto(e.target.value)}
                    placeholder="-63.18"
                  />
                </div>
              </div>
              <button
                type="button"
                data-testid="boton-confirmar-ubicacion"
                className="btn-tinta btn"
                onClick={() => {
                  const c = leerCoordenadas(latTexto, lonTexto);
                  if (!c) {
                    setErrorUbicacion(
                      'Revisá las coordenadas: la latitud va entre -90 y 90, y la longitud entre -180 y 180.',
                    );
                    return;
                  }
                  fijarUbicacion(c.lat, c.lon, 'manual', null);
                }}
              >
                Confirmar ubicación
              </button>
            </div>
          ) : null}

          <div className="relative h-[45dvh] overflow-hidden rounded-3xl">
            <MapaDiferido
              className="h-full w-full"
              ariaLabel="Mapa para elegir la ubicación del reporte"
              centro={ubicacion ? [ubicacion.lon, ubicacion.lat] : CENTRO_INICIAL}
              zoom={ubicacion ? 16 : 13}
              seleccionUbicacion={ubicacion ? { lat: ubicacion.lat, lon: ubicacion.lon } : null}
              onUbicacion={(lat, lon) => fijarUbicacion(lat, lon, 'manual', null)}
            />
          </div>
          <p className="ayuda">Tocá el mapa o arrastrá el marcador para mover el punto.</p>

          <div aria-live="polite" className="space-y-2">
            {errorUbicacion ? <p className="error">{errorUbicacion}</p> : null}
            {resuelto?.dentro_cobertura ? (
              <p
                data-testid="ubicacion-resuelta"
                className="rounded-2xl bg-verde-100 p-3 font-semibold"
              >
                {resuelto.distrito ? `Distrito ${resuelto.distrito.codigo}` : 'Sin distrito'} ·{' '}
                {resuelto.unidad_vecinal ? `UV ${resuelto.unidad_vecinal.codigo}` : 'Sin UV'} · capa
                vigente {resuelto.version_capa}
                {resuelto.asignado_por_proximidad
                  ? ` (asignada por proximidad, a ${Math.round(resuelto.distancia_m ?? 0)} m)`
                  : ''}
              </p>
            ) : null}
          </div>

          <GrupoRadio
            nombre="ubicacion_tipo"
            leyenda="¿Qué hay en ese punto?"
            opciones={UBICACION_TIPOS}
            etiqueta={(o) => ETIQUETAS.ubicacion_tipo[o]}
            valor={valores.ubicacion_tipo}
            onCambio={(o) => form.setValue('ubicacion_tipo', o)}
          />
          <p className="ayuda">
            Si es una vivienda o un predio, en el mapa público mostramos una ubicación aproximada
            para cuidar la privacidad.
          </p>

          <button
            type="button"
            data-testid="boton-siguiente"
            className="btn-primario btn w-full"
            disabled={!puedeContinuar}
            onClick={() => setPaso(2)}
          >
            Siguiente
          </button>
        </section>
      ) : (
        <form
          className="space-y-6"
          onSubmit={form.handleSubmit((datos) => {
            if (!ubicacion) return;
            setErrorEnvio(null);
            enviar.mutate({
              ...datos,
              lat: ubicacion.lat,
              lon: ubicacion.lon,
              ubicacion_metodo: ubicacion.metodo,
              precision_gps_m: ubicacion.precisionM,
              fotos: fotos.map((f) => f.objeto_key),
            });
          })}
        >
          <div className="flex items-center gap-2">
            <MapPin aria-hidden="true" size={18} />
            <p className="text-[13.5px] text-tinta-600">
              {resuelto?.distrito ? `Distrito ${resuelto.distrito.codigo}` : ''}{' '}
              {resuelto?.unidad_vecinal ? `· UV ${resuelto.unidad_vecinal.codigo}` : ''}
            </p>
            <button type="button" className="btn-secundario btn ml-auto" onClick={() => setPaso(1)}>
              Cambiar ubicación
            </button>
          </div>

          <h2 className="titular text-2xl">Contanos qué ves</h2>

          <GrupoRadio
            nombre="tirante_estimado"
            leyenda="¿Hasta dónde llega el agua?"
            opciones={TIRANTES}
            etiqueta={(o) => ETIQUETAS.tirante[o].corta}
            detalle={(o) => ETIQUETAS.tirante[o].rango}
            valor={valores.tirante_estimado}
            onCambio={(o) => form.setValue('tirante_estimado', o)}
          />
          {form.formState.errors.tirante_estimado ? (
            <p className="error">Elegí hasta dónde llega el agua.</p>
          ) : null}

          <GrupoRadio
            nombre="duracion_estimada"
            leyenda="¿Cuánto tarda en irse?"
            opciones={DURACIONES}
            etiqueta={(o) => ETIQUETAS.duracion[o]}
            valor={valores.duracion_estimada}
            onCambio={(o) => form.setValue('duracion_estimada', o)}
          />
          {form.formState.errors.duracion_estimada ? (
            <p className="error">Elegí cuánto tarda en irse.</p>
          ) : null}

          <GrupoRadio
            nombre="frecuencia"
            leyenda="¿Cada cuánto pasa?"
            opciones={FRECUENCIAS}
            etiqueta={(o) => ETIQUETAS.frecuencia[o]}
            valor={valores.frecuencia}
            onCambio={(o) => form.setValue('frecuencia', o)}
          />
          {form.formState.errors.frecuencia ? (
            <p className="error">Elegí cada cuánto pasa.</p>
          ) : null}

          <GrupoRadio
            nombre="afectacion"
            leyenda="¿A qué afecta?"
            opciones={AFECTACIONES}
            etiqueta={(o) => ETIQUETAS.afectacion[o]}
            valor={valores.afectacion}
            onCambio={(o) => form.setValue('afectacion', o)}
          />
          {form.formState.errors.afectacion ? <p className="error">Elegí a qué afecta.</p> : null}

          <div>
            <label htmlFor="causa_presunta" className="titular block text-xl">
              ¿Por qué creés que pasa?
            </label>
            <select id="causa_presunta" className="campo mt-2" {...form.register('causa_presunta')}>
              {CAUSAS.map((c) => (
                <option key={c} value={c}>
                  {ETIQUETAS.causa_presunta[c]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="descripcion" className="titular block text-xl">
              ¿Qué pasa en ese punto?
            </label>
            <textarea
              id="descripcion"
              rows={4}
              className="campo mt-2"
              placeholder="Contanos qué ves: hasta dónde llega el agua, cuánto tarda en irse…"
              aria-invalid={!!form.formState.errors.descripcion}
              aria-describedby="contador-descripcion"
              {...form.register('descripcion')}
            />
            <p id="contador-descripcion" className="ayuda mt-1">
              {contadorDescripcion(valores.descripcion?.length ?? 0)}
            </p>
            {form.formState.errors.descripcion ? (
              <p className="error" aria-live="polite">
                {form.formState.errors.descripcion.message}
              </p>
            ) : null}
          </div>

          <details className="tarjeta p-4">
            <summary className="cursor-pointer font-semibold">
              Datos opcionales sobre el sumidero
            </summary>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="sumidero_cercano" className="block font-semibold">
                  ¿Hay un sumidero cerca?
                </label>
                <select
                  id="sumidero_cercano"
                  className="campo mt-1"
                  {...form.register('sumidero_cercano')}
                >
                  <option value="">No sé / prefiero no responder</option>
                  {(['si', 'no', 'no_sabe'] as const).map((v) => (
                    <option key={v} value={v}>
                      {ETIQUETAS.sumidero_cercano[v]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="sumidero_estado" className="block font-semibold">
                  ¿Cómo está ese sumidero?
                </label>
                <select
                  id="sumidero_estado"
                  className="campo mt-1"
                  {...form.register('sumidero_estado')}
                >
                  <option value="">No sé / prefiero no responder</option>
                  {(['libre', 'obstruido', 'danado', 'no_sabe'] as const).map((v) => (
                    <option key={v} value={v}>
                      {ETIQUETAS.sumidero_estado[v]}
                    </option>
                  ))}
                </select>
              </div>
              {/* biome-ignore lint/a11y/noLabelWithoutControl: el input está dentro del label */}
              <label className="opcion-radio">
                <input type="checkbox" {...form.register('agua_brota_sumidero')} />
                <span>El agua brota del sumidero cuando llueve</span>
              </label>
            </div>
          </details>

          <div className="space-y-2">
            <label htmlFor="fotos" className="titular block text-xl">
              Fotos (opcional, hasta {CONFIG_DOMINIO.FOTOS_MAX_POR_REPORTE})
            </label>
            <input
              id="fotos"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="campo"
              disabled={fotos.length >= CONFIG_DOMINIO.FOTOS_MAX_POR_REPORTE || subir.isPending}
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo) subir.mutate(archivo);
                e.target.value = '';
              }}
            />
            <p className="ayuda">
              Les quitamos los datos de ubicación a las fotos antes de guardarlas. Máximo{' '}
              {CONFIG_DOMINIO.FOTO_MAX_BYTES / 1024 / 1024} MB cada una.
            </p>
            {subir.isPending ? <p aria-live="polite">Subiendo la foto…</p> : null}
            {errorFoto ? (
              <p className="error" aria-live="polite">
                {errorFoto}
              </p>
            ) : null}
            {fotos.length ? (
              <ul className="flex flex-wrap gap-2">
                {fotos.map((f) => (
                  <li key={f.objeto_key} className="relative">
                    {/* biome-ignore lint/performance/noImgElement: miniatura local de la foto subida */}
                    <img
                      src={urlFotoRelativa(f.url)}
                      alt="Foto que subiste"
                      className="h-24 rounded-2xl object-cover"
                    />
                    <button
                      type="button"
                      className="btn-circular btn absolute -top-2 -right-2 h-9 w-9"
                      aria-label="Quitar esta foto"
                      onClick={() =>
                        setFotos((prev) => prev.filter((x) => x.objeto_key !== f.objeto_key))
                      }
                    >
                      <Trash2 aria-hidden="true" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* Honeypot antispam: invisible para las personas */}
          <input
            {...form.register('sitio_web')}
            type="text"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="sr-only"
          />

          {errorEnvio ? (
            <p className="error" aria-live="assertive">
              {errorEnvio}
            </p>
          ) : null}

          <button
            type="submit"
            data-testid="boton-enviar"
            className="btn-primario btn w-full"
            disabled={enviar.isPending}
          >
            {enviar.isPending ? 'Enviando…' : 'Enviar reporte'}
          </button>
          <p className="ayuda">
            Podés reportar sin dar tu nombre. Tu reporte pasa por revisión municipal antes de
            publicarse.
          </p>
        </form>
      )}
    </div>
  );
}
