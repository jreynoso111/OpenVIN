import './styles/maintenance.css';

import { mountMaintenancePage } from './ui/maintenance';

const app = document.getElementById('app');
if (!app) throw new Error('VinOrbits: #app mount point is missing');

mountMaintenancePage(app);
