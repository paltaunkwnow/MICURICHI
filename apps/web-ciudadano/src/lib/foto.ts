import { CONFIG_DOMINIO } from 'contracts';

const MB = 1024 * 1024;

/**
 * Comprobación de la foto en el propio teléfono, antes de gastar la subida. Devuelve el motivo en
 * castellano o `null` si se puede intentar.
 *
 * No sustituye al servidor: el tipo real se decide ahí, mirando los primeros bytes del archivo y
 * no lo que declare el navegador (CLAUDE.md §13). Lo que evita es el viaje inútil — mandar hasta
 * 8 MB por datos móviles para que te digan que no— y quien peor conexión tiene es justo quien más
 * lo paga.
 */
export function motivoDeRechazoDeFoto(archivo: File): string | null {
  if (archivo.size === 0) return 'Ese archivo está vacío. Probá con otra foto.';
  if (archivo.size > CONFIG_DOMINIO.FOTO_MAX_BYTES) {
    const mb = (archivo.size / MB).toFixed(1).replace('.', ',');
    return `Esa foto pesa ${mb} MB y el máximo es ${CONFIG_DOMINIO.FOTO_MAX_BYTES / MB} MB. Probá con una más chica o sacala con menos resolución.`;
  }
  // `type` puede venir vacío (algunos gestores de archivos de Android no lo rellenan): en ese
  // caso se deja pasar y decide el servidor, que mira los bytes.
  if (
    archivo.type &&
    !(CONFIG_DOMINIO.FOTO_MIME_PERMITIDOS as readonly string[]).includes(archivo.type)
  ) {
    return 'Ese archivo no es una foto JPEG, PNG o WebP. Elegí una imagen.';
  }
  return null;
}
