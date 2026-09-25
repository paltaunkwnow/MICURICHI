/**
 * Santa Cruz es «la ciudad de los anillos»: diez anillos concéntricos y veintisiete radiales que
 * salen del primero. Ese trazado, dibujado como trama, identifica a la ciudad en las pantallas de
 * portada sin depender de una fotografía de archivo. Es decoración: va oculto a los lectores de
 * pantalla.
 */
const RADIOS = [52, 86, 122, 160, 200, 242, 286, 332, 380, 430];
const RADIALES = 27;

export function PlanoAnillos({ opacidad = 0.2 }: { opacidad?: number }) {
  // Redondeado a dos decimales: sin eso, Node y el navegador serializan el mismo número con un
  // dígito de diferencia (…-341.8656115393329 frente a …-341.86561153933286) y React reporta una
  // discrepancia de hidratación por cada una de las 27 radiales.
  const radiales = Array.from({ length: RADIALES }, (_, i) => {
    const a = (i * (360 / RADIALES) * Math.PI) / 180;
    const redondear = (n: number) => Number(n.toFixed(2));
    return {
      x1: redondear(52 * Math.cos(a)),
      y1: redondear(52 * Math.sin(a)),
      x2: redondear(470 * Math.cos(a)),
      y2: redondear(470 * Math.sin(a)),
    };
  });
  return (
    <svg
      viewBox="-470 -470 940 940"
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[150%] -translate-x-1/2 -translate-y-1/2"
      style={{ opacity: opacidad }}
    >
      <g fill="none" stroke="#fff" strokeWidth="2.4">
        {RADIOS.map((r) => (
          <circle key={r} cx="0" cy="0" r={r} />
        ))}
      </g>
      <g stroke="#fff" strokeWidth="1.4" opacity="0.7">
        {radiales.map((l) => (
          <line key={`${l.x1}-${l.y1}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
        ))}
      </g>
      <circle cx="0" cy="0" r="52" fill="#fff" opacity="0.12" />
    </svg>
  );
}
