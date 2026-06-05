export interface GestureConfig {
  id: string;
  video: string;
}

export const GESTURE_CONFIG: GestureConfig[] = [
  {
    id: 'Open_Palm',
    video:
      'https://res.cloudinary.com/dgjvejfnf/video/upload/v1780413093/animacion_1780346973883_sxqran.webm',
  },
  {
    id: 'Thumb_Down',
    video:
      'https://res.cloudinary.com/dgjvejfnf/video/upload/v1780413093/animacion_1780412553562_mvkeb9.webm',
  },
  {
    id: 'Pointing_Up',
    video:
      'https://res.cloudinary.com/dgjvejfnf/video/upload/v1780413092/animacion_1780412533217_zwyjwj.webm',
  },
];

export const DEFAULT_VIDEO =
  'https://res.cloudinary.com/dgjvejfnf/video/upload/v1780413093/animacion_1780346973883_sxqran.webm';
