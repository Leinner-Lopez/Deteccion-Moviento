export interface GestureConfig {
  id: string;
  video: string;
  /** Comando serie enviado al Pi Pico al reconocer el gesto. */
  hologramCommand: string;
}

export const GESTURE_CONFIG: GestureConfig[] = [
  {
    id: 'Open_Palm',
    video:
      'https://res.cloudinary.com/dgjvejfnf/video/upload/v1780413093/animacion_1780346973883_sxqran.webm',
    // Anillos concentricos cian
    hologramCommand: 'PATTERN 1',
  },
  {
    id: 'Thumb_Down',
    video:
      'https://res.cloudinary.com/dgjvejfnf/video/upload/v1780413093/animacion_1780412553562_mvkeb9.webm',
    // Aspas rojas
    hologramCommand: 'PATTERN 2',
  },
  {
    id: 'Pointing_Up',
    video:
      'https://res.cloudinary.com/dgjvejfnf/video/upload/v1780413092/animacion_1780412533217_zwyjwj.webm',
    // Espiral violeta
    hologramCommand: 'PATTERN 3',
  },
  {
    id: 'Victory',
    video:
      'https://res.cloudinary.com/dgjvejfnf/video/upload/v1780413093/animacion_1780346973883_sxqran.webm',
    // Mano saludando
    hologramCommand: 'PATTERN 4',
  },
  {
    id: 'Okay',
    video:
      'https://res.cloudinary.com/dgjvejfnf/video/upload/v1780413093/animacion_1780412553562_mvkeb9.webm',
    // Persona corriendo
    hologramCommand: 'PATTERN 5',
  },
  {
    id: 'Peace',
    video:
      'https://res.cloudinary.com/dgjvejfnf/video/upload/v1780413092/animacion_1780412533217_zwyjwj.webm',
    // Latido cardiaco
    hologramCommand: 'PATTERN 6',
  },
];

export const DEFAULT_VIDEO =
  'https://res.cloudinary.com/dgjvejfnf/video/upload/v1780413093/animacion_1780346973883_sxqran.webm';

/** Sin gesto activo: la tira vuelve al disco arcoíris. */
export const DEFAULT_HOLOGRAM_COMMAND = 'PATTERN 0';
