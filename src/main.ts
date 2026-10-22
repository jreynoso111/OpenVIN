import './styles/construction.css';

import { mountUnderConstruction } from './ui/underConstruction';

const app = document.getElementById('app');
if (!app) throw new Error('VinOrbits: #app mount point is missing');

mountUnderConstruction(app);
