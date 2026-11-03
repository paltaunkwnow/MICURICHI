import type {
  ReporteTecnico,
  ReporteTecnicoFeature,
  ReporteTecnicoFeatureCollection,
} from 'contracts';

/** Alias del contrato técnico canónico, con planos nullable según la categoría desde 0.23.0. */
export type ReportePanel = ReporteTecnicoFeature;
export type PropiedadesReportePanel = ReporteTecnico;
export type ColeccionReportesPanel = ReporteTecnicoFeatureCollection;
