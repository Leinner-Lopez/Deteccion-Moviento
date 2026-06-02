export interface GestureConfig {
  id: string;
  video: string;
}

export const GESTURE_CONFIG: GestureConfig[] = [
  {
    id: 'Open_Palm',
    video: 'https://player.cloudinary.com/embed/?cloud_name=dgjvejfnf&public_id=animacion_1780412533217_zwyjwj',
  },
  {
    id: 'Thumb_Down',
    video: 'https://player.cloudinary.com/embed/?cloud_name=dgjvejfnf&public_id=animacion_1780346973883_sxqran',
  },
  {
    id: 'Pointing_Up',
    video: 'https://player.cloudinary.com/embed/?cloud_name=dgjvejfnf&public_id=animacion_1780412553562_mvkeb9',
  },
];

export const DEFAULT_VIDEO =
  'https://res.cloudinary.com/dgjvejfnf/video/upload/v1779900893/holograma_piramide_rl7xs0.webm';
