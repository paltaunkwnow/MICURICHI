import { DEFINICION_AREA_VERDE } from 'contracts';
import { PRESENTADOR_GENERICO } from './generico';
import type { PresentadorCategoria, PropsPresentador } from './tipos';

export const AVISO_PERSONA =
  'Esto no es una denuncia. Se deriva a Desarrollo Social para ofrecer ayuda, no a seguridad. No subas fotos donde se vea la cara de la persona.';
export const SIN_DERIVACION_AUTOMATICA = 'No hay derivación municipal automática.';

export function destinoPrevistoAreaVerde(subtipo: string | null | undefined): string | null {
  if (!DEFINICION_AREA_VERDE.subtipos?.some((opcion) => opcion.valor === subtipo)) return null;
  return subtipo === 'persona_situacion_calle' ? 'Desarrollo Social' : 'Parques y jardines';
}

/** El aviso depende de la selección actual, también al volver al paso de fotos. */
export function AvisoAreaVerde({ subtipo }: { subtipo: string | null | undefined }) {
  const destino = destinoPrevistoAreaVerde(subtipo);
  if (!destino) return null;
  return (
    <div className="av av-tinta mt-3.5" role="status">
      <div>
        {subtipo === 'persona_situacion_calle' ? <p>{AVISO_PERSONA}</p> : null}
        <p>
          Destino previsto: {destino}. {SIN_DERIVACION_AUTOMATICA}
        </p>
      </div>
    </div>
  );
}

function CamposDetalleAreaVerde(props: PropsPresentador) {
  const subtipo = props.reporte.properties.subtipo;
  const destino = destinoPrevistoAreaVerde(subtipo);
  return (
    <>
      <PRESENTADOR_GENERICO.CamposDetalle {...props} />
      {subtipo === 'persona_situacion_calle' ? (
        <div>
          <dt>Aviso</dt>
          <dd>{AVISO_PERSONA}</dd>
        </div>
      ) : null}
      {destino ? (
        <div>
          <dt>Destino previsto</dt>
          <dd>
            {destino}. {SIN_DERIVACION_AUTOMATICA}
          </dd>
        </div>
      ) : null}
    </>
  );
}

export const PRESENTADOR_AREA_VERDE: PresentadorCategoria = {
  ...PRESENTADOR_GENERICO,
  CamposDetalle: CamposDetalleAreaVerde,
};
