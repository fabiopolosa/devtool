import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { LocaleProvider } from './i18n/locale';
import { router } from './router/router';
import { AppStoreProvider } from './store/app-store';
import { getThemeMode, setThemeMode } from './theme';
import './styles.css';

setThemeMode(getThemeMode());

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppStoreProvider>
      <LocaleProvider>
        <RouterProvider router={router} />
      </LocaleProvider>
    </AppStoreProvider>
  </React.StrictMode>
);
