export const nombreDeporteActividad = (tipo) => ({
  run: 'Running',
  walk: 'Caminata',
  ride: 'Ciclismo',
  swim: 'Natación',
  manual: 'Actividad',
}[String(tipo || '').toLowerCase()] || tipo || 'Actividad');

export const iconoDeporteActividad = (tipo) => ({
  run: 'fitness-outline',
  walk: 'walk-outline',
  ride: 'bicycle-outline',
  bici: 'bicycle-outline',
  ciclismo: 'bicycle-outline',
  swim: 'water-outline',
  natación: 'water-outline',
}[String(tipo || '').toLowerCase()] || 'pulse-outline');

export const nombreFuenteActividad = (source) =>
  source === 'korva_gps' ? 'Korva GPS'
    : source === 'strava' ? 'Strava'
      : source === 'manual' ? 'Manual'
        : (source || 'Korva');
