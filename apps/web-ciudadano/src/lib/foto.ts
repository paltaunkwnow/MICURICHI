import { CONFIG_DOMINIO } from 'contracts';

const MB = 1024 * 1024;

/**
 * Comprobación de la foto recién sacada, en el propio teléfono y antes de gastar la subida.
 * Devuelve el motivo en castellano o `null` si se puede intentar.
 *
 * La foto sale de la cámara de la página (`lib/camara.ts`), que ya la entrega en JPEG y achicada,
 * así que esto casi nunca salta; queda como red por si algún navegador entrega otra cosa. No
 * sustituye al servidor, que decide el tipo mirando los primeros bytes (CLAUDE.md §13).
 */
export function motivoDeRechazoDeFoto(archivo: File): string | null {
  if (archivo.size === 0) return 'La foto salió vacía. Probá sacarla de nuevo.';
  if (archivo.size > CONFIG_DOMINIO.FOTO_MAX_BYTES) {
    const mb = (archivo.size / MB).toFixed(1).replace('.', ',');
    return `Esa foto pesa ${mb} MB y el máximo es ${CONFIG_DOMINIO.FOTO_MAX_BYTES / MB} MB. Probá sacarla de nuevo.`;
  }
  if (
    archivo.type &&
    !(CONFIG_DOMINIO.FOTO_MIME_PERMITIDOS as readonly string[]).includes(archivo.type)
  ) {
    return 'La cámara entregó la foto en un formato que no admitimos. Probá sacarla de nuevo.';
  }
  return null;
}

/**
 * Miniaturas locales (`blob:`) de las fotos sacadas en esta visita. Cada una ocupa memoria del
 * teléfono hasta que se revoca, y una revocada ya no se puede mostrar: el `<img>` queda roto. Por
 * eso se lleva la cuenta de las vivas y se pregunta antes de usar una.
 *
 * «Empezar de nuevo» las suelta todas, también la de una foto que todavía se está subiendo. Cuando
 * esa subida termina, su miniatura ya no está viva: la foto era del formulario anterior.
 */
export class MiniaturasLocales {
  private readonly vivas = new Set<string>();

  constructor(
    private readonly revocar: (url: string) => void = (url) => URL.revokeObjectURL(url),
  ) {}

  guardar(url: string): void {
    this.vivas.add(url);
  }

  sigueViva(url: string): boolean {
    return this.vivas.has(url);
  }

  soltar(url: string): void {
    if (this.vivas.delete(url)) this.revocar(url);
  }

  soltarTodas(): void {
    for (const url of this.vivas) this.revocar(url);
    this.vivas.clear();
  }
}
