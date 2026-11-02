import React from 'react';
import {createRoot} from 'react-dom/client';
import {AppBackground} from '../src/AppBackground';
import {ThemeProvider} from '../src/Theme';
import '../src/style.css';

document.documentElement.dataset.theme=new URLSearchParams(location.search).get('theme')==='light'?'light':'dark';
createRoot(document.getElementById('root')!).render(<ThemeProvider><AppBackground/></ThemeProvider>);
