import { DEFINICION_AREA_VERDE } from 'contracts';
import {
  AVISO_PERSONA,
  AvisoAreaVerde,
  destinoPrevistoAreaVerde,
  SIN_DERIVACION_AUTOMATICA,
} from '../categorias/area-verde';
import { crearAdaptadorGenerico } from './generico';
import type { AdaptadorFormularioCategoria, PropsCuerpoPaso2 } from './tipos';

const generico = crearAdaptadorGenerico(DEFINICION_AREA_VERDE);

function CuerpoPaso2AreaVerde(props: PropsCuerpoPaso2) {
  return (
    <>
      <generico.CuerpoPaso2 {...props} />
      <AvisoAreaVerde subtipo={props.valores.subtipo} />
    </>
  );
}

export const ADAPTADOR_AREA_VERDE: AdaptadorFormularioCategoria = {
  ...generico,
  CuerpoPaso2: CuerpoPaso2AreaVerde,
  ExtraPaso3: ({ valores }) => <AvisoAreaVerde subtipo={valores.subtipo} />,
  filasRevision: (valores) => {
    const destino = destinoPrevistoAreaVerde(valores.subtipo);
    return [
      ...generico.filasRevision(valores),
      ...(valores.subtipo === 'persona_situacion_calle'
        ? [{ etiqueta: 'Aviso', valor: AVISO_PERSONA, paso: 2 }]
        : []),
      ...(destino
        ? [
            {
              etiqueta: 'Destino previsto',
              valor: `${destino}. ${SIN_DERIVACION_AUTOMATICA}`,
              paso: 2,
            },
          ]
        : []),
    ];
  },
};
