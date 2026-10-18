import type { ExportacionGeoJson, ReporteTecnicoFeatureCollection } from 'contracts';

/** Derivados de contracts: reflejan los planos nullable sin copiar el payload HTTP. */
export type ReportePanel = ExportacionGeoJson['features'][number];
export type PropiedadesReportePanel = ReportePanel['properties'];
export type ColeccionReportesPanel = Omit<ReporteTecnicoFeatureCollection, 'features'> & {
  features: ReportePanel[];
};
