/**
 * Caché de un único valor con vida corta, protección contra estampida y refresco en segundo plano.
 *
 * Se usa para los agregados por unidad vecinal: la consulta recorre todos los reportes publicables
 * y la piden el panel y el mapa público en cada carga. Sin caché, N pestañas abiertas son N
 * pasadas completas; con `enVuelo` además se evita que N peticiones simultáneas lancen N consultas
 * para calcular exactamente lo mismo.
 *
 * El refresco en segundo plano se añadió en la Fase 4 por una razón medida: con un millón de
 * reportes esa consulta tarda 264 ms (721 ms antes del índice de la migración 0007), y la caché
 * anterior hacía que **una petición de cada treinta segundos la pagara entera**. Es el peor
 * reparto posible: la mayoría de los usuarios ve 2 ms y uno de cada tantos ve un cuarto de
 * segundo, sin motivo aparente y sin que aparezca como problema en la mediana.
 *
 * Con `edadMaximaMs`, una copia recién caducada se sirve igual y el recálculo va por detrás. El
 * dato es un conteo para colorear un mapa (CLAUDE.md §9.5: percepción, no medición), así que unos
 * segundos de más no cambian nada; lo que sí cambia es que nadie espera.
 */
export class CacheCorta<T> {
  private valor: T | null = null;
  private en = 0;
  private enVuelo: Promise<T> | null = null;

  /**
   * @param ttlMs      A partir de aquí el valor se considera viejo y se dispara el recálculo.
   * @param edadMaximaMs Hasta aquí se sigue sirviendo el valor viejo mientras se recalcula. Si es
   *   0, se vuelve al comportamiento anterior: el que llega tras el TTL espera al recálculo. Por
   *   defecto, diez veces el TTL: si el recálculo lleva fallando tanto tiempo, es mejor que el
   *   llamador se entere esperando (y viendo el error) que seguir sirviendo algo muy desfasado.
   */
  constructor(
    private ttlMs: number,
    private edadMaximaMs = ttlMs * 10,
  ) {}

  /** Valor cacheado si sigue fresco; null si hay que recalcular. */
  vigente(): T | null {
    if (this.valor !== null && Date.now() - this.en < this.ttlMs) return this.valor;
    return null;
  }

  /** Valor viejo pero todavía servible mientras se recalcula por detrás; null si no lo hay. */
  revalidable(): T | null {
    if (this.valor === null || this.edadMaximaMs <= 0) return null;
    return Date.now() - this.en < this.edadMaximaMs ? this.valor : null;
  }

  guardar(valor: T): void {
    this.valor = valor;
    this.en = Date.now();
  }

  /** Lanza el recálculo si no hay ya uno en curso, y devuelve la promesa. */
  private recalcular(fn: () => Promise<T>): Promise<T> {
    this.enVuelo ??= fn()
      .then((v) => {
        this.guardar(v);
        return v;
      })
      .finally(() => {
        this.enVuelo = null;
      });
    return this.enVuelo;
  }

  /**
   * Recalcula con `fn`, reutilizando el cálculo si ya hay uno en curso. Si hay una copia vieja
   * pero dentro de `edadMaximaMs`, la devuelve YA y deja el recálculo corriendo por detrás.
   */
  async obtener(fn: () => Promise<T>): Promise<T> {
    const fresco = this.vigente();
    if (fresco !== null) return fresco;

    const viejo = this.revalidable();
    if (viejo !== null) {
      // Por detrás: el error se traga a propósito. Quien llama ya tiene un valor servible, y
      // dejar escapar el rechazo aquí sería una promesa sin capturar que tumba el proceso.
      void this.recalcular(fn).catch(() => {});
      return viejo;
    }
    return this.recalcular(fn);
  }

  /** ¿Se está recalculando ahora mismo? Para exponerlo como métrica. */
  get recalculando(): boolean {
    return this.enVuelo !== null;
  }

  invalidar(): void {
    this.valor = null;
    this.en = 0;
  }
}
