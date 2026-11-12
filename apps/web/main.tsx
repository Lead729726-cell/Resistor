import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '@mos/ui';
import LicenseGate from '../../packages/ui/src/LicenseGate';
import '../../packages/ui/src/edu-workbench.css';
import {productEdition} from '../../packages/ui/src/product-edition';
document.title=productEdition.name;
createRoot(document.getElementById('root')!).render(<React.StrictMode><LicenseGate><App /></LicenseGate></React.StrictMode>);
