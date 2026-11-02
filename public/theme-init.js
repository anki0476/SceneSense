// Apply the saved appearance before React paints.
(()=>{let theme='dark';try{const saved=localStorage.getItem('scenesense-theme');if(saved==='light'||saved==='dark')theme=saved;}catch{}document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;})();
