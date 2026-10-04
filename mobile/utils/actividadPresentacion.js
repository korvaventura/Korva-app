export const nombreDeporteActividad = (tipo) => ({
  run: 'Running',
  walk: 'Caminata',
  ride: 'Ciclismo',
  swim: 'Natación',
}[tipo] || tipo || 'Actividad');

export const nombreFuenteActividad = (source) =>
  source === 'korva_gps' ? 'Korva GPS'
    : source === 'strava' ? 'Strava'
      : source === 'manual' ? 'Manual'
        : (source || 'Korva');
