import { CONFIG_DOMINIO, type Dispositivo, dentroDelRadio, distanciaMetros } from 'contracts';

/**
 * La posición del teléfono para reportar (plan 2026-09-26, pedidos E y F), sin React: cuándo se
 * pide, cuándo alcanza la precisión, qué se hace si se niega el permiso y cómo se relee al
 * enviar. La pantalla (`componentes/PedirUbicacion.tsx` y el formulario) solo la muestra.
 *
 * Es el ÚNICO archivo de la app que toca `navigator.geolocation` y `navigator.permissions`, y
 * crear el controlador no toca ninguno de los dos: se pide al tocar «Compartir mi ubicación»
 * (`compartir()`), nunca al cargar. Una prueba lo comprueba sobre todo el código fuente.
 *
 * La posición no se guarda en ningún lado: ni en el borrador ni en el servidor, que solo la usa
 * para comprobar el radio de 60 m (CLAUDE.md §13).
 */

export const PRECISION_MAX_M = CONFIG_DOMINIO.PRECISION_DISPOSITIVO_MAX_M;
export const ANTIGUEDAD_MAX_S = CONFIG_DOMINIO.POSICION_ANTIGUEDAD_MAX_S;
/** Cuánto se espera a que el teléfono llegue a la precisión antes de sugerir salir afuera. */
export const ESPERA_PRECISION_MS = 30_000;
/** Plazo de la relectura al enviar: si no llega, se usa la última posición vigente. */
export const TIEMPO_RELECTURA_MS = 10_000;

const PERMISO_DENEGADO = 1;

/** Una posición del teléfono. `tomadaEn` es la hora de la lectura, en ms desde época. */
export interface LecturaDispositivo {
  lat: number;
  lon: number;
  precisionM: number;
  tomadaEn: number;
}

export type ProblemaUbicacion = 'inseguro' | 'sin-soporte';

export type EstadoUbicacionDispositivo =
  | { fase: 'inactiva' }
  | { fase: 'buscando'; ultima: LecturaDispositivo | null }
  /**
   * `vez` cambia con cada «Compartir mi ubicación» que llega a la precisión, y no con la
   * relectura al enviar: es lo que distingue «llegó la ubicación, poné el punto» de «se actualizó».
   */
  | { fase: 'lista'; ancla: LecturaDispositivo; vez: number }
  | { fase: 'imprecisa'; ultima: LecturaDispositivo | null }
  | { fase: 'denegada' }
  | { fase: 'error'; problema: ProblemaUbicacion };

/** Lo que se lee del navegador. Aparte, para poder simularlo en las pruebas. */
export interface EntornoUbicacion {
  /** `window.isSecureContext`: sin https (o localhost) el navegador no da la ubicación. */
  seguro: boolean;
  geolocalizacion:
    | Pick<Geolocation, 'watchPosition' | 'clearWatch' | 'getCurrentPosition'>
    | undefined;
  permisos: Pick<Permissions, 'query'> | undefined;
}

export function entornoDelNavegador(): EntornoUbicacion {
  return {
    seguro: window.isSecureContext,
    geolocalizacion: navigator.geolocation,
    permisos: navigator.permissions,
  };
}

/**
 * La lectura como la usa la app, o `null` si no sirve. Sin hora de lectura se toma la de llegada;
 * sin precisión no se puede saber si alcanza, así que no sirve.
 */
export function lecturaDe(pos: GeolocationPosition, ahora: number): LecturaDispositivo | null {
  const { latitude, longitude, accuracy } = pos.coords;
  if (![latitude, longitude, accuracy].every(Number.isFinite) || accuracy < 0) return null;
  return {
    lat: latitude,
    lon: longitude,
    precisionM: accuracy,
    tomadaEn: Number.isFinite(pos.timestamp) ? pos.timestamp : ahora,
  };
}

/**
 * Segundos desde la lectura, nunca negativos: si el reloj del teléfono da la lectura en el futuro,
 * 0 (el contrato no admite negativos, y el servidor no puede saber qué reloj tenía razón).
 */
export function antiguedadSegundos(tomadaEn: number, ahora: number): number {
  const s = Math.round((ahora - tomadaEn) / 1000);
  return Number.isFinite(s) && s > 0 ? s : 0;
}

export function esVigente(lectura: LecturaDispositivo, ahora: number): boolean {
  return antiguedadSegundos(lectura.tomadaEn, ahora) <= ANTIGUEDAD_MAX_S;
}

/** El `dispositivo` de `POST /api/v1/reportes`. */
export function dispositivoDe(lectura: LecturaDispositivo, ahora: number): Dispositivo {
  return {
    lat: lectura.lat,
    lon: lectura.lon,
    precision_m: lectura.precisionM,
    antiguedad_s: antiguedadSegundos(lectura.tomadaEn, ahora),
  };
}

