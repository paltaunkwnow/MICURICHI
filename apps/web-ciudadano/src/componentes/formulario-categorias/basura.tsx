import { DEFINICION_BASURA } from 'contracts';
import { crearAdaptadorGenerico } from './generico';
import type { AdaptadorFormularioCategoria, PropsCuerpoPaso2 } from './tipos';

const generico = crearAdaptadorGenerico(DEFINICION_BASURA);
const AVISO_QUEMA = 'Reportar quema de basura no sustituye la atención de emergencias.';

function CuerpoPaso2Basura(props: PropsCuerpoPaso2) {
  return (
    <>
      <generico.CuerpoPaso2 {...props} />
      {props.valores.subtipo === 'quema_basura' ? (
        <div className="av av-tinta mt-3.5" role="status">
          <p>{AVISO_QUEMA}</p>
        </div>
      ) : null}
    </>
  );
}

export const ADAPTADOR_BASURA: AdaptadorFormularioCategoria = {
  ...generico,
  CuerpoPaso2: CuerpoPaso2Basura,
  filasRevision: (valores) => [
    ...generico.filasRevision(valores),
    ...(valores.subtipo === 'quema_basura'
      ? [{ etiqueta: 'Aviso', valor: AVISO_QUEMA, paso: 2 }]
      : []),
  ],
};
