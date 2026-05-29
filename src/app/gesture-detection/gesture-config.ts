export interface GestureConfig {
  id: string;
  video: string;
}

export const GESTURE_CONFIG: GestureConfig[] = [
  {
    id: 'Open_Palm',
    video: 'https://res.cloudinary.com/dgjvejfnf/video/upload/v1780064749/Saludo_o7fkpv.webm',
  },
  {
    id: 'Thumb_Down',
    video:
      'https://res.cloudinary.com/dgjvejfnf/video/upload/v1780064188/Gato-Sentadilla_q9sd0f.webm',
  },
  {
    id: 'Pointing_Up',
    video: 'https://res.cloudinary.com/dgjvejfnf/video/upload/v1780064189/Salto_tux2wn.webm',
  },
];

export const DEFAULT_VIDEO =
  'https://res.cloudinary.com/dgjvejfnf/video/upload/v1780064749/Saludo_o7fkpv.webm';
