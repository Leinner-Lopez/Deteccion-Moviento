import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./gesture-detection/gesture-detection').then((m) => m.GestureDetectionComponent),
  },
];
