import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { procesarUbicacionesGpsLocal } from './gpsPersistence';

export const GPS_BACKGROUND_TASK = 'korva-gps-background-v1';

if (!TaskManager.isTaskDefined(GPS_BACKGROUND_TASK)) {
  TaskManager.defineTask(GPS_BACKGROUND_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    await procesarUbicacionesGpsLocal(data.locations);
  });
}

export const iniciarGpsBackground = async () => {
  const iniciada = await Location.hasStartedLocationUpdatesAsync(GPS_BACKGROUND_TASK);
  if (iniciada) return;
  await Location.startLocationUpdatesAsync(GPS_BACKGROUND_TASK, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 3,
    activityType: Location.ActivityType.Fitness,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
  });
};

export const detenerGpsBackground = async () => {
  const iniciada = await Location.hasStartedLocationUpdatesAsync(GPS_BACKGROUND_TASK);
  if (iniciada) await Location.stopLocationUpdatesAsync(GPS_BACKGROUND_TASK);
};
