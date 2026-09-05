import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { CaptureViews } from './components/CaptureViews.tsx';
import './index.css';

const isCapture = window.location.pathname === '/capture' || window.location.hash === '#capture';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isCapture ? <CaptureViews /> : <App />}
  </StrictMode>,
);
