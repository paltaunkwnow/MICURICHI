/** Ensayo M10 nuevo. Solo definiciones e inyección; no hay adaptador operacional predeterminado. */

import { createHash } from 'node:crypto';
import { compararSnapshotsContraccion, huellaCanonica } from './respaldo.mjs';

export { huellaCanonica };

const sha = (s) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const rutaRelativa = (s) =>
  typeof s === 'string' &&
  s.length > 0 &&
  !s.includes('\\') &&
  !s.includes(':') &&
  !s.startsWith('/') &&
  s.split('/').every((p) => p && p !== '.' && p !== '..');
const hashBytes = (b) => createHash('sha256').update(b).digest('hex');

/** Contrato para el adaptador privado: leer bytes y resolver imports en SU release aislado. */
export async function acreditarRelease(version, esperado, { leer, resolver } = {}) {
  if (
    ![21, 22].includes(version) ||
    esperado?.version !== version ||
    !sha(esperado.manifiestoSha256) ||
    !sha(esperado.dependenciasSha256) ||
    typeof leer !== 'function' ||
    typeof resolver !== 'function'
  )
    throw new Error('acreditación de release requiere operadores inyectados');
  const bytes = async (ruta) => {
    const contenido = await leer(ruta);
    if (!(contenido instanceof Uint8Array)) throw new Error('bytes de release requeridos');
    return contenido;
  };
  const manifiestoBytes = await bytes('manifiesto.json');
  const grafoBytes = await bytes('dependencias.json');
  if (
    hashBytes(manifiestoBytes) !== esperado.manifiestoSha256 ||
    hashBytes(grafoBytes) !== esperado.dependenciasSha256
  )
    throw new Error('SHA de manifiesto/grafo no coincide');
  const decodificar = (b) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(b));
  const manifiesto = decodificar(manifiestoBytes),
    grafo = decodificar(grafoBytes);
  if (
    manifiesto.version !== 1 ||
    manifiesto.release !== version ||
    grafo.version !== 1 ||
    grafo.release !== version ||
    !Array.isArray(manifiesto.archivos) ||
    !manifiesto.archivos.length ||
    !Array.isArray(grafo.modulos) ||
    !grafo.modulos.length ||
    new Set(manifiesto.archivos.map((f) => f.ruta)).size !== manifiesto.archivos.length
  )
    throw new Error('manifiesto/grafo incompleto');
  for (const f of manifiesto.archivos) {
    if (!rutaRelativa(f.ruta) || !sha(f.sha256) || !Number.isSafeInteger(f.bytes) || f.bytes < 0)
      throw new Error('archivo de release inválido');
    const b = await bytes(f.ruta);
    if (b.byteLength !== f.bytes || hashBytes(b) !== f.sha256)
      throw new Error('archivo de release alterado');
  }
  const resoluciones = [];
  for (const m of [...grafo.modulos, grafo.runtime, grafo.runner]) {
    if (
      !m ||
      !rutaRelativa(m.desde) ||
      !rutaRelativa(m.hacia) ||
      typeof m.specifier !== 'string' ||
      !m.specifier ||
      !manifiesto.archivos.some((f) => f.ruta === m.hacia && f.sha256 === m.sha256)
    )
      throw new Error('dependencia/runtime/runner sin evidencia');
    const r = await resolver(structuredClone(m));
    if (
      r?.ruta !== m.hacia ||
      r.sha256 !== m.sha256 ||
      r.releaseAislado !== version ||
      ((m.clase === 'db' || m === grafo.runner) && r.versionEsquema !== version)
    )
      throw new Error('resolución efectiva fuera de release o versión incompatible');
    resoluciones.push({
      ruta: r.ruta,
      sha256: r.sha256,
      releaseAislado: r.releaseAislado,
      versionEsquema: r.versionEsquema ?? null,
    });
  }
  const db = grafo.modulos.filter((m) => m.clase === 'db');
  if (!db.length || grafo.runner.clase !== 'runner' || grafo.runtime.clase !== 'runtime')
    throw new Error('grafo sin DB/runner/runtime');
  const comprobacion = {
    version,
    manifiestoSha256: esperado.manifiestoSha256,
    dependenciasSha256: esperado.dependenciasSha256,
    archivosVerificados: manifiesto.archivos.length,
    resolucionesSha256: huellaCanonica(resoluciones),
    dbResueltoVersion: version,
    runnerEsquema: version,
  };
  return {
    version,
    dbResueltoVersion: version,
    dependenciasVerificadas: true,
    manifiestoSha256: esperado.manifiestoSha256,
    sha256: esperado.dependenciasSha256,
    comprobacion,
    comprobacionSha256: huellaCanonica(comprobacion),
  };
}
const ETAPAS = Object.freeze({
  preflight: [],
  verificarRelease21: [],
  verificarRelease22: [],
  preparar19: ['preflight', 'verificarRelease21'],
  preparar21: ['preflight', 'verificarRelease21'],
  preparar22: ['preflight', 'verificarRelease22'],
  respaldar19: ['preparar19'],
  respaldar21: ['preparar21'],
  respaldar22: ['preparar22'],
  cargar19: ['respaldar19'],
  cargar21: ['respaldar21'],
  cargar22: ['respaldar22'],
  verificarCarga: ['cargar19', 'cargar21', 'cargar22'],
  migrar22: ['verificarCarga'],
  verificar22: ['migrar22'],
  probarPostReplay22: ['verificar22'],
  pausar22: ['probarPostReplay22'],
  reversa21: ['pausar22', 'verificarRelease21'],
  verificar21: ['reversa21'],
  seleccionarRelease21: ['verificar21'],
  reconciliarEstado21: ['seleccionarRelease21'],
  probarPostReplay21: ['reconciliarEstado21'],
  reaplicar22: ['probarPostReplay21'],
  verificarReaplicacion22: ['reaplicar22'],
});

