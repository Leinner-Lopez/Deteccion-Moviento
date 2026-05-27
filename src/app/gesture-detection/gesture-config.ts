export interface GestureConfig {
  id: string;
  description: string;
  video: string;
}

export const GESTURE_CONFIG: GestureConfig[] = [
  {
    id: 'hands_up',
    description: 'Persona con ambas manos levantadas por encima de la cabeza',
    video: 'assets/videos/hands_up.mp4',
  },
  {
    id: 'point_right',
    description: 'Persona señalando hacia la derecha con el brazo extendido',
    video: 'assets/videos/point_right.mp4',
  },
];

export const DEFAULT_VIDEO = 'assets/videos/default.mp4';
