/**
 * ========================================================
 * REGISTRO ATÓMICO - LÓGICA DE LA APLICACIÓN v3.0
 * - 3 Usuarios independientes: Elias, Mónica y Mauro
 * - Opción para cambiar Contraseña / PIN (sincronizada en servidor)
 * - Alarma automática por 2 días sin rellenar (visual, sonora y push)
 * - Notificación cruzada a los demás usuarios al completar todo (6/6)
 * ========================================================
 */

const APP_CONFIG = {
  USERS: {
    elias: {
      id: 'elias',
      nombre: 'Elias',
      pin: '1234',
      tema: 'theme-elias',
      themeColor: '#0284c7',
      avatar: 'E',
      fraseDefault: '«Tengo que estandarizar antes de poder optimizar»',
      habitosDefault: [
        { id: 1, nombre: 'Despertar a las 6:00 a.m.', umbral: 'Poner los pies en el suelo y apagar alarma', hora: '06:00 AM' },
        { id: 2, nombre: 'Leer 2 hojas', umbral: 'Abrir el libro y leer 2 hojas después de levantarme', hora: '06:15 AM' },
        { id: 3, nombre: 'Hacer la cama', umbral: 'Estirar las sábanas y colocar almohadas', hora: '06:30 AM' },
        { id: 4, nombre: 'Bañarme', umbral: 'Entrar a la ducha matutina', hora: '06:45 AM' },
        { id: 5, nombre: 'Hacer ejercicio a las 9:00 a.m.', umbral: 'Ponerme la ropa deportiva y los tenis', hora: '09:00 AM' },
        { id: 6, nombre: 'Comer mejor / Nutrición', umbral: 'Servir un vaso de agua y porción consciente', hora: '13:30 PM' }
      ]
    },
    monica: {
      id: 'monica',
      nombre: 'Mónica',
      pin: '1234',
      tema: 'theme-monica',
      themeColor: '#7c3aed',
      avatar: 'M',
      fraseDefault: '«Pequeños hábitos diarios generan resultados extraordinarios»',
      habitosDefault: [
        { id: 1, nombre: 'Despertar temprano', umbral: 'Levantarme al sonar la alarma', hora: '06:30 AM' },
        { id: 2, nombre: 'Lectura inspiradora', umbral: 'Leer 2 páginas con calma', hora: '07:00 AM' },
        { id: 3, nombre: 'Planificación del día', umbral: 'Anotar mis 3 prioridades clave', hora: '08:00 AM' },
        { id: 4, nombre: 'Cuidado personal', umbral: 'Rutina facial e hidratación', hora: '08:30 AM' },
        { id: 5, nombre: 'Actividad física', umbral: 'Ponerse ropa cómoda y estiramientos', hora: '10:00 AM' },
        { id: 6, nombre: 'Desconexión nocturna', umbral: 'Dejar el móvil fuera del dormitorio', hora: '22:30 PM' }
      ]
    },
    mauro: {
      id: 'mauro',
      nombre: 'Mauro',
      pin: '1234',
      tema: 'theme-mauro',
      themeColor: '#0d9488',
      avatar: 'MA',
      fraseDefault: '«La constancia diaria supera al talento cuando el talento no es constante»',
      habitosDefault: [
        { id: 1, nombre: 'Despertar a tiempo', umbral: 'Poner los pies en el suelo al sonar la alarma', hora: '06:30 AM' },
        { id: 2, nombre: 'Lectura diaria', umbral: 'Leer 2 hojas de mi libro', hora: '07:00 AM' },
        { id: 3, nombre: 'Ordenar mi espacio', umbral: 'Hacer la cama y despejar escritorio', hora: '07:15 AM' },
        { id: 4, nombre: 'Entrenamiento / Ejercicio', umbral: 'Ponerme la ropa y calzado de entrenar', hora: '09:00 AM' },
        { id: 5, nombre: 'Enfoque / Estudio', umbral: 'Abrir el cuaderno o material durante 2 minutos', hora: '11:00 AM' },
        { id: 6, nombre: 'Hidratación y Nutrición', umbral: 'Tomar un vaso grande de agua antes de comer', hora: '13:30 PM' }
      ]
    }
  },
  ESTADOS: {
    VACIO: 0,
    VERDE: 1,  // Éxito (< 2 min)
    ROJO: 2    // Día saltado (honesto)
  },
  META_CONSOLIDACION: 21 // Días verdes necesarios para estandarizar
};

class RegistroAtomicoApp {
  constructor() {
    this.usuarioActivo = null;
    this.perfilPendiente = null;
    this.fechaActual = new Date();
    this.mesSeleccionado = this.fechaActual.getMonth();
    this.anoSeleccionado = this.fechaActual.getFullYear();

    this.mesesNombres = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    this.datos = null;
    this.todosUsuariosDatos = {};
    this.pinsRemotos = { elias: '1234', monica: '1234', mauro: '1234' };
    this.notificaciones = [];
    this.servidorDisponible = false;
    this.ultimasNotifsVistas = new Set();
    this.alarmaSonadaSesion = false;
    this.pollInterval = null;
    this.relojAlarmaInterval = null;
  }

  async init() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    const horaGuardada = localStorage.getItem('registro_atomico_hora_alarma') || '21:00';
    const inputHora = document.getElementById('alarm-time-input');
    if (inputHora) inputHora.value = horaGuardada;

    // Pre-cargar estado del servidor (incluyendo PINs actualizados)
    await this.precargarPinsDesdeServidor();

    const usuarioGuardado = localStorage.getItem('registro_atomico_usuario_activo');
    if (usuarioGuardado && APP_CONFIG.USERS[usuarioGuardado]) {
      await this.cargarUsuario(usuarioGuardado);
      this.cerrarModal('login-modal');
    } else {
      this.abrirModal('login-modal');
    }

    this.pollInterval = setInterval(() => this.sincronizarDesdeServidor(true), 6000);
    this.relojAlarmaInterval = setInterval(() => this.chequearRelojAlarmaDiaria(), 45000);

