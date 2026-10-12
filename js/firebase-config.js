/* ==========================================================================
   Configuración e inicialización de Firebase Realtime Database
   Proyecto: medioambiente-7964d
   --------------------------------------------------------------------------
   NOTA: Usamos el SDK "compat" (firebase-app-compat / firebase-database-compat)
   para no requerir un bundler (Webpack/Vite). Funciona perfecto en
   GitHub Pages con <script> clásicos.
   ========================================================================== */

(function () {
  'use strict';

  const firebaseConfig = {
    apiKey: "AIzaSyC9uRUlJfznjMIO-3ne0b3N_LCAdKQHPV8",
    authDomain: "medioambiente-7964d.firebaseapp.com",
    databaseURL: "https://medioambiente-7964d-default-rtdb.firebaseio.com",
    projectId: "medioambiente-7964d",
    storageBucket: "medioambiente-7964d.firebasestorage.app",
    messagingSenderId: "441783434499",
    appId: "1:441783434499:web:b01f0904adcbbbbbd2bd36"
  };

  // Inicializar Firebase solo si no está ya inicializado
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  // Exponer la referencia a la base de datos globalmente
  window.db = firebase.database();

  console.log('[Firebase] Inicializado correctamente → proyecto: medioambiente-7964d');
})();