export type DecisionEnvio =
  | { tipo: 'enviar'; lectura: LecturaDispositivo }
  /** La posición nueva deja el punto fuera del radio: se vuelve al paso 1 a ajustarlo. */
  | { tipo: 'movido'; lectura: LecturaDispositivo; movidoM: number }
  /** No hay ninguna posición que el servidor vaya a aceptar: hay que volver a compartirla. */
  | { tipo: 'vencida' };

/**
 * Qué hacer al tocar «Enviar reporte», con la posición releída (o `null` si no se pudo) y la que
 * había. Si la relectura falla, se usa la anterior mientras siga vigente.
 */
export function decidirEnvio({
  punto,
  relectura,
  anterior,
  ahora,
}: {
  punto: { lat: number; lon: number };
  relectura: LecturaDispositivo | null;
  anterior: LecturaDispositivo | null;
  ahora: number;
}): DecisionEnvio {
  const nueva = relectura && relectura.precisionM <= PRECISION_MAX_M ? relectura : null;
  const lectura = nueva ?? (anterior && esVigente(anterior, ahora) ? anterior : null);
  if (!lectura) return { tipo: 'vencida' };
  if (dentroDelRadio(punto, lectura)) return { tipo: 'enviar', lectura };
  return {
    tipo: 'movido',
    lectura,
    movidoM: Math.round(distanciaMetros(anterior ?? lectura, lectura)),
  };
}

/**
 * El `dispositivo` del primer intento de envío, que se repite tal cual en los reintentos: si la
 * red se cortó a mitad, el reintento es la misma petición (misma clave de idempotencia, mismo
 * cuerpo), no una nueva lectura con otra antigüedad.
 */
export class DispositivoCongelado {
  private valor: Dispositivo | null = null;

  actual(): Dispositivo | null {
    return this.valor;
  }

  tomar(lectura: LecturaDispositivo, ahora: number): Dispositivo {
    this.valor ??= dispositivoDe(lectura, ahora);
    return this.valor;
  }

  soltar(): void {
    this.valor = null;
  }
}

export interface DependenciasUbicacion {
  entorno: () => EntornoUbicacion;
  ahora: () => number;
}

/**
 * La ubicación del paso 1 y sus transiciones. Cada camino que deja de necesitarla (llegar a la
 * precisión, el plazo, el permiso negado, salir del formulario) apaga la vigilancia: un GPS que
 * queda encendido gasta la batería de quien reporta.
 */
export class ControladorUbicacion {
  private estado: EstadoUbicacionDispositivo = { fase: 'inactiva' };
  private readonly oyentes = new Set<() => void>();
  private readonly deps: DependenciasUbicacion;
  /** Cada `compartir()` y cada `detener()` cambia el turno: lo que llega tarde ya no vale. */
  private turno = 0;
  private veces = 0;
  private vigilancia: { geo: EntornoUbicacion['geolocalizacion']; id: number } | null = null;
  private plazo: ReturnType<typeof setTimeout> | null = null;
  private permiso: { estado: PermissionStatus; alCambiar: () => void } | null = null;

  constructor(deps: Partial<DependenciasUbicacion> = {}) {
    this.deps = { entorno: entornoDelNavegador, ahora: () => Date.now(), ...deps };
  }

  /** Para `useSyncExternalStore`: devuelve siempre el mismo objeto mientras no cambie. */
  leer = (): EstadoUbicacionDispositivo => this.estado;

  suscribir = (oyente: () => void): (() => void) => {
    this.oyentes.add(oyente);
    return () => {
      this.oyentes.delete(oyente);
    };
  };

  private poner(estado: EstadoUbicacionDispositivo) {
    this.estado = estado;
    for (const o of this.oyentes) o();
  }

  /** «Compartir mi ubicación», «Reintentar» y el permiso recién habilitado. */
  compartir(): void {
    this.apagar();
    const turno = ++this.turno;
    const entorno = this.deps.entorno();
    if (!entorno.seguro) {
      this.poner({ fase: 'error', problema: 'inseguro' });
      return;
    }
    const geo = entorno.geolocalizacion;
    if (typeof geo?.watchPosition !== 'function') {
      this.poner({ fase: 'error', problema: 'sin-soporte' });
      return;
    }
    this.poner({ fase: 'buscando', ultima: null });
    this.plazo = setTimeout(() => {
      if (turno !== this.turno || this.estado.fase !== 'buscando') return;
      const { ultima } = this.estado;
      this.turno += 1;
      this.apagar();
      this.poner({ fase: 'imprecisa', ultima });
    }, ESPERA_PRECISION_MS);
    const id = geo.watchPosition(
      (pos) => {
        // Después de `clearWatch` el navegador no debería llamar más; si llama, no cuenta.
        if (turno !== this.turno || this.estado.fase !== 'buscando') return;
        const lectura = lecturaDe(pos, this.deps.ahora());
        if (!lectura) return;
        if (lectura.precisionM <= PRECISION_MAX_M) {
          this.apagar();
          this.veces += 1;
          this.poner({ fase: 'lista', ancla: lectura, vez: this.veces });
        } else this.poner({ fase: 'buscando', ultima: lectura });
      },
      (error) => {
        if (turno !== this.turno || this.estado.fase !== 'buscando') return;
        if (error.code !== PERMISO_DENEGADO) return; // Sin señal o sin respuesta: decide el plazo.
        this.apagar();
        this.poner({ fase: 'denegada' });
        this.vigilarPermiso(entorno, turno);
      },
      { enableHighAccuracy: true, maximumAge: 0 },
    );
    this.vigilancia = { geo, id };
  }