    window.addEventListener('storage', () => {
      if (this.usuarioActivo) {
        this.cargarDatosLocales();
        this.renderizarTodo();
      }
    });
  }

  async precargarPinsDesdeServidor() {
    if (!location.protocol.startsWith('http')) return;
    try {
      const resp = await fetch('api.php?action=load', { cache: 'no-store' });
      if (resp.ok) {
        const store = await resp.json();
        if (store.pins) {
          this.pinsRemotos = { ...this.pinsRemotos, ...store.pins };
          Object.entries(store.pins).forEach(([u, p]) => {
            if (p) localStorage.setItem(`pin_${u}`, p);
          });
        }
      }
    } catch (e) {}
  }

  obtenerOtrosUsuariosIds() {
    return Object.keys(APP_CONFIG.USERS).filter(id => id !== this.usuarioActivo);
  }

  obtenerNombresOtrosUsuarios() {
    return this.obtenerOtrosUsuariosIds().map(id => APP_CONFIG.USERS[id].nombre).join(' y ');
  }

  // ========================================================
  // SONIDOS SINTETIZADOS (WEB AUDIO API)
  // ========================================================
  reproducirSonido(tipo = 'alarma') {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (tipo === 'alarma') {
        [0, 0.25, 0.5].forEach((offset, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(idx % 2 === 0 ? 587.33 : 880, ctx.currentTime + offset);
          gain.gain.setValueAtTime(0.14, ctx.currentTime + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + offset);
          osc.stop(ctx.currentTime + offset + 0.2);
        });
      } else if (tipo === 'victoria') {
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);
          gain.gain.setValueAtTime(0.18, ctx.currentTime + idx * 0.12);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.35);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + idx * 0.12);
          osc.stop(ctx.currentTime + idx * 0.12 + 0.35);
        });
      }
    } catch (e) {}
  }

  sonarAlarmaManual() {
    this.reproducirSonido('alarma');
    this.lanzarNotificacionDispositivo(
      '⏰ Alarma de Registro Atómico',
      'Prueba de alarma: Recuerda no pasar nunca 2 días sin rellenar tus hábitos.'
    );
  }

  // ========================================================
  // NOTIFICACIONES DEL SISTEMA (ANDROID & iOS PWA)
  // ========================================================
  async solicitarPermisoNotificaciones() {
    if (!('Notification' in window)) {
      alert('En iPhone (iOS): primero añade la app a la Pantalla de Inicio desde Safari (Compartir → Añadir a pantalla de inicio) para activar las notificaciones nativas.');
      return;
    }
    const permiso = await Notification.requestPermission();
    this.actualizarEstadoPermisoUI();
    if (permiso === 'granted') {
      this.reproducirSonido('victoria');
      this.lanzarNotificacionDispositivo(
        '🔔 ¡Alertas Activadas!',
        'Te avisaremos si pasas 2 días sin rellenar o cuando otro usuario complete todos sus hábitos.'
      );
    }
  }

  actualizarEstadoPermisoUI() {
    const label = document.getElementById('push-permission-status');
    if (!label) return;
    if ('Notification' in window && Notification.permission === 'granted') {
      label.textContent = '✅ Notificaciones activas en este dispositivo.';
      label.style.color = '#16a34a';
    }
  }

  lanzarNotificacionDispositivo(titulo, cuerpo) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(titulo, {
            body: cuerpo,
            icon: 'icon.svg',
            badge: 'icon.svg',
            vibrate: [200, 100, 200]
          });
        });
      } else {
        new Notification(titulo, { body: cuerpo, icon: 'icon.svg' });
      }
    } catch (e) {}
  }

  guardarHoraAlarma(hora) {
    localStorage.setItem('registro_atomico_hora_alarma', hora);
  }

  chequearRelojAlarmaDiaria() {
    if (!this.usuarioActivo || !this.datos) return;
    const horaConfig = localStorage.getItem('registro_atomico_hora_alarma') || '21:00';
    const ahora = new Date();
    const hhmm = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
    const hoyKey = this.getFechaHoyISO();
    const yaSonoHoy = localStorage.getItem(`alarma_diaria_sonada_${this.usuarioActivo}_${hoyKey}`);

    if (hhmm === horaConfig && !yaSonoHoy) {
      const progresoHoy = this.calcularProgresoDia(this.datos, ahora.getDate(), this.getMesKeyActual());
      const sinRellenar2Dias = this.detectarHabitosSinRellenar2Dias();
      if (progresoHoy.marcados < 6 || sinRellenar2Dias.length > 0) {
        localStorage.setItem(`alarma_diaria_sonada_${this.usuarioActivo}_${hoyKey}`, '1');
        this.reproducirSonido('alarma');
        this.lanzarNotificacionDispositivo(
          '⏰ ¡Hora de tu Registro de Hábitos!',
          sinRellenar2Dias.length > 0
            ? `¡Alerta! Llevas 2 días sin rellenar: ${sinRellenar2Dias.map(h => h.nombre).join(', ')}`
            : `Llevas ${progresoHoy.marcados}/6 hábitos registrados hoy. ¡No olvides pintar tus cuadros!`
        );
      }
    }
  }

  // ========================================================
  // AUTENTICACIÓN, PERFILES Y CAMBIO DE CONTRASEÑA
  // ========================================================
  seleccionarPerfil(userId) {
    this.perfilPendiente = userId;
    const user = APP_CONFIG.USERS[userId];
    document.getElementById('pin-target-name').textContent = user.nombre;
    document.getElementById('pin-section').classList.remove('hidden');
    document.getElementById('pin-error').classList.add('hidden');
    const changeBox = document.getElementById('login-change-pin-box');
    if (changeBox) changeBox.classList.add('hidden');
    const fb = document.getElementById('login-change-pin-feedback');
    if (fb) fb.classList.add('hidden');
    const input = document.getElementById('pin-input');
    input.value = '';
    input.focus();

    input.onkeyup = (e) => {
      if (e.key === 'Enter') this.verificarPin();
    };
  }

  cancelarSeleccionPerfil() {
    this.perfilPendiente = null;
    document.getElementById('pin-section').classList.add('hidden');
    document.getElementById('pin-input').value = '';
    const changeBox = document.getElementById('login-change-pin-box');
    if (changeBox) changeBox.classList.add('hidden');
  }

  toggleCambiarPinEnLogin() {
    const box = document.getElementById('login-change-pin-box');
    const fb = document.getElementById('login-change-pin-feedback');
    if (!box) return;
    box.classList.toggle('hidden');
    if (fb) fb.classList.add('hidden');
    if (!box.classList.contains('hidden')) {
      document.getElementById('login-old-pin').value = '';
      document.getElementById('login-new-pin').value = '';
      document.getElementById('login-confirm-pin').value = '';
      document.getElementById('login-old-pin').focus();
    }
  }

  async guardarPinDesdeLogin() {
    const targetUser = this.perfilPendiente;
    if (!targetUser) return;

    const actual = document.getElementById('login-old-pin').value.trim();
    const nuevo = document.getElementById('login-new-pin').value.trim();
    const confirmar = document.getElementById('login-confirm-pin').value.trim();
    const fb = document.getElementById('login-change-pin-feedback');

    await this.precargarPinsDesdeServidor();
    const pinReal = this.obtenerPinActualUsuario(targetUser);

    fb.className = 'pin-error';

    if (actual !== pinReal) {
      fb.textContent = 'La contraseña actual no es correcta.';
      fb.classList.remove('hidden');
      return;
    }

    if (nuevo.length < 3) {
      fb.textContent = 'La nueva contraseña debe tener al menos 3 caracteres.';
      fb.classList.remove('hidden');
      return;
    }

    if (nuevo !== confirmar) {
      fb.textContent = 'La nueva contraseña y su confirmación no coinciden.';
      fb.classList.remove('hidden');
      return;
    }

    localStorage.setItem(`pin_${targetUser}`, nuevo);
    this.pinsRemotos[targetUser] = nuevo;

    if (location.protocol.startsWith('http')) {
      try {
        const resp = await fetch('api.php?action=change_pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: targetUser,
            pinActual: actual,
            pinNuevo: nuevo
          })
        });
        const data = await resp.json();
        if (resp.status === 403 || data.ok === false) {
          fb.textContent = data.error || 'Error al actualizar la contraseña en el servidor.';
          fb.classList.remove('hidden');
          return;
        }
      } catch (e) {}
    }

    fb.className = 'pin-success';
    fb.textContent = '✅ ¡Contraseña cambiada! Entrando...';
    fb.classList.remove('hidden');
    document.getElementById('pin-input').value = nuevo;

    setTimeout(async () => {
      await this.cargarUsuario(targetUser);
      this.cerrarModal('login-modal');
      this.cancelarSeleccionPerfil();
    }, 700);
  }

  obtenerPinActualUsuario(userId) {
    return localStorage.getItem(`pin_${userId}`) || this.pinsRemotos[userId] || APP_CONFIG.USERS[userId].pin;
  }

  async verificarPin() {
    const pinIngresado = document.getElementById('pin-input').value.trim();
    if (!this.perfilPendiente) return;

    await this.precargarPinsDesdeServidor();
    const pinGuardado = this.obtenerPinActualUsuario(this.perfilPendiente);

    if (pinIngresado === pinGuardado) {
      await this.cargarUsuario(this.perfilPendiente);
      this.cerrarModal('login-modal');
      this.cancelarSeleccionPerfil();
    } else {
      document.getElementById('pin-error').classList.remove('hidden');
      document.getElementById('pin-input').focus();
    }
  }

  abrirModalCambiarPin() {
    if (!this.usuarioActivo) return;
    const user = APP_CONFIG.USERS[this.usuarioActivo];
    document.getElementById('change-pin-username').textContent = user.nombre;
    document.getElementById('current-pin-input').value = '';
    document.getElementById('new-pin-input').value = '';
    document.getElementById('confirm-pin-input').value = '';
    const fb = document.getElementById('change-pin-feedback');
    fb.classList.add('hidden');
    fb.textContent = '';
    this.abrirModal('modal-pin');
  }

  async guardarNuevoPin() {
    if (!this.usuarioActivo) return;
    const actual = document.getElementById('current-pin-input').value.trim();
    const nuevo = document.getElementById('new-pin-input').value.trim();
    const confirmar = document.getElementById('confirm-pin-input').value.trim();
    const fb = document.getElementById('change-pin-feedback');

    fb.className = 'pin-error';

    const pinReal = this.obtenerPinActualUsuario(this.usuarioActivo);
    if (actual !== pinReal) {
      fb.textContent = 'La contraseña actual no es correcta.';
      fb.classList.remove('hidden');
      return;
    }

    if (nuevo.length < 3) {
      fb.textContent = 'La nueva contraseña debe tener al menos 3 caracteres.';
      fb.classList.remove('hidden');
      return;
    }

    if (nuevo !== confirmar) {
      fb.textContent = 'La nueva contraseña y su confirmación no coinciden.';
      fb.classList.remove('hidden');
      return;
    }

    // Guardar en local y en servidor
    localStorage.setItem(`pin_${this.usuarioActivo}`, nuevo);
    this.pinsRemotos[this.usuarioActivo] = nuevo;

    if (location.protocol.startsWith('http')) {
      try {
        const resp = await fetch('api.php?action=change_pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: this.usuarioActivo,
            pinActual: actual,
            pinNuevo: nuevo
          })
        });
        const data = await resp.json();
        if (resp.status === 403 || data.ok === false) {
          fb.textContent = data.error || 'Error al actualizar la contraseña en el servidor.';
          fb.classList.remove('hidden');
          return;
        }
      } catch (e) {}
    }

    fb.className = 'pin-success';
    fb.textContent = '✅ ¡Contraseña actualizada correctamente!';
    fb.classList.remove('hidden');
    setTimeout(() => {
      this.cerrarModal('modal-pin');
    }, 900);
  }

  async cargarUsuario(userId) {
    this.usuarioActivo = userId;
    this.alarmaSonadaSesion = false;
    localStorage.setItem('registro_atomico_usuario_activo', userId);
    const user = APP_CONFIG.USERS[userId];

    document.body.className = user.tema;
    const metaTheme = document.getElementById('meta-theme-color');
    if (metaTheme) metaTheme.setAttribute('content', user.themeColor);

    document.getElementById('nav-avatar').textContent = user.avatar;
    document.getElementById('nav-username').textContent = user.nombre;

    this.cargarDatosLocales();
    await this.sincronizarDesdeServidor(false);
    this.actualizarEstadoPermisoUI();
    this.renderizarTodo();
  }

  cerrarSesion() {
    this.usuarioActivo = null;
    localStorage.removeItem('registro_atomico_usuario_activo');
    this.cancelarSeleccionPerfil();
    this.abrirModal('login-modal');
  }

  // ========================================================
  // GESTIÓN DE DATOS (LOCALSTORAGE + API.PHP EN TIEMPO REAL)
  // ========================================================
  getStorageKey(userId = this.usuarioActivo) {
    return `registro_atomico_data_${userId}`;
  }

  normalizarDatosUsuario(rawDatos, userCfg) {
    const base = this.crearDatosIniciales(userCfg);
    if (!rawDatos || typeof rawDatos !== 'object') return base;
    return {
      habitos: Array.isArray(rawDatos.habitos) && rawDatos.habitos.length > 0
        ? rawDatos.habitos
        : base.habitos,
      frases: (rawDatos.frases && !Array.isArray(rawDatos.frases) && typeof rawDatos.frases === 'object')
        ? rawDatos.frases
        : {},
      marcas: (rawDatos.marcas && !Array.isArray(rawDatos.marcas) && typeof rawDatos.marcas === 'object')
        ? rawDatos.marcas
        : {},
      celebrados: (rawDatos.celebrados && !Array.isArray(rawDatos.celebrados) && typeof rawDatos.celebrados === 'object')
        ? rawDatos.celebrados
        : {},
      diasCompletadosNotificados: (rawDatos.diasCompletadosNotificados && !Array.isArray(rawDatos.diasCompletadosNotificados) && typeof rawDatos.diasCompletadosNotificados === 'object')
        ? rawDatos.diasCompletadosNotificados
        : {}
    };
  }

  fusionarDatosUsuario(local, remoto, userCfg) {
    const l = this.normalizarDatosUsuario(local, userCfg);
    const r = this.normalizarDatosUsuario(remoto, userCfg);
    const marcasFusionadas = { ...l.marcas };

    Object.keys(r.marcas).forEach(mesKey => {
      const mRemoto = (r.marcas[mesKey] && !Array.isArray(r.marcas[mesKey]) && typeof r.marcas[mesKey] === 'object') ? r.marcas[mesKey] : {};
      const mLocal = (marcasFusionadas[mesKey] && !Array.isArray(marcasFusionadas[mesKey]) && typeof marcasFusionadas[mesKey] === 'object') ? marcasFusionadas[mesKey] : {};
      marcasFusionadas[mesKey] = { ...mLocal, ...mRemoto };
    });

    return {
      habitos: Array.isArray(remoto?.habitos) && remoto.habitos.length > 0 ? remoto.habitos : l.habitos,
      frases: { ...l.frases, ...r.frases },
      marcas: marcasFusionadas,
      celebrados: { ...l.celebrados, ...r.celebrados },
      diasCompletadosNotificados: { ...l.diasCompletadosNotificados, ...r.diasCompletadosNotificados }
    };
  }

  cargarDatosLocales() {
    Object.keys(APP_CONFIG.USERS).forEach(uid => {
      const uCfg = APP_CONFIG.USERS[uid];
      const raw = localStorage.getItem(this.getStorageKey(uid));
      if (raw) {
        try {
          this.todosUsuariosDatos[uid] = this.normalizarDatosUsuario(JSON.parse(raw), uCfg);
        } catch (e) {
          this.todosUsuariosDatos[uid] = this.crearDatosIniciales(uCfg);
        }
      } else {
        this.todosUsuariosDatos[uid] = this.crearDatosIniciales(uCfg);
      }
    });

    this.datos = this.todosUsuariosDatos[this.usuarioActivo];
    localStorage.setItem(this.getStorageKey(this.usuarioActivo), JSON.stringify(this.datos));

    const rawNotifs = localStorage.getItem('registro_atomico_notificaciones');
    this.notificaciones = rawNotifs ? JSON.parse(rawNotifs) : [];
  }

  crearDatosIniciales(user) {
    return {
      habitos: JSON.parse(JSON.stringify(user.habitosDefault)),
      frases: { _init: '' },
      marcas: { _init: { _init: 0 } },
      celebrados: { _init: false },
      diasCompletadosNotificados: { _init: false }
    };
  }

  async sincronizarDesdeServidor(esPolling = false) {
    if (!this.usuarioActivo) return;
    if (!location.protocol.startsWith('http')) {
      this.actualizarIndicadorSync(false);
      return;
    }

    try {
      const resp = await fetch('api.php?action=load', { cache: 'no-store' });
      if (!resp.ok) throw new Error('Sin API');
      const store = await resp.json();
      this.servidorDisponible = true;
      this.actualizarIndicadorSync(true);

      if (store.pins) {
        this.pinsRemotos = { ...this.pinsRemotos, ...store.pins };
        Object.entries(store.pins).forEach(([u, p]) => {
          if (p) localStorage.setItem(`pin_${u}`, p);
        });
      }

      if (store.usuarios) {
        let huboFusionLocal = false;
        Object.keys(APP_CONFIG.USERS).forEach(uid => {
          const uCfg = APP_CONFIG.USERS[uid];
          if (store.usuarios[uid]) {
            const localExistente = this.todosUsuariosDatos[uid];
            const normalizadoRemoto = this.normalizarDatosUsuario(store.usuarios[uid], uCfg);

            if (uid === this.usuarioActivo && localExistente) {
              // Si el servidor tenía marcas vacías (p. ej. array [] por bug previo) pero en local había marcas, las fusionamos sin perder nada
              const fusionado = this.fusionarDatosUsuario(localExistente, normalizadoRemoto, uCfg);
              const cantRemota = Object.values(normalizadoRemoto.marcas || {}).reduce((acc, m) => acc + Object.keys(m || {}).length, 0);
              const cantFusion = Object.values(fusionado.marcas || {}).reduce((acc, m) => acc + Object.keys(m || {}).length, 0);
              if (cantFusion > cantRemota) {
                huboFusionLocal = true;
              }
              this.todosUsuariosDatos[uid] = fusionado;
            } else {
              this.todosUsuariosDatos[uid] = normalizadoRemoto;
            }
            localStorage.setItem(this.getStorageKey(uid), JSON.stringify(this.todosUsuariosDatos[uid]));
          }
        });

        if (store.usuarios[this.usuarioActivo]) {
          this.datos = this.todosUsuariosDatos[this.usuarioActivo];
          if (huboFusionLocal) {
            await this.guardarDatos();
          }
          if (esPolling) {
            this.renderizarCuadricula();
            this.actualizarEstadisticasRapidas();
            this.evaluarReglaInquebrantable();
            this.evaluarAlarma2DiasSinRellenar();
          }
        } else if (this.datos) {
          await this.guardarDatos();
        }
      }

      if (Array.isArray(store.notificaciones)) {
        this.procesarNuevasNotificaciones(store.notificaciones, esPolling);
        this.notificaciones = store.notificaciones;
        localStorage.setItem('registro_atomico_notificaciones', JSON.stringify(this.notificaciones));
      }

      this.actualizarEstadoCompaneroUI();
      this.actualizarBannerNotificacionCompanero();
    } catch (e) {
      this.servidorDisponible = false;
      this.actualizarIndicadorSync(false);
    }
  }

  actualizarIndicadorSync(online) {
    const label = document.getElementById('sync-status-label');
    if (!label) return;
    if (online) {
      label.textContent = '🟢 Sincronizado en vivo (Elias, Mónica & Mauro)';
    } else {
      label.textContent = '💾 Modo Local';
    }
  }

  async guardarDatos() {
    if (!this.usuarioActivo || !this.datos) return;
    this.todosUsuariosDatos[this.usuarioActivo] = this.datos;
    localStorage.setItem(this.getStorageKey(this.usuarioActivo), JSON.stringify(this.datos));

    if (location.protocol.startsWith('http')) {
      try {
        await fetch('api.php?action=save_user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: this.usuarioActivo,
            datos: this.datos
          })
        });
      } catch (e) {}
    }
  }

  getMesKey() {
    const m = String(this.mesSeleccionado + 1).padStart(2, '0');
    return `${this.anoSeleccionado}-${m}`;
  }

  getMesKeyActual() {
    const m = String(this.fechaActual.getMonth() + 1).padStart(2, '0');
    return `${this.fechaActual.getFullYear()}-${m}`;
  }

  getFechaHoyISO() {
    const m = String(this.fechaActual.getMonth() + 1).padStart(2, '0');
    const d = String(this.fechaActual.getDate()).padStart(2, '0');
    return `${this.fechaActual.getFullYear()}-${m}-${d}`;
  }

  // ========================================================
  // RENDERIZADO PRINCIPAL
  // ========================================================
  renderizarTodo() {
    this.renderizarCabeceraMes();
    this.renderizarFraseInspiracion();
    this.renderizarCuadricula();
    this.actualizarEstadisticasRapidas();
    this.evaluarReglaInquebrantable();
    this.evaluarAlarma2DiasSinRellenar();
    this.actualizarEstadoCompaneroUI();
    this.actualizarBannerNotificacionCompanero();
  }

  cambiarMes(delta) {
    this.mesSeleccionado += delta;
    if (this.mesSeleccionado < 0) {
      this.mesSeleccionado = 11;
      this.anoSeleccionado--;
    } else if (this.mesSeleccionado > 11) {
      this.mesSeleccionado = 0;
      this.anoSeleccionado++;
    }
    this.renderizarTodo();
  }

  renderizarCabeceraMes() {
    const texto = `${this.mesesNombres[this.mesSeleccionado]} ${this.anoSeleccionado}`;
    document.getElementById('current-month-display').textContent = texto;
  }

  // ========================================================
  // FRASE DE INSPIRACIÓN DEL MES
  // ========================================================
  renderizarFraseInspiracion() {
    const mesKey = this.getMesKey();
    const fraseGuardada = this.datos.frases[mesKey];
    const user = APP_CONFIG.USERS[this.usuarioActivo];
    const frase = fraseGuardada || user.fraseDefault;

    document.getElementById('inspiration-quote-display').textContent = frase;
    document.getElementById('inspiration-quote-input').value = frase;
    document.getElementById('inspiration-quote-display').classList.remove('hidden');
    document.getElementById('inspiration-quote-input').classList.add('hidden');
  }

  toggleEditarFrase() {
    const display = document.getElementById('inspiration-quote-display');
    const input = document.getElementById('inspiration-quote-input');

    if (input.classList.contains('hidden')) {
      display.classList.add('hidden');
      input.classList.remove('hidden');
      input.focus();
      input.select();
      input.onblur = () => this.guardarFraseMes();
      input.onkeyup = (e) => {
        if (e.key === 'Enter') this.guardarFraseMes();
      };
    } else {
      this.guardarFraseMes();
    }
  }

  editarFraseMes() {
    this.toggleEditarFrase();
  }

  guardarFraseMes() {
    const input = document.getElementById('inspiration-quote-input');
    const valor = input.value.trim();
    const mesKey = this.getMesKey();
    if (!this.datos.frases || Array.isArray(this.datos.frases) || typeof this.datos.frases !== 'object') {
      this.datos.frases = {};
    }
    if (valor) {
      this.datos.frases[mesKey] = valor;
      this.guardarDatos();
    }
    this.renderizarFraseInspiracion();
  }

  // ========================================================
  // DETECCIÓN Y ALARMA: 2 DÍAS SEGUIDOS SIN RELLENAR
  // ========================================================
  detectarHabitosSinRellenar2Dias() {
    const mesKey = this.getMesKey();
    const marcasMes = this.datos.marcas[mesKey] || {};
    const habitos = this.datos.habitos.slice(0, 6);
    const esMesActual = (this.fechaActual.getMonth() === this.mesSeleccionado &&
                         this.fechaActual.getFullYear() === this.anoSeleccionado);
    const diaLimite = esMesActual
      ? this.fechaActual.getDate()
      : this.obtenerDiasEnMes(this.mesSeleccionado, this.anoSeleccionado);

    if (diaLimite < 2) return [];

    const habitosEnAlarma = [];

    habitos.forEach(habito => {
      const estadoHoy = marcasMes[`${habito.id}_${diaLimite}`] || APP_CONFIG.ESTADOS.VACIO;
      const estadoAyer = marcasMes[`${habito.id}_${diaLimite - 1}`] || APP_CONFIG.ESTADOS.VACIO;
      const estadoAnteayer = diaLimite >= 3 ? (marcasMes[`${habito.id}_${diaLimite - 2}`] || APP_CONFIG.ESTADOS.VACIO) : -1;

      let diasSinRellenar = 0;
      const diasVaciosIndices = [];
      for (let d = diaLimite; d >= 1; d--) {
        const st = marcasMes[`${habito.id}_${d}`] || APP_CONFIG.ESTADOS.VACIO;
        if (st === APP_CONFIG.ESTADOS.VACIO) {
          diasSinRellenar++;
          diasVaciosIndices.push(d);
        } else {
          break;
        }
      }

      if (diasSinRellenar < 2 && diaLimite >= 3 && estadoAyer === APP_CONFIG.ESTADOS.VACIO && estadoAnteayer === APP_CONFIG.ESTADOS.VACIO) {
        diasSinRellenar = 2;
        diasVaciosIndices.push(diaLimite - 1, diaLimite - 2);
      }

      if (diasSinRellenar >= 2 || (estadoHoy === APP_CONFIG.ESTADOS.VACIO && estadoAyer === APP_CONFIG.ESTADOS.VACIO)) {
        habitosEnAlarma.push({
          id: habito.id,
          nombre: habito.nombre,
          diasSinRellenar: Math.max(diasSinRellenar, 2),
          diasIndices: diasVaciosIndices.slice(0, 2)
        });
      }
    });

    return habitosEnAlarma;
  }

  evaluarAlarma2DiasSinRellenar() {
    const banner = document.getElementById('alarm-unfilled-banner');
    const title = document.getElementById('alarm-unfilled-title');
    const desc = document.getElementById('alarm-unfilled-desc');

    const enAlarma = this.detectarHabitosSinRellenar2Dias();
    const hoyISO = this.getFechaHoyISO();
    const silenciadaHoy = sessionStorage.getItem(`alarma_silenciada_${this.usuarioActivo}_${hoyISO}`);

    if (enAlarma.length > 0 && !silenciadaHoy) {
      banner.classList.remove('hidden');
      const nombres = enAlarma.map(h => `«${h.nombre}»`).join(', ');
      title.textContent = `⏰ ¡ALARMA: Llevas 2 días o más sin rellenar (${enAlarma.length} ${enAlarma.length === 1 ? 'hábito' : 'hábitos'})!`;
      desc.textContent = `Falta rellenar: ${nombres}. ¡No dejes la planilla en blanco! Marca cada día en 🟩 Verde o 🟥 Rojo.`;

      if (!this.alarmaSonadaSesion) {
        this.alarmaSonadaSesion = true;
        this.reproducirSonido('alarma');
        this.lanzarNotificacionDispositivo(
          '⏰ ¡Alarma: 2 días sin rellenar!',
          `Tienes casillas sin rellenar en: ${enAlarma.map(h => h.nombre).join(', ')}`
        );
      }
    } else {
      banner.classList.add('hidden');
    }
  }

  silenciarAlarmaHoy() {
    const hoyISO = this.getFechaHoyISO();
    sessionStorage.setItem(`alarma_silenciada_${this.usuarioActivo}_${hoyISO}`, '1');
    document.getElementById('alarm-unfilled-banner').classList.add('hidden');
  }

  // ========================================================
  // CUADRÍCULA DE HÁBITOS (EJE X: DÍAS | EJE Y: 6 HÁBITOS)
  // ========================================================
  obtenerDiasEnMes(mes, ano) {
    return new Date(ano, mes + 1, 0).getDate();
  }

  renderizarCuadricula() {
    const diasTotal = this.obtenerDiasEnMes(this.mesSeleccionado, this.anoSeleccionado);
    const headerRow = document.getElementById('grid-header-row');
    const gridBody = document.getElementById('grid-body');
    const mesKey = this.getMesKey();
    const marcasMes = this.datos.marcas[mesKey] || {};

    const enAlarmaList = this.detectarHabitosSinRellenar2Dias();
    const mapaAlarma = {};
    enAlarmaList.forEach(item => {
      mapaAlarma[item.id] = item;
    });

    while (headerRow.children.length > 1) {
      headerRow.removeChild(headerRow.lastChild);
    }

    const esMesActual = (this.fechaActual.getMonth() === this.mesSeleccionado &&
                         this.fechaActual.getFullYear() === this.anoSeleccionado);
    const diaActual = this.fechaActual.getDate();

    for (let d = 1; d <= diasTotal; d++) {
      const th = document.createElement('th');
      th.className = 'col-day-header';
      th.textContent = d;
      if (esMesActual && d === diaActual) {
        th.classList.add('today');
        th.title = 'Hoy';
      }
      headerRow.appendChild(th);
    }

    gridBody.innerHTML = '';
    const habitos = this.datos.habitos.slice(0, 6);

    habitos.forEach((habito, index) => {
      const tr = document.createElement('tr');
      tr.className = 'habit-row';
      const infoAlarma = mapaAlarma[habito.id];

      const tdNombre = document.createElement('td');
      tdNombre.className = 'habit-name-cell';
      tdNombre.innerHTML = `
        <div class="habit-cell-wrap">
          <div class="habit-title-line">
            <span class="habit-index">${index + 1}</span>
            <span class="habit-title-text">${this.escapeHtml(habito.nombre)}</span>
            ${infoAlarma ? `<span class="unfilled-alarm-badge" title="Llevas 2 o más días sin rellenar este hábito">⏰ 2d vacío</span>` : ''}
            ${habito.hora ? `<span class="habit-time-badge">${this.escapeHtml(habito.hora)}</span>` : ''}
          </div>
          <div class="habit-threshold-text">
            <strong>⚡ Umbral (&lt; 2 min):</strong> 
            <span>${this.escapeHtml(habito.umbral || 'Hacer la versión mínima')}</span>
          </div>
        </div>
      `;
      tr.appendChild(tdNombre);

      for (let d = 1; d <= diasTotal; d++) {
        const tdDia = document.createElement('td');
        tdDia.className = 'day-cell';
        if (esMesActual && d === diaActual) {
          tdDia.classList.add('today-col');
        }

        const cellKey = `${habito.id}_${d}`;
        const estado = marcasMes[cellKey] || APP_CONFIG.ESTADOS.VACIO;

        const ayerKey = `${habito.id}_${d - 1}`;
        const estadoAyer = marcasMes[ayerKey] || APP_CONFIG.ESTADOS.VACIO;
        const debeGanarHoy = (d === diaActual && esMesActual && estadoAyer === APP_CONFIG.ESTADOS.ROJO && estado === APP_CONFIG.ESTADOS.VACIO);
        const esCasillaAlarmaVacia = (infoAlarma && infoAlarma.diasIndices.includes(d) && estado === APP_CONFIG.ESTADOS.VACIO);

        const block = document.createElement('div');
        block.className = 'cell-block';

        if (estado === APP_CONFIG.ESTADOS.VERDE) {
          block.classList.add('state-green');
          block.textContent = '✓';
        } else if (estado === APP_CONFIG.ESTADOS.ROJO) {
          block.classList.add('state-red');
          block.textContent = '✕';
        } else if (debeGanarHoy) {
          block.classList.add('state-must-win');
          block.textContent = '!';
          block.title = '¡Ayer saltado! Hoy tu misión es cuadro verde.';
        } else if (esCasillaAlarmaVacia) {
          block.classList.add('state-unfilled-alarm');
          block.textContent = '⏰';
          block.title = 'Casilla sin rellenar (2 días seguidos vacío)';
        }

        tdDia.appendChild(block);
        tdDia.onclick = () => this.alternarEstadoCasilla(habito.id, d);
        tr.appendChild(tdDia);
      }

      gridBody.appendChild(tr);
    });
  }

  // ========================================================
  // ALTERNAR ESTADO Y COMPROBAR SI YA LO HIZO TODO HOY (6/6)
  // ========================================================
  async alternarEstadoCasilla(habitoId, dia) {
    const mesKey = this.getMesKey();
    if (!this.datos.marcas || Array.isArray(this.datos.marcas) || typeof this.datos.marcas !== 'object') {
      this.datos.marcas = {};
    }
    if (!this.datos.marcas[mesKey] || Array.isArray(this.datos.marcas[mesKey]) || typeof this.datos.marcas[mesKey] !== 'object') {
      this.datos.marcas[mesKey] = { _init: 0 };
    }
    this.datos.marcas[mesKey]._init = 0;

    const cellKey = `${habitoId}_${dia}`;
    const estadoActual = this.datos.marcas[mesKey][cellKey] || APP_CONFIG.ESTADOS.VACIO;

    let nuevoEstado;
    if (estadoActual === APP_CONFIG.ESTADOS.VACIO) {
      nuevoEstado = APP_CONFIG.ESTADOS.VERDE;
    } else if (estadoActual === APP_CONFIG.ESTADOS.VERDE) {
      nuevoEstado = APP_CONFIG.ESTADOS.ROJO;
    } else {
      nuevoEstado = APP_CONFIG.ESTADOS.VACIO;
    }

    if (nuevoEstado === APP_CONFIG.ESTADOS.VACIO) {
      delete this.datos.marcas[mesKey][cellKey];
    } else {
      this.datos.marcas[mesKey][cellKey] = nuevoEstado;
    }

    sessionStorage.removeItem(`alarma_silenciada_${this.usuarioActivo}_${this.getFechaHoyISO()}`);

    // Actualizar interfaz de inmediato antes de esperar la red
    this.renderizarCuadricula();
    this.actualizarEstadisticasRapidas();
    this.evaluarReglaInquebrantable();
    this.evaluarAlarma2DiasSinRellenar();
    this.comprobarConsolidacionHabito(habitoId);

    await this.guardarDatos();
    await this.comprobarSiCompletoTodoElDia(dia, mesKey);
  }

  calcularProgresoDia(datosUsuario, dia, mesKey) {
    if (!datosUsuario || !datosUsuario.marcas) return { verdes: 0, rojos: 0, marcados: 0, total: 6 };
    const marcasMes = datosUsuario.marcas[mesKey] || {};
    const habitos = (datosUsuario.habitos || []).slice(0, 6);
    let verdes = 0;
    let rojos = 0;

    habitos.forEach(h => {
      const st = marcasMes[`${h.id}_${dia}`] || APP_CONFIG.ESTADOS.VACIO;
      if (st === APP_CONFIG.ESTADOS.VERDE) verdes++;
      if (st === APP_CONFIG.ESTADOS.ROJO) rojos++;
    });

    return {
      verdes,
      rojos,
      marcados: verdes + rojos,
      total: habitos.length || 6
    };
  }

  async comprobarSiCompletoTodoElDia(dia, mesKey) {
    const progreso = this.calcularProgresoDia(this.datos, dia, mesKey);
    if (!this.datos.diasCompletadosNotificados || Array.isArray(this.datos.diasCompletadosNotificados) || typeof this.datos.diasCompletadosNotificados !== 'object') {
      this.datos.diasCompletadosNotificados = {};
    }

    const diaClave = `${mesKey}-${String(dia).padStart(2, '0')}`;

    if (progreso.marcados >= 6 && !this.datos.diasCompletadosNotificados[diaClave]) {
      this.datos.diasCompletadosNotificados[diaClave] = true;
      await this.guardarDatos();

      const user = APP_CONFIG.USERS[this.usuarioActivo];
      const nombresOtros = this.obtenerNombresOtrosUsuarios();
      const detalle = progreso.verdes === 6
        ? '¡Pleno de 6/6 cuadros VERDES!'
        : `(${progreso.verdes} verdes y ${progreso.rojos} registrados)`;

      const mensaje = `🎉 ¡${user.nombre} ya ha completado TODOS sus 6 hábitos del día ${dia}! ${detalle}`;
      await this.enviarNotificacionAlCompanero(mensaje, 'completado', diaClave);

      this.reproducirSonido('victoria');
      document.getElementById('day-completed-subtitle').textContent =
        `Se ha enviado una notificación automática a ${nombresOtros} (${detalle})`;
      this.abrirModal('modal-day-completed');
    } else if (progreso.marcados < 6 && this.datos.diasCompletadosNotificados[diaClave]) {
      delete this.datos.diasCompletadosNotificados[diaClave];
      await this.guardarDatos();
    }
  }

  // ========================================================
  // NOTIFICACIONES ENTRE ELIAS, MÓNICA Y MAURO
  // ========================================================
  async enviarNotificacionAlCompanero(mensaje, tipo = 'completado', fechaClave = '') {
    const user = APP_CONFIG.USERS[this.usuarioActivo];
    const nueva = {
      id: `notif_${Date.now()}`,
      de: user.id,
      para: 'todos',
      mensaje,
      tipo,
      fechaClave: fechaClave || this.getFechaHoyISO(),
      hora: new Date().toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }),
      timestamp: Math.floor(Date.now() / 1000),
      leidaPor: [user.id]
    };

    this.notificaciones.unshift(nueva);
    this.notificaciones = this.notificaciones.slice(0, 40);
    localStorage.setItem('registro_atomico_notificaciones', JSON.stringify(this.notificaciones));

    if (location.protocol.startsWith('http')) {
      try {
        await fetch('api.php?action=notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nueva)
        });
      } catch (e) {}
    }

    this.renderizarFeedNotificaciones();
  }

  async enviarNotificacionCompaneroManual() {
    const user = APP_CONFIG.USERS[this.usuarioActivo];
    const nombresOtros = this.obtenerNombresOtrosUsuarios();
    const progresoHoy = this.calcularProgresoDia(this.datos, this.fechaActual.getDate(), this.getMesKeyActual());
    const msg = progresoHoy.marcados >= 6
      ? `🔥 ¡${user.nombre} ya ha terminado TODOS sus 6 hábitos de hoy (${progresoHoy.verdes}/6 verdes)!`
      : `⚡ ${user.nombre} acaba de actualizar su planilla hoy (${progresoHoy.marcados}/6 hábitos marcados).`;

    await this.enviarNotificacionAlCompanero(msg, 'manual');
    this.reproducirSonido('victoria');
    alert(`✅ Notificación enviada a ${nombresOtros}.`);
  }

  compartirVictoriaWhatsApp() {
    const user = APP_CONFIG.USERS[this.usuarioActivo];
    const progresoHoy = this.calcularProgresoDia(this.datos, this.fechaActual.getDate(), this.getMesKeyActual());
    const texto = encodeURIComponent(
      `🔥 ¡Equipo! Soy ${user.nombre} y ya he completado todos mis hábitos de hoy en el Registro Atómico (${progresoHoy.verdes}/6 cuadros verdes 🟩). ¡Os toca!`
    );
    window.open(`https://wa.me/?text=${texto}`, '_blank');
  }

  procesarNuevasNotificaciones(listaServidor, dispararAlerta) {
    if (!this.usuarioActivo) return;
    listaServidor.forEach(n => {
      const leida = Array.isArray(n.leidaPor) && n.leidaPor.includes(this.usuarioActivo);
      if (n.de !== this.usuarioActivo && !leida && !this.ultimasNotifsVistas.has(n.id)) {
        this.ultimasNotifsVistas.add(n.id);
        if (dispararAlerta) {
          this.reproducirSonido('victoria');
          this.lanzarNotificacionDispositivo('🎉 ¡Aviso de Hábitos Atómicos!', n.mensaje);
        }
      }
    });
  }

  actualizarEstadoCompaneroUI() {
    if (!this.usuarioActivo) return;
    const pill = document.getElementById('partner-status-pill');
    const dot = document.getElementById('partner-dot');
    const text = document.getElementById('partner-status-text');

    const otrosIds = this.obtenerOtrosUsuariosIds();
    const diaHoy = this.fechaActual.getDate();
    const mesActualKey = this.getMesKeyActual();

    let algunoCompleto = false;
    const resumenes = otrosIds.map(uid => {
      const uCfg = APP_CONFIG.USERS[uid];
      const prog = this.calcularProgresoDia(this.todosUsuariosDatos[uid], diaHoy, mesActualKey);
      if (prog.marcados >= 6) {
        algunoCompleto = true;
        return `🎉 ${uCfg.nombre}: 6/6`;
      }
      return `${uCfg.nombre}: ${prog.marcados}/6`;
    });

    if (algunoCompleto) {
      pill.className = 'partner-pill completed-all';
      dot.className = 'partner-dot done';
    } else {
      pill.className = 'partner-pill';
      dot.className = 'partner-dot';
    }
    text.textContent = resumenes.join(' · ');
  }

  actualizarBannerNotificacionCompanero() {
    if (!this.usuarioActivo) return;
    const banner = document.getElementById('partner-live-banner');
    const msgEl = document.getElementById('partner-notif-message');
    const badgeCount = document.getElementById('notif-badge-count');

    const noLeidas = (this.notificaciones || []).filter(n =>
      n.de !== this.usuarioActivo &&
      (!Array.isArray(n.leidaPor) || !n.leidaPor.includes(this.usuarioActivo))
    );

    if (noLeidas.length > 0) {
      banner.classList.remove('hidden');
      msgEl.textContent = noLeidas[0].mensaje;
      badgeCount.textContent = noLeidas.length;
      badgeCount.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
      badgeCount.classList.add('hidden');
    }
  }

  async marcarNotificacionesLeidas() {
    if (!this.usuarioActivo) return;
    this.notificaciones.forEach(n => {
      if (!Array.isArray(n.leidaPor)) n.leidaPor = [];
      if (!n.leidaPor.includes(this.usuarioActivo)) {
        n.leidaPor.push(this.usuarioActivo);
      }
    });
    localStorage.setItem('registro_atomico_notificaciones', JSON.stringify(this.notificaciones));
    this.actualizarBannerNotificacionCompanero();
    this.renderizarFeedNotificaciones();

    if (location.protocol.startsWith('http')) {
      try {
        await fetch('api.php?action=mark_read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: this.usuarioActivo })
        });
      } catch (e) {}
    }
  }

  abrirCentroNotificaciones() {
    this.actualizarEstadoPermisoUI();
    this.renderizarFeedNotificaciones();
    this.abrirModal('modal-notifications');
  }

  renderizarFeedNotificaciones() {
    const container = document.getElementById('notifications-feed-list');
    if (!container) return;

    if (!this.notificaciones || this.notificaciones.length === 0) {
      container.innerHTML = `<p class="text-muted">Aún no hay notificaciones registradas. Cuando Elias, Mónica o Mauro completen sus 6 hábitos del día, aparecerán aquí.</p>`;
      return;
    }

    container.innerHTML = '';
    this.notificaciones.forEach(n => {
      const noLeida = n.de !== this.usuarioActivo && (!Array.isArray(n.leidaPor) || !n.leidaPor.includes(this.usuarioActivo));
      const item = document.createElement('div');
      item.className = `notif-feed-item ${noLeida ? 'unread' : ''}`;
      item.innerHTML = `
        <div class="notif-feed-text">
          <strong>${this.escapeHtml(n.mensaje)}</strong>
          <span>🕒 ${this.escapeHtml(n.hora || '')}</span>
        </div>
      `;
      container.appendChild(item);
    });
  }

  abrirGuiaMovil() {
    this.abrirModal('modal-mobile');
  }

  // ========================================================
  // ESTADÍSTICAS RÁPIDAS
  // ========================================================
  actualizarEstadisticasRapidas() {
    const mesKey = this.getMesKey();
    const marcasMes = this.datos.marcas[mesKey] || {};

    let totalVerdes = 0;
    let totalRojos = 0;

    Object.values(marcasMes).forEach(estado => {
      if (estado === APP_CONFIG.ESTADOS.VERDE) totalVerdes++;
      if (estado === APP_CONFIG.ESTADOS.ROJO) totalRojos++;
    });

    const totalMarcados = totalVerdes + totalRojos;
    const porcentaje = totalMarcados > 0 ? Math.round((totalVerdes / totalMarcados) * 100) : 0;

    const progHoy = this.calcularProgresoDia(this.datos, this.fechaActual.getDate(), this.getMesKeyActual());
    const elHoy = document.getElementById('stat-today-progress');
    if (elHoy) elHoy.textContent = `Hoy: ${progHoy.marcados}/6`;

    document.getElementById('stat-total-greens').textContent = `${totalVerdes} verdes`;
    document.getElementById('stat-total-reds').textContent = `${totalRojos} rojos`;
    document.getElementById('stat-success-rate').textContent = `${porcentaje}% éxito`;
  }

  // ========================================================
  // EVALUACIÓN DE LA REGLA INQUEBRANTABLE (NUNCA DOS VECES)
  // ========================================================
  evaluarReglaInquebrantable() {
    const banner = document.getElementById('alert-banner');
    const statusText = document.getElementById('rule-status-text');
    const mesKey = this.getMesKey();
    const marcasMes = this.datos.marcas[mesKey] || {};
    const habitos = this.datos.habitos.slice(0, 6);
    const diaActual = this.fechaActual.getDate();

    let habitosEnRiesgo = [];
    let habitosConFalloDoble = [];

    habitos.forEach(habito => {
      const cellKeyHoy = `${habito.id}_${diaActual}`;
      const cellKeyAyer = `${habito.id}_${diaActual - 1}`;
      const estadoHoy = marcasMes[cellKeyHoy] || APP_CONFIG.ESTADOS.VACIO;
      const estadoAyer = marcasMes[cellKeyAyer] || APP_CONFIG.ESTADOS.VACIO;

      if (estadoAyer === APP_CONFIG.ESTADOS.ROJO && estadoHoy === APP_CONFIG.ESTADOS.VACIO) {
        habitosEnRiesgo.push(habito.nombre);
      }
      if (estadoAyer === APP_CONFIG.ESTADOS.ROJO && estadoHoy === APP_CONFIG.ESTADOS.ROJO) {
        habitosConFalloDoble.push(habito.nombre);
      }
    });

    if (habitosEnRiesgo.length > 0) {
      banner.className = 'golden-rule-banner warning';
      statusText.innerHTML = `⚠️ <strong>ALERTA TÁCTICA:</strong> Ayer saltaste <em>${habitosEnRiesgo[0]}</em>. Tu única misión hoy es que ese cuadro sea 🟩 VERDE. ¡Aplica la regla de los 2 minutos!`;
    } else if (habitosConFalloDoble.length > 0) {
      banner.className = 'golden-rule-banner warning';
      statusText.innerHTML = `🚨 <strong>PELIGRO DE ESPIRAL:</strong> Se registraron dos fallos seguidos en <em>${habitosConFalloDoble[0]}</em>. Recuerda: dos fallos es el inicio de un mal hábito. ¡Recupera el control!`;
    } else {
      banner.className = 'golden-rule-banner';
      statusText.textContent = 'Un día saltado es un accidente. Dos seguidos es el inicio de un mal hábito. ¡A por los cuadros verdes!';
    }
  }

  // ========================================================
  // SISTEMA DE GRADUACIÓN / CONSOLIDACIÓN (21 DÍAS VERDES)
  // ========================================================
  comprobarConsolidacionHabito(habitoId) {
    const mesKey = this.getMesKey();
    const marcasMes = this.datos.marcas[mesKey] || {};
    const diasTotal = this.obtenerDiasEnMes(this.mesSeleccionado, this.anoSeleccionado);

    let verdes = 0;
    for (let d = 1; d <= diasTotal; d++) {
      if (marcasMes[`${habitoId}_${d}`] === APP_CONFIG.ESTADOS.VERDE) {
        verdes++;
      }
    }

    const celebracionKey = `${habitoId}_${mesKey}`;
    if (!this.datos.celebrados || Array.isArray(this.datos.celebrados) || typeof this.datos.celebrados !== 'object') {
      this.datos.celebrados = {};
    }
    if (verdes >= APP_CONFIG.META_CONSOLIDACION && !this.datos.celebrados[celebracionKey]) {
      this.datos.celebrados[celebracionKey] = true;
      this.guardarDatos();

      const habito = this.datos.habitos.find(h => h.id === habitoId);
      if (habito) {
        this.reproducirSonido('victoria');
        document.getElementById('celebration-habit-name').textContent = habito.nombre;
        this.abrirModal('modal-celebration');
      }
    }
  }

  // ========================================================
  // CONFIGURACIÓN DE LOS 6 HÁBITOS (MODAL)
  // ========================================================
  abrirConfigHabitos() {
    const container = document.getElementById('habits-config-list');
    container.innerHTML = '';
    const habitos = this.datos.habitos.slice(0, 6);

    habitos.forEach((h, idx) => {
      const item = document.createElement('div');
      item.className = 'habit-config-item';
      item.innerHTML = `
        <div class="habit-config-header">
          <strong>HÁBITO ${idx + 1}</strong>
        </div>
        <div class="habit-input-group">
          <label>Nombre del Hábito:</label>
          <input type="text" id="cfg-name-${idx}" value="${this.escapeHtml(h.nombre)}" placeholder="Ej. Hacer ejercicio">
        </div>
        <div class="habit-input-group">
          <label>⚡ Hábito Umbral (&lt; 2 min):</label>
          <input type="text" id="cfg-threshold-${idx}" value="${this.escapeHtml(h.umbral)}" placeholder="Ej. Ponerme la ropa y tenis">
        </div>
        <div class="habit-input-group">
          <label>Disparador / Hora (Opcional):</label>
          <input type="text" id="cfg-time-${idx}" value="${this.escapeHtml(h.hora || '')}" placeholder="Ej. 09:00 AM">
        </div>
      `;
      container.appendChild(item);
    });

    this.abrirModal('modal-habits');
  }

  async guardarConfigHabitos() {
    for (let i = 0; i < 6; i++) {
      const name = document.getElementById(`cfg-name-${i}`).value.trim();
      const threshold = document.getElementById(`cfg-threshold-${i}`).value.trim();
      const time = document.getElementById(`cfg-time-${i}`).value.trim();

      if (name) {
        this.datos.habitos[i] = {
          id: this.datos.habitos[i]?.id || (i + 1),
          nombre: name,
          umbral: threshold || 'Hacer versión de 2 minutos',
          hora: time
        };
      }
    }

    await this.guardarDatos();
    this.cerrarModal('modal-habits');
    this.renderizarTodo();
  }

  restablecerHabitosPredeterminados() {
    if (!confirm('¿Deseas restablecer los 6 hábitos a los valores predeterminados de tu perfil?')) return;
    const user = APP_CONFIG.USERS[this.usuarioActivo];
    this.datos.habitos = JSON.parse(JSON.stringify(user.habitosDefault));
    this.guardarDatos();
    this.abrirConfigHabitos();
  }

  // ========================================================
  // ANÁLISIS MENSUAL Y GRÁFICOS
  // ========================================================
  abrirAnalisis() {
    const mesKey = this.getMesKey();
    const marcasMes = this.datos.marcas[mesKey] || {};
    const habitos = this.datos.habitos.slice(0, 6);
    const diasTotal = this.obtenerDiasEnMes(this.mesSeleccionado, this.anoSeleccionado);

    document.getElementById('analytics-title').textContent =
      `Análisis de Hábitos - ${this.mesesNombres[this.mesSeleccionado]} ${this.anoSeleccionado} (${APP_CONFIG.USERS[this.usuarioActivo].nombre})`;

    let totalVerdes = 0;
    let totalRojos = 0;
    let mejorHabito = '-';
    let maxVerdesHabito = -1;

    const statsHabitos = habitos.map(h => {
      let v = 0;
      let r = 0;
      for (let d = 1; d <= diasTotal; d++) {
        const s = marcasMes[`${h.id}_${d}`];
        if (s === APP_CONFIG.ESTADOS.VERDE) v++;
        if (s === APP_CONFIG.ESTADOS.ROJO) r++;
      }
      totalVerdes += v;
      totalRojos += r;

      if (v > maxVerdesHabito) {
        maxVerdesHabito = v;
        mejorHabito = h.nombre;
      }

      const total = v + r;
      const rate = total > 0 ? Math.round((v / total) * 100) : 0;
      return { id: h.id, nombre: h.nombre, verdes: v, rojos: r, rate };
    });

    const totalRegistros = totalVerdes + totalRojos;
    const globalRate = totalRegistros > 0 ? Math.round((totalVerdes / totalRegistros) * 100) : 0;

    document.getElementById('kpi-greens').textContent = totalVerdes;
    document.getElementById('kpi-reds').textContent = totalRojos;
    document.getElementById('kpi-rate').textContent = `${globalRate}%`;
    document.getElementById('kpi-best-habit').textContent = maxVerdesHabito > 0 ? mejorHabito : 'En progreso';

    const barsContainer = document.getElementById('chart-bars-container');
    barsContainer.innerHTML = '';

    statsHabitos.forEach(stat => {
      const row = document.createElement('div');
      row.className = 'chart-bar-row';
      const pGreen = (stat.verdes / diasTotal) * 100;
      const pRed = (stat.rojos / diasTotal) * 100;

      row.innerHTML = `
        <div class="bar-meta">
          <span>${this.escapeHtml(stat.nombre)}</span>
          <span>🟩 ${stat.verdes}d (${stat.rate}%) | 🟥 ${stat.rojos}d</span>
        </div>
        <div class="bar-track">
          <div class="bar-segment-green" style="width: ${pGreen}%"></div>
          <div class="bar-segment-red" style="width: ${pRed}%"></div>
        </div>
      `;
      barsContainer.appendChild(row);
    });

    const cardsContainer = document.getElementById('consolidation-status-list');
    cardsContainer.innerHTML = '';

    statsHabitos.forEach(stat => {
      const card = document.createElement('div');
      const consolidado = stat.verdes >= APP_CONFIG.META_CONSOLIDACION;
      card.className = `consolidation-badge-card ${consolidado ? 'consolidated' : ''}`;
      card.innerHTML = `
        <div class="badge-icon">${consolidado ? '🏆' : '⏳'}</div>
        <div class="badge-info">
          <strong>${this.escapeHtml(stat.nombre)}</strong>
          <span>${consolidado ? '¡Logrado! Ya puedes pasar a otro hábito' : `${stat.verdes}/${APP_CONFIG.META_CONSOLIDACION} verdes para consolidar`}</span>
        </div>
      `;
      cardsContainer.appendChild(card);
    });

    this.abrirModal('modal-analytics');
  }

  // ========================================================
  // MODALES UTILIDADES
  // ========================================================
  abrirModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
  }

  cerrarModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

const app = new RegistroAtomicoApp();
window.addEventListener('DOMContentLoaded', () => {
  app.init();
});
