import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '@mos/ui';
import LicenseGate from '../../packages/ui/src/LicenseGate';
createRoot(document.getElementById('root')!).render(<React.StrictMode><LicenseGate><App /></LicenseGate></React.StrictMode>);
