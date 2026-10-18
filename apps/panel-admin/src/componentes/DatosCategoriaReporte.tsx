import { REGISTRO_CATEGORIAS, type RegistroCategorias } from 'contracts';
import { presentarReporte } from '@/lib/presentacion-reporte';
import type { PropiedadesReportePanel } from '@/lib/reportes-panel';
import { Dato } from './Dato';

export function DatosCategoriaReporte({
  reporte,
  registro = REGISTRO_CATEGORIAS,
}: {
  reporte: PropiedadesReportePanel;
  registro?: RegistroCategorias;
}) {
  const vista = presentarReporte(reporte, registro);
  return (
    <>
      <dl className="lista-datos">
        <Dato etiqueta="Categoría">{vista.nombre}</Dato>
        {vista.subtipo && <Dato etiqueta="Subtipo">{vista.subtipo}</Dato>}
        {vista.campos.map((c) => (
          <Dato key={c.etiqueta} etiqueta={c.etiqueta}>
            {c.valor}
          </Dato>
        ))}
      </dl>
      {vista.aviso && <p className="aviso aviso-alerta">{vista.aviso}</p>}
      <p className="ayuda mt-3">{vista.versiones}</p>
    </>
  );
}