function validarPlan(plan) {
  if (
    plan?.version !== 1 ||
    !/^[a-z0-9][a-z0-9_]{0,24}$/.test(plan.corrida ?? '') ||
    !Array.isArray(plan.bancos) ||
    plan.bancos.length !== 6 ||
    new Set(plan.bancos).size !== 6
  )
    throw new Error('plan/corrida/bancos inválidos');
  const prefijo = `curichi_sdd_m10c_${plan.corrida}_`;
  const esperados = ['origen19', 'origen21', 'origen22', 'copia19', 'copia21', 'copia22'].map(
    (s) => prefijo + s,
  );
  if (plan.bancos.some((b) => typeof b !== 'string' || b.length > 63 || !esperados.includes(b)))
    throw new Error('nombre de banco reservado no admitido');
  for (const v of [21, 22]) {
    const r = plan[`release${v}`];
    if (r?.version !== v || !sha(r.manifiestoSha256) || !sha(r.dependenciasSha256))
      throw new Error('plan de release sin hashes');
  }
  return structuredClone(plan);
}

export function nuevoDiario(plan) {
  validarPlan(plan);
  return { version: 1, perfil: 'm10-ensayo-v1', planSha256: huellaCanonica(plan), etapas: {} };
}

function validarDiario(diario, plan) {
  if (
    diario?.version !== 1 ||
    diario.perfil !== 'm10-ensayo-v1' ||
    diario.planSha256 !== huellaCanonica(plan) ||
    !diario.etapas ||
    Array.isArray(diario.etapas)
  )
    throw new Error('diario/plan alterado: hash inválido');
  for (const [nombre, etapa] of Object.entries(diario.etapas)) {
    if (!Object.hasOwn(ETAPAS, nombre) || !['verificada', 'incierta'].includes(etapa.estado))
      throw new Error('diario alterado: etapa inválida');
    if (etapa.estado === 'verificada') {
      const { sello, ...contenido } = etapa;
      if (
        !sha(sello) ||
        sello !== huellaCanonica({ plan: diario.planSha256, nombre, ...contenido })
      )
        throw new Error('checkpoint alterado: sello inválido');
    }
  }
}

function releaseValido(r, version, esperado) {
  if (
    r?.version !== version ||
    r.dependenciasVerificadas !== true ||
    r.dbResueltoVersion !== version ||
    r.manifiestoSha256 !== esperado.manifiestoSha256 ||
    !sha(r.sha256) ||
    r.sha256 !== esperado.dependenciasSha256 ||
    r.comprobacion?.version !== version ||
    r.comprobacion.manifiestoSha256 !== esperado.manifiestoSha256 ||
    r.comprobacion.dependenciasSha256 !== esperado.dependenciasSha256 ||
    r.comprobacion.dbResueltoVersion !== version ||
    r.comprobacion.runnerEsquema !== version ||
    !Number.isSafeInteger(r.comprobacion.archivosVerificados) ||
    r.comprobacion.archivosVerificados < 1 ||
    !sha(r.comprobacion.resolucionesSha256) ||
    r.comprobacionSha256 !== huellaCanonica(r.comprobacion)
  )
    throw new Error('NO_VERIFICADO_REAL: release/dependencias/version incompatible');
}