  /**
   * Con el permiso negado, se escucha su cambio: si la persona lo habilita en los ajustes del
   * sitio, la búsqueda sigue sola; si vuelve a «preguntar», se ofrece otra vez el botón.
   */
  private vigilarPermiso(entorno: EntornoUbicacion, turno: number) {
    entorno.permisos
      ?.query({ name: 'geolocation' })
      .then((estado) => {
        if (turno !== this.turno) return;
        const alCambiar = () => {
          if (this.estado.fase !== 'denegada') return;
          if (estado.state === 'granted') this.compartir();
          else if (estado.state === 'prompt') {
            this.apagar();
            this.poner({ fase: 'inactiva' });
          }
        };
        estado.addEventListener('change', alCambiar);
        this.permiso = { estado, alCambiar };
      })
      .catch(() => {
        // Sin la API de permisos queda el botón «Probar de nuevo».
      });
  }

  /**
   * La posición al tocar «Enviar reporte», sin caché. Con una lectura precisa, el ancla pasa a ser
   * esa; si no llega a tiempo, falla o es imprecisa, devuelve `null` y el ancla queda como estaba.
   */
  releer(): Promise<LecturaDispositivo | null> {
    const geo = this.deps.entorno().geolocalizacion;
    if (typeof geo?.getCurrentPosition !== 'function') return Promise.resolve(null);
    const turno = this.turno;
    return new Promise((resolver) => {
      let hecho = false;
      const terminar = (lectura: LecturaDispositivo | null) => {
        if (hecho) return;
        hecho = true;
        clearTimeout(reserva);
        resolver(lectura);
      };
      // Algunos navegadores internos no respetan `timeout` y no llaman nunca: el envío no puede
      // quedarse esperando.
      const reserva = setTimeout(() => terminar(null), TIEMPO_RELECTURA_MS + 2_000);
      geo.getCurrentPosition(
        (pos) => {
          const lectura = lecturaDe(pos, this.deps.ahora());
          if (!lectura || lectura.precisionM > PRECISION_MAX_M) return terminar(null);
          if (!hecho && turno === this.turno && this.estado.fase === 'lista')
            this.poner({ ...this.estado, ancla: lectura });
          terminar(lectura);
        },
        () => terminar(null),
        { enableHighAccuracy: true, maximumAge: 0, timeout: TIEMPO_RELECTURA_MS },
      );
    });
  }

  /** Vuelve a la pantalla de «Compartir mi ubicación» (un 422 del servidor, una posición vencida). */
  reiniciar(): void {
    this.turno += 1;
    this.apagar();
    this.poner({ fase: 'inactiva' });
  }

  /** Apaga todo. Se puede llamar siempre, las veces que sea (al desmontar, al salir de la página). */
  detener(): void {
    this.turno += 1;
    this.apagar();
    if (this.estado.fase === 'buscando') this.poner({ fase: 'inactiva' });
  }

  private apagar() {
    if (this.vigilancia) {
      this.vigilancia.geo?.clearWatch(this.vigilancia.id);
      this.vigilancia = null;
    }
    if (this.plazo) {
      clearTimeout(this.plazo);
      this.plazo = null;
    }
    if (this.permiso) {
      this.permiso.estado.removeEventListener('change', this.permiso.alCambiar);
      this.permiso = null;
    }
  }
}

export type ResultadoSinPedir =
  | { tipo: 'lista'; lectura: LecturaDispositivo }
  | { tipo: 'sin-permiso' }
  | { tipo: 'error' };

/**
 * «Ir a mi ubicación» del mapa: lee la posición SOLO si el permiso ya se dio (dentro de un
 * reporte). Con el permiso en «preguntar» o negado, o si no se puede saber, no llama a la
 * geolocalización: eso dispararía el aviso del navegador, que se reserva para el reporte.
 */
export async function ubicacionSiHayPermiso(
  entorno: EntornoUbicacion = entornoDelNavegador(),
): Promise<ResultadoSinPedir> {
  let concedido = false;
  try {
    concedido = (await entorno.permisos?.query({ name: 'geolocation' }))?.state === 'granted';
  } catch {
    concedido = false;
  }
  const geo = entorno.geolocalizacion;
  if (!concedido || typeof geo?.getCurrentPosition !== 'function') return { tipo: 'sin-permiso' };
  return new Promise((resolver) => {
    geo.getCurrentPosition(
      (pos) => {
        const lectura = lecturaDe(pos, Date.now());
        resolver(lectura ? { tipo: 'lista', lectura } : { tipo: 'error' });
      },
      () => resolver({ tipo: 'error' }),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000 },
    );
  });
}
