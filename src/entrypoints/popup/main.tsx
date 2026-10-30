import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/assets/globals.css';
import { PopupPage } from '@/pages/popup';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PopupPage />
  </StrictMode>,
);