export function crearEnsayo({
  plan: entrada,
  adaptador,
  guardar,
  diario: previo,
  autorizarContraccionCompatible = false,
} = {}) {
  const plan = validarPlan(entrada);
  if (
    typeof guardar !== 'function' ||
    ['ocupada', 'identidad', 'ejecutar', 'verificarRelease'].some(
      (k) => typeof adaptador?.[k] !== 'function',
    )
  )
    throw new Error('adaptador y diario inyectados requeridos');
  const diario = structuredClone(previo ?? nuevoDiario(plan));
  validarDiario(diario, plan);
  let enCurso = false;
  async function precondicionesVigentes(nombre) {
    const requisitos = new Set(ETAPAS[nombre]);
    const requiere21 = [
      'preparar19',
      'preparar21',
      'reversa21',
      'verificar21',
      'seleccionarRelease21',
      'reconciliarEstado21',
      'probarPostReplay21',
    ];
    const requiere22 = [
      'preparar22',
      'migrar22',
      'verificar22',
      'probarPostReplay22',
      'pausar22',
      'reaplicar22',
      'verificarReaplicacion22',
    ];
    if (requiere21.includes(nombre)) requisitos.add('verificarRelease21');
    if (requiere22.includes(nombre)) requisitos.add('verificarRelease22');
    if (requisitos.size && typeof adaptador.verificarCheckpoint !== 'function')
      throw new Error('precondiciones requieren verificador de checkpoint inyectado');
    for (const requisito of requisitos) {
      const etapa = diario.etapas[requisito];
      if (etapa?.estado !== 'verificada') throw new Error('precondición no verificada');
      const ids = await identidades(nombresEtapa(requisito, true));
      if ((await adaptador.verificarCheckpoint(requisito, structuredClone(etapa), ids)) !== true)
        throw new Error(`checkpoint/precondición obsoleto: ${requisito}`);
    }
  }
  function comprobarDatos(nombre, resultado) {
    const evidencias = {};
    if (/^respaldar(19|21|22)$/.test(nombre)) {
      const version = Number(nombre.slice(-2));
      if (
        !sha(resultado.dumpSha256) ||
        resultado.evidencia?.version !== version ||
        !compararSnapshotsContraccion(resultado.evidencia, resultado.evidencia, { exacta: true })
      )
        throw new Error('dump sin evidencia íntegra versionada');
      return { evidencia: resultado.evidencia, dumpSha256: resultado.dumpSha256 };
    }
    if (/^cargar(19|21|22)$/.test(nombre)) {
      const version = nombre.slice(-2);
      const dump = diario.etapas[`respaldar${version}`];
      if (
        resultado.dumpSha256 !== dump.dumpSha256 ||
        !compararSnapshotsContraccion(dump.evidencia, resultado.evidencia, { exacta: true })
      )
        throw new Error('carga exacta/FK distinta del dump antes de upgrade');
      return { evidencia: resultado.evidencia };
    }
    if (nombre === 'probarPostReplay22' || nombre === 'probarPostReplay21') {
      const version = nombre.slice(-2);
      const destino = `curichi_sdd_m10c_${plan.corrida}_copia22`;
      const anteriores = diario.etapas[`verificar${version}`].evidencias;
      const esperados = resultado[`esperado${version}`];
      const nuevos = resultado[`aceptados${version}`];
      if (
        !Array.isArray(nuevos) ||
        nuevos.length < 2 ||
        !['plano', 'categoria'].every((forma) => nuevos.some((n) => n.forma === forma)) ||
        nuevos.some(
          (n) =>
            typeof n.id !== 'string' ||
            !sha(n.huella) ||
            !sha(n.postSha256) ||
            !sha(n.replaySha256),
        ) ||
        new Set(nuevos.map((n) => n.id)).size !== nuevos.length
      )
        throw new Error('faltan IDs/hashes independientes de ambos POST/replay22');
      for (const v of [19, 21, 22]) {
        const b = `curichi_sdd_m10c_${plan.corrida}_copia${v}`;
        if (!compararSnapshotsContraccion(esperados?.[b], esperados?.[b], { exacta: true }))
          throw new Error('oráculo22 completo requerido ANTES de pausa');
        if (
          b !== destino &&
          !compararSnapshotsContraccion(anteriores[b], esperados[b], { exacta: true })
        )
          throw new Error('otra copia debe permanecer quieta sin cambios');
      }
      const antes = anteriores[destino].logico.reportes;
      const despues = esperados[destino].logico.reportes;
      if (
        !Array.isArray(antes) ||
        !Array.isArray(despues) ||
        nuevos.some((n) => antes.some((a) => a.id === n.id))
      )
        throw new Error('oráculo previo por ID requerido; alta22 no puede sobrescribir');
      const union = [
        ...antes,
        ...nuevos.map(({ id, categoria, huella }) => ({ id, categoria, huella })),
      ];
      const ordenar = (rs) => [...rs].sort((a, b) => a.id.localeCompare(b.id));
      if (huellaCanonica(ordenar(union)) !== huellaCanonica(ordenar(despues)))
        throw new Error('delta22 perdió o alteró datos anteriores o no coincide con POSTids');
      return { [`esperado${version}`]: esperados, [`aceptados${version}`]: nuevos };
    }
    if (['verificar22', 'pausar22', 'verificar21', 'verificarReaplicacion22'].includes(nombre)) {
      for (const v of [19, 21, 22]) {
        const banco = `curichi_sdd_m10c_${plan.corrida}_copia${v}`;
        const actual = resultado.evidencias?.[banco];
        const version = nombre === 'verificar21' && v === 22 ? 21 : 22;
        if (
          actual?.version !== version ||
          !compararSnapshotsContraccion(actual, actual, { exacta: true })
        )
          throw new Error('falta evidencia completa de una copia/categoría');
        const antes =
          nombre === 'verificar22'
            ? diario.etapas[`cargar${v}`].evidencia
            : nombre === 'verificar21'
              ? diario.etapas.pausar22.evidencias[banco]
              : nombre === 'verificarReaplicacion22'
                ? diario.etapas.probarPostReplay21.esperado21[banco]
                : diario.etapas.probarPostReplay22.esperado22[banco];
        const exacta = nombre === 'pausar22' || (v !== 22 && nombre !== 'verificar22');
        if (
          !compararSnapshotsContraccion(antes, actual, {
            exacta,
            recuperacion: nombre === 'verificar21' && v === 22,
          })
        )
          throw new Error('pérdida en JSON/cuota/auxiliares/FK o índices');
        evidencias[banco] = actual;
      }
      return { evidencias };
    }
    return {};
  }
  const banco = (version, copia = false) =>
    `curichi_sdd_m10c_${plan.corrida}_${copia ? 'copia' : 'origen'}${version}`;
  function nombresEtapa(nombre, despues = false) {
    const version = nombre.match(/(19|21|22)$/)?.[1];
    if (nombre.startsWith('verificarRelease') || nombre === 'preflight') return [];
    if (nombre.startsWith('preparar')) return despues ? [banco(version)] : [];
    if (nombre.startsWith('respaldar')) return [banco(version)];
    if (nombre.startsWith('cargar'))
      return despues ? [banco(version), banco(version, true)] : [banco(version)];
    return plan.bancos;
  }
  async function identidades(nombres) {
    const resultado = [];
    for (const nombre of nombres) {
      const id = await adaptador.identidad(nombre);
      if (
        id?.nombre !== nombre ||
        id.marca !== plan.corrida ||
        !/^\d+$/.test(id.oid ?? '') ||
        typeof id.servidor !== 'string' ||
        !id.servidor ||
        typeof id.propietario !== 'string' ||
        !id.propietario
      )
        throw new Error('identidad de banco no acreditada');
      const previa = Object.values(diario.etapas)
        .flatMap((e) => e.identidades ?? [])
        .find((i) => i.nombre === nombre);
      if (previa && huellaCanonica(previa) !== huellaCanonica(id))
        throw new Error('identidad/OID/servidor de banco cambió');
      resultado.push(id);
    }
    return resultado;
  }
  async function ejecutarEtapa(nombre) {
    if (enCurso) throw new Error('etapa en ejecución');
    if (!Object.hasOwn(ETAPAS, nombre)) throw new Error('etapa desconocida');
    validarDiario(diario, plan);
    if (diario.etapas[nombre]?.estado === 'incierta')
      throw new Error('etapa incierta: requiere reconciliación explícita');
    if (diario.etapas[nombre]?.estado === 'verificada') {
      if (typeof adaptador.verificarCheckpoint !== 'function')
        throw new Error('reanudación requiere verificador de checkpoint inyectado');
      const ids = await identidades(nombresEtapa(nombre, true));
      const e = diario.etapas[nombre];
      if (!(await adaptador.verificarCheckpoint(nombre, structuredClone(e), ids)))
        throw new Error('checkpoint no vigente');
      return structuredClone(e);
    }
    if (
      ['preparar22', 'migrar22', 'reaplicar22'].includes(nombre) &&
      autorizarContraccionCompatible !== true
    )
      throw new Error('consentimiento explícito requerido');
    if (ETAPAS[nombre].some((p) => diario.etapas[p]?.estado !== 'verificada'))
      throw new Error('etapa previa no verificada');
    enCurso = true;
    try {
      if (nombre === 'preflight') {
        for (const banco of plan.bancos) {
          const ocupada = await adaptador.ocupada(banco);
          if (ocupada !== false) throw new Error('banco ocupado o ausencia no comprobada');
        }
      }
      if (
        nombre.startsWith('cargar') &&
        (await adaptador.ocupada(banco(nombre.slice(-2), true))) !== false
      )
        throw new Error('copia ocupada antes de carga; no se adopta ni reemplaza');
      if (
        nombre.startsWith('preparar') &&
        (await adaptador.ocupada(banco(nombre.slice(-2)))) !== false
      )
        throw new Error('origen nuevo ocupado; no se adopta ni reemplaza');
      await precondicionesVigentes(nombre);
      const entradaSha256 = huellaCanonica(diario);
      // Persistir ANTES de mutar: un error/crash nunca se convierte en reintento automático.
      diario.etapas[nombre] = { estado: 'incierta', entradaSha256 };
      await guardar(structuredClone(diario));
      let resultado;
      if (nombre.startsWith('verificarRelease')) {
        const version = Number(nombre.slice(-2));
        resultado = await adaptador.verificarRelease(
          version,
          structuredClone(plan[`release${version}`]),
        );
        releaseValido(resultado, version, plan[`release${version}`]);
      } else {
        const ids = await identidades(nombresEtapa(nombre));
        resultado = await adaptador.ejecutar(nombre, {
          plan: structuredClone(plan),
          entradaSha256,
          identidades: ids,
          autorizarContraccionCompatible: autorizarContraccionCompatible === true,
        });
        if (resultado?.verificado !== true || !sha(resultado.sha256))
          throw new Error('resultado de etapa no verificado');
      }
      const contenido = {
        estado: 'verificada',
        entradaSha256,
        salidaSha256: resultado.sha256,
        ...comprobarDatos(nombre, resultado),
        identidades: await identidades(nombresEtapa(nombre, true)),
      };
      diario.etapas[nombre] = {
        ...contenido,
        sello: huellaCanonica({ plan: diario.planSha256, nombre, ...contenido }),
      };
      await guardar(structuredClone(diario));
      return structuredClone(diario.etapas[nombre]);
    } catch (error) {
      if (diario.etapas[nombre]?.estado === 'verificada')
        diario.etapas[nombre] = { estado: 'incierta' };
      await guardar(structuredClone(diario));
      throw error;
    } finally {
      enCurso = false;
    }
  }
  async function reconciliarEtapa(nombre) {
    if (
      enCurso ||
      diario.etapas[nombre]?.estado !== 'incierta' ||
      typeof adaptador.reconciliarEtapa !== 'function'
    )
      throw new Error('reconciliación explícita inyectada requerida');
    validarDiario(diario, plan);
    enCurso = true;
    try {
      await precondicionesVigentes(nombre);
      const anteriorSha256 = huellaCanonica(diario.etapas[nombre]);
      const resultado = await adaptador.reconciliarEtapa(
        nombre,
        structuredClone(diario),
        structuredClone(plan),
      );
      if (resultado?.verificado !== true || !sha(resultado.sha256))
        throw new Error('reconciliación no verificada');
      if (nombre.startsWith('verificarRelease'))
        releaseValido(resultado, Number(nombre.slice(-2)), plan[`release${nombre.slice(-2)}`]);
      const contenido = {
        estado: 'verificada',
        entradaSha256: anteriorSha256,
        salidaSha256: resultado.sha256,
        reconciliada: true,
        ...comprobarDatos(nombre, resultado),
        identidades: await identidades(nombresEtapa(nombre, true)),
      };
      const etapa = {
        ...contenido,
        sello: huellaCanonica({ plan: diario.planSha256, nombre, ...contenido }),
      };
      // No se llama ejecutar: reconciliar acredita el efecto previo mediante lectura del adaptador.
      await guardar({
        ...structuredClone(diario),
        etapas: { ...structuredClone(diario.etapas), [nombre]: etapa },
      });
      diario.etapas[nombre] = etapa;
      return structuredClone(etapa);
    } finally {
      enCurso = false;
    }
  }
  return Object.freeze({
    ejecutarEtapa,
    reconciliarEtapa,
    diario: () => structuredClone(diario),
    plan: () => structuredClone(plan),
  });
}
