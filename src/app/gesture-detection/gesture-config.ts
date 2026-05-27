export interface GestureConfig {
  id: string;
  video: string;
}

export const GESTURE_CONFIG: GestureConfig[] = [
  {
    id: 'Open_Palm',
    video: 'https://res.cloudinary.com/dgjvejfnf/video/upload/v1779900893/holograma_piramide_rl7xs0.webm',
  },
  {
    id: 'Thumb_Down',
    video: 'https://res.cloudinary.com/dgjvejfnf/video/upload/v1779900914/holograma_piramide_2_dwqarg.webm',
  },
  {
    id: 'Pointing_Up',
    video: 'https://res.cloudinary.com/dgjvejfnf/video/upload/v1779900939/holograma_piramide_1_h6e741.webm',
  },
];

export const DEFAULT_VIDEO =
  'https://res.cloudinary.com/dgjvejfnf/video/upload/v1779900893/holograma_piramide_rl7xs0.webm';
