import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router/router';
import { AppStoreProvider } from './store/app-store';
import { getThemeMode, setThemeMode } from './theme';
import './styles.css';

setThemeMode(getThemeMode());

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppStoreProvider>
      <RouterProvider router={router} />
    </AppStoreProvider>
  </React.StrictMode>
);
