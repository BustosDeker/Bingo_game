/* ══════════════════════════════════════════
   BINGO APP — app.js
   ══════════════════════════════════════════ */

// ── COLUMN RANGES ──
const COL_RANGES = [
  [1, 15],   // B
  [16, 30],  // I
  [31, 45],  // N
  [46, 60],  // G
  [61, 75],  // O
];
const COL_LETTERS = ['B', 'I', 'N', 'G', 'O'];

// ── STATE ──
let cartones = [];        // Array of carton objects
let figuraSeleccionada = new Set(); // Set of cell indices (0-24) in the figure
let figuraGuardada = new Set();
let numerosCantados = new Set();
let juegoActivo = false;
let editingControlNum = null; // null = create mode, string = edit mode
let token = localStorage.getItem('bingo_token');
let user = JSON.parse(localStorage.getItem('bingo_user') || 'null');

// ── DOM REFS ──
const tabBtns   = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

// Auth
const authScreen = document.getElementById('auth-screen');
const appHeader = document.getElementById('app-header');
const appMain = document.getElementById('app-main');
const authTabs = document.querySelectorAll('.auth-tab');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const btnLogin = document.getElementById('btn-login');
const btnRegister = document.getElementById('btn-register');
const btnLogout = document.getElementById('btn-logout');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const statUser = document.getElementById('stat-user');

// Registro
const inputGrid     = document.getElementById('input-grid');
const inpControl    = document.getElementById('inp-control');
const inpNombre     = document.getElementById('inp-nombre');
const btnGuardar    = document.getElementById('btn-guardar');
const btnLimpiar    = document.getElementById('btn-limpiar');
const formError     = document.getElementById('form-error');
const cardsGrid     = document.getElementById('cards-grid');
const cardsCount    = document.getElementById('cards-count');
const statCartones  = document.getElementById('stat-cartones');
const emptyState    = document.getElementById('empty-state');
const editModeBar   = document.getElementById('edit-mode-bar');
const editCtrlLabel = document.getElementById('edit-control-label');
const btnCancelEdit = document.getElementById('btn-cancel-edit');

// Figura
const figuraGrid    = document.getElementById('figura-grid');
const figuraCount   = document.getElementById('figura-count');
const btnGuardarFig = document.getElementById('btn-guardar-figura');
const btnLimpiarFig = document.getElementById('btn-limpiar-figura');
const btnLimpiarPreview = document.getElementById('btn-limpiar-preview');
const figuraError   = document.getElementById('figura-error');
const figuraOk      = document.getElementById('figura-ok');
const figuraPreview = document.getElementById('figura-preview-grid');

// Juego
const inpNumero       = document.getElementById('inp-numero');
const btnCantar       = document.getElementById('btn-cantar');
const numerosCantadosEl = document.getElementById('numeros-cantados');
const cantadosCount   = document.getElementById('cantados-count');
const gameCardsGrid   = document.getElementById('game-cards-grid');
const gameEmptyState  = document.getElementById('game-empty-state');
const btnReset        = document.getElementById('btn-reset');
const figActiva       = document.getElementById('figura-activa-info');

// Modal
const bingoModal    = document.getElementById('bingo-modal');
const modalOverlay  = document.getElementById('modal-overlay');
const modalControl  = document.getElementById('modal-control');
const modalJugador  = document.getElementById('modal-jugador');
const btnCloseModal = document.getElementById('btn-close-modal');

// Confirm modal elements
const confirmModal = document.getElementById('confirm-modal');
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmAccept = document.getElementById('confirm-accept');
const confirmCancel = document.getElementById('confirm-cancel');

function showConfirm(message, title = 'Confirmar') {
  return new Promise(resolve => {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmModal.classList.remove('hidden');
    confirmOverlay.classList.remove('hidden');

    function cleanup(result) {
      confirmModal.classList.add('hidden');
      confirmOverlay.classList.add('hidden');
      confirmAccept.removeEventListener('click', onAccept);
      confirmCancel.removeEventListener('click', onCancel);
      confirmOverlay.removeEventListener('click', onCancel);
      resolve(result);
    }

    function onAccept() { cleanup(true); }
    function onCancel() { cleanup(false); }

    confirmAccept.addEventListener('click', onAccept);
    confirmCancel.addEventListener('click', onCancel);
    confirmOverlay.addEventListener('click', onCancel);
  });
}

// ── API HELPERS ──
async function apiRequest(endpoint, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  
  const res = await fetch(endpoint, options);
  const data = await res.json();
  
  if (!res.ok) throw new Error(data.error || 'Error en la solicitud');
  return data;
}

// ── AUTH FUNCTIONS ──
function showAuthScreen() {
  authScreen.classList.remove('hidden');
  appHeader.classList.add('hidden');
  appMain.classList.add('hidden');
}

function showApp() {
  authScreen.classList.add('hidden');
  appHeader.classList.remove('hidden');
  appMain.classList.remove('hidden');
  // Mostrar sólo el nombre de usuario (sin prefijo)
  statUser.textContent = user.username;
}

async function login(username, password) {
  try {
    const data = await apiRequest('/api/auth/login', 'POST', { username, password });
    token = data.token;
    user = data.user;
    localStorage.setItem('bingo_token', token);
    localStorage.setItem('bingo_user', JSON.stringify(user));
    hideError(loginError);
    showApp();
    await loadData();
  } catch (err) {
    showError(loginError, err.message);
  }
}

async function register(username, password) {
  try {
    const data = await apiRequest('/api/auth/register', 'POST', { username, password });
    token = data.token;
    user = data.user;
    localStorage.setItem('bingo_token', token);
    localStorage.setItem('bingo_user', JSON.stringify(user));
    hideError(registerError);
    showApp();
    await loadData();
  } catch (err) {
    showError(registerError, err.message);
  }
}

function logout() {
  token = null;
  user = null;
  localStorage.removeItem('bingo_token');
  localStorage.removeItem('bingo_user');
  cartones = [];
  figuraSeleccionada = new Set([12]);
  figuraGuardada = new Set();
  numerosCantados = new Set();
  showAuthScreen();
  buildFiguraGrid();
  renderMiniCards();
  updateStats();
  updateFigActiva();
}

// ── DATA LOADING ──
async function loadData() {
  try {
    const [cartonesData, figuraData] = await Promise.all([
      apiRequest('/api/cartones'),
      apiRequest('/api/figura')
    ]);
    
    cartones = cartonesData;
    
    if (figuraData) {
      figuraGuardada = new Set(figuraData.selected_cells);
      figuraSeleccionada = new Set(figuraData.selected_cells);
    }
    
    renderMiniCards();
    updateStats();
    buildFiguraGrid();
    updateFigActiva();
  } catch (err) {
    console.error('Error loading data:', err);
  }
}

// ── CARTONES CRUD ──
async function saveCarton(control, nombre, matrix) {
  try {
    const data = await apiRequest('/api/cartones', 'POST', { control, nombre, matrix });
    cartones.push(data);
    return data;
  } catch (err) {
    throw err;
  }
}

async function updateCarton(id, control, nombre, matrix) {
  try {
    const data = await apiRequest(`/api/cartones/${id}`, 'PUT', { control, nombre, matrix });
    const idx = cartones.findIndex(c => c.id === id);
    if (idx !== -1) cartones[idx] = data;
    return data;
  } catch (err) {
    throw err;
  }
}

async function deleteCarton(id) {
  try {
    await apiRequest(`/api/cartones/${id}`, 'DELETE');
    cartones = cartones.filter(c => c.id !== id);
  } catch (err) {
    throw err;
  }
}

// ── FIGURA CRUD ──
async function saveFigura(selectedCells) {
  try {
    await apiRequest('/api/figura', 'POST', { selected_cells: Array.from(selectedCells) });
    figuraGuardada = new Set(selectedCells);
  } catch (err) {
    throw err;
  }
}

// ══════════════════════════════════════════
// TABS
// ══════════════════════════════════════════
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    tabBtns.forEach(b => b.classList.remove('active'));
    tabPanels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
    if (tab === 'juego') renderGameCards();
    if (tab === 'figura') updateFiguraPreview();
  });
});

// ══════════════════════════════════════════
// AUTH TABS
// ══════════════════════════════════════════
authTabs.forEach(btn => {
  btn.addEventListener('click', () => {
    const auth = btn.dataset.auth;
    authTabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (auth === 'login') {
      loginForm.classList.remove('hidden');
      registerForm.classList.add('hidden');
    } else {
      loginForm.classList.add('hidden');
      registerForm.classList.remove('hidden');
    }
  });
});

btnLogin.addEventListener('click', () => {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  if (!username || !password) {
    showError(loginError, 'Ingresa usuario y contraseña');
    return;
  }
  login(username, password);
});

btnRegister.addEventListener('click', () => {
  const username = document.getElementById('register-username').value.trim();
  const password = document.getElementById('register-password').value;
  const confirm = document.getElementById('register-confirm').value;
  if (!username || !password || !confirm) {
    showError(registerError, 'Completa todos los campos');
    return;
  }
  if (password !== confirm) {
    showError(registerError, 'Las contraseñas no coinciden');
    return;
  }
  register(username, password);
});

btnLogout.addEventListener('click', logout);

// ══════════════════════════════════════════
// BUILD INPUT GRID (5×5 for registration)
// ══════════════════════════════════════════
function buildInputGrid() {
  inputGrid.innerHTML = '';
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (row === 2 && col === 2) {
        // Center cell
        const div = document.createElement('div');
        div.className = 'cell-center';
        div.id = 'center-display';
        div.textContent = '—';
        inputGrid.appendChild(div);
      } else {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.className = `col-${col}`;
        inp.dataset.row = row;
        inp.dataset.col = col;
        inp.min = COL_RANGES[col][0];
        inp.max = COL_RANGES[col][1];
        inp.placeholder = `${COL_RANGES[col][0]}-${COL_RANGES[col][1]}`;
        inp.setAttribute('aria-label', `Fila ${row+1} Col ${COL_LETTERS[col]}`);
        // Navigate with Enter
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') focusNextCell(row, col);
        });
        inputGrid.appendChild(inp);
      }
    }
  }
}

function focusNextCell(row, col) {
  // Move to next cell in reading order, skip center
  let r = row, c = col;
  do {
    c++;
    if (c >= 5) { c = 0; r++; }
    if (r >= 5) return;
  } while (r === 2 && c === 2);
  const next = inputGrid.querySelector(`input[data-row="${r}"][data-col="${c}"]`);
  if (next) next.focus();
}

// Update center cell display when control number changes
inpControl.addEventListener('input', () => {
  const center = document.getElementById('center-display');
  if (center) center.textContent = inpControl.value.trim() || '—';
});

// ══════════════════════════════════════════
// READ INPUT GRID VALUES
// ══════════════════════════════════════════
function readInputGridValues() {
  const matrix = [];
  for (let row = 0; row < 5; row++) {
    const rowArr = [];
    for (let col = 0; col < 5; col++) {
      if (row === 2 && col === 2) {
        rowArr.push(null); // center
      } else {
        const inp = inputGrid.querySelector(`input[data-row="${row}"][data-col="${col}"]`);
        const v = parseInt(inp.value, 10);
        rowArr.push(isNaN(v) ? null : v);
      }
    }
    matrix.push(rowArr);
  }
  return matrix;
}

// Fill input grid from matrix (for editing)
function fillInputGrid(matrix, controlNum) {
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (row === 2 && col === 2) continue;
      const inp = inputGrid.querySelector(`input[data-row="${row}"][data-col="${col}"]`);
      if (inp && matrix[row][col] !== null) inp.value = matrix[row][col];
    }
  }
  const center = document.getElementById('center-display');
  if (center) center.textContent = controlNum || '—';
}

// ══════════════════════════════════════════
// VALIDATE & SAVE CARTON
// ══════════════════════════════════════════
function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideError(el) { el.classList.add('hidden'); }

btnGuardar.addEventListener('click', async () => {
  hideError(formError);

  const control = inpControl.value.trim();
  const nombre  = inpNombre.value.trim();

  if (!control) return showError(formError, 'Ingresa un número de control.');
  if (!nombre)  return showError(formError, 'Ingresa el nombre del jugador.');

  // Check duplicate control (except self when editing)
  const dupControl = cartones.find(c => c.control === control && c.control !== editingControlNum);
  if (dupControl) return showError(formError, `El N° de control "${control}" ya está en uso.`);

  if (cartones.length >= 20 && !editingControlNum)
    return showError(formError, 'Ya alcanzaste el límite de 20 cartones.');

  const matrix = readInputGridValues();

  // Validate all cells filled
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (row === 2 && col === 2) continue;
      if (matrix[row][col] === null)
        return showError(formError, `Celda vacía en fila ${row+1}, columna ${COL_LETTERS[col]}. Completa todos los números.`);
    }
  }

  // Validate ranges
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (row === 2 && col === 2) continue;
      const v = matrix[row][col];
      const [mn, mx] = COL_RANGES[col];
      if (v < mn || v > mx)
        return showError(formError, `El número ${v} en columna ${COL_LETTERS[col]} debe estar entre ${mn} y ${mx}.`);
    }
  }

  // Validate no repeated numbers within same carton
  const allNums = [];
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 5; col++)
      if (!(row === 2 && col === 2)) allNums.push(matrix[row][col]);

  const seen = new Set();
  for (const n of allNums) {
    if (seen.has(n)) return showError(formError, `El número ${n} está repetido en el cartón.`);
    seen.add(n);
  }

  try {
    if (editingControlNum !== null) {
      const existing = cartones.find(c => c.control === editingControlNum);
      if (existing) {
        await updateCarton(existing.id, control, nombre, matrix);
      }
      exitEditMode();
    } else {
      await saveCarton(control, nombre, matrix);
    }

    clearForm();
    renderMiniCards();
    updateStats();
  } catch (err) {
    showError(formError, err.message);
  }
});

function clearForm() {
  inpControl.value = '';
  inpNombre.value  = '';
  buildInputGrid();
  hideError(formError);
}

btnLimpiar.addEventListener('click', () => {
  clearForm();
  exitEditMode();
});

btnCancelEdit.addEventListener('click', () => {
  clearForm();
  exitEditMode();
});

function exitEditMode() {
  editingControlNum = null;
  editModeBar.classList.add('hidden');
  btnGuardar.textContent = 'Guardar Cartón';
}

// ══════════════════════════════════════════
// RENDER MINI CARDS (Registro tab)
// ══════════════════════════════════════════
function renderMiniCards() {
  // Remove old mini cards but keep empty state
  const existing = cardsGrid.querySelectorAll('.mini-card');
  existing.forEach(c => c.remove());

  if (cartones.length === 0) {
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
    cartones.forEach((carton, idx) => {
      const card = buildMiniCard(carton, idx);
      cardsGrid.appendChild(card);
    });
  }

  cardsCount.textContent = `${cartones.length} / 20`;
}

function buildMiniCard(carton, idx) {
  const div = document.createElement('div');
  div.className = 'mini-card';

  const header = document.createElement('div');
  header.className = 'mini-card-header';

  const ctrl = document.createElement('span');
  ctrl.className = 'mini-card-control';
  ctrl.textContent = `N° ${carton.control}`;

  const nameEl = document.createElement('span');
  nameEl.className = 'mini-card-name';
  nameEl.textContent = carton.nombre;

  const actions = document.createElement('div');
  actions.className = 'mini-card-actions';

  const editBtn = document.createElement('button');
  editBtn.textContent = '✏️';
  editBtn.title = 'Editar';
  editBtn.addEventListener('click', () => startEdit(carton.control));

  const delBtn = document.createElement('button');
  delBtn.textContent = '🗑️';
  delBtn.title = 'Eliminar';
  delBtn.addEventListener('click', async () => {
    const ok = await showConfirm(`¿Eliminar el cartón N° ${carton.control} de ${carton.nombre}?`, 'Eliminar cartón');
    if (!ok) return;
    try {
      await deleteCarton(carton.id);
      renderMiniCards();
      updateStats();
    } catch (err) {
      // fallback alert if needed
      alert(err.message);
    }
  });

  actions.appendChild(editBtn);
  actions.appendChild(delBtn);
  header.appendChild(ctrl);
  header.appendChild(nameEl);
  header.appendChild(actions);
  div.appendChild(header);

  // Mini grid
  const grid = document.createElement('div');
  grid.className = 'mini-bingo-grid';
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const cell = document.createElement('div');
      cell.className = 'mini-cell';
      if (row === 2 && col === 2) {
        cell.classList.add('center');
        cell.textContent = carton.control;
      } else {
        cell.textContent = carton.matrix[row][col];
      }
      grid.appendChild(cell);
    }
  }
  div.appendChild(grid);
  return div;
}

function startEdit(controlNum) {
  const carton = cartones.find(c => c.control === controlNum);
  if (!carton) return;
  editingControlNum = controlNum;
  inpControl.value = carton.control;
  inpNombre.value  = carton.nombre;
  fillInputGrid(carton.matrix, carton.control);
  editCtrlLabel.textContent = carton.control;
  editModeBar.classList.remove('hidden');
  btnGuardar.textContent = 'Actualizar Cartón';
  // Switch to registro tab if needed
  document.querySelector('[data-tab="registro"]').click();
  inpControl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ══════════════════════════════════════════
// UPDATE STATS
// ══════════════════════════════════════════
function updateStats() {
  statCartones.textContent = `${cartones.length} ${cartones.length === 1 ? 'cartón' : 'cartones'}`;
}

// ══════════════════════════════════════════
// FIGURA GRID (5×5 selector)
// ══════════════════════════════════════════
function buildFiguraGrid() {
  figuraGrid.innerHTML = '';
  for (let i = 0; i < 25; i++) {
    const cell = document.createElement('div');
    cell.className = 'figura-cell';
    cell.dataset.idx = i;
    const row = Math.floor(i / 5);
    const col = i % 5;
    if (row === 2 && col === 2) {
      cell.classList.add('is-center', 'selected');
      cell.textContent = '★';
    } else {
      cell.textContent = `${COL_LETTERS[col]}`;
      cell.addEventListener('click', () => {
        if (figuraSeleccionada.has(i)) {
          figuraSeleccionada.delete(i);
          cell.classList.remove('selected');
        } else {
          figuraSeleccionada.add(i);
          cell.classList.add('selected');
        }
        updateFiguraCount();
        updateFiguraPreview();
      });
      if (figuraSeleccionada.has(i)) cell.classList.add('selected');
    }
    figuraGrid.appendChild(cell);
  }
  updateFiguraCount();
}

function updateFiguraCount() {
  // Don't count center
  const count = figuraSeleccionada.size;
  figuraCount.textContent = count;
}

function updateFiguraPreview() {
  figuraPreview.innerHTML = '';
  const fig = figuraGuardada.size ? figuraGuardada : figuraSeleccionada;
  for (let i = 0; i < 25; i++) {
    const cell = document.createElement('div');
    const row = Math.floor(i / 5), col = i % 5;
    const isCenter = row === 2 && col === 2;
    cell.className = 'preview-cell';
    if (isCenter || fig.has(i)) cell.classList.add('selected');
    figuraPreview.appendChild(cell);
  }
}

btnGuardarFig.addEventListener('click', async () => {
  hideError(figuraError);
  figuraOk.classList.add('hidden');
  // Need at least 4 non-center cells
  const nonCenter = [...figuraSeleccionada].filter(i => !(Math.floor(i/5) === 2 && i%5 === 2));
  if (nonCenter.length < 4)
    return showError(figuraError, 'Selecciona al menos 4 celdas (sin contar el centro).');
  
  try {
    await saveFigura(figuraSeleccionada);
    figuraOk.classList.remove('hidden');
    updateFigActiva();
    updateFiguraPreview();
  } catch (err) {
    showError(figuraError, err.message);
  }
});

btnLimpiarFig.addEventListener('click', () => {
  figuraSeleccionada = new Set([12]); // keep center
  buildFiguraGrid();
  hideError(figuraError);
  figuraOk.classList.add('hidden');
});

btnLimpiarPreview.addEventListener('click', async () => {
  if (figuraGuardada.size === 0) {
    // If no figura is saved, just clear the selection
    figuraSeleccionada = new Set([12]);
    buildFiguraGrid();
    return;
  }
  
  // Ask for confirmation via custom modal
  const ok = await showConfirm('¿Estás seguro de que quieres eliminar la figura guardada?', 'Eliminar figura');
  if (!ok) return;
  try {
    // Delete the figura from the server
    await apiRequest('/api/figura', 'DELETE');
    figuraGuardada = new Set();
    figuraSeleccionada = new Set([12]);
    buildFiguraGrid();
    updateFigActiva();
    updateFiguraPreview();
    figuraOk.classList.add('hidden');
  } catch (err) {
    console.error('Error deleting figura:', err);
  }
});

// Presets
document.querySelectorAll('.btn-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = btn.dataset.preset;
    figuraSeleccionada = applyPreset(preset);
    buildFiguraGrid();
  });
});

function applyPreset(name) {
  const s = new Set([12]);
  switch (name) {
    case 'linea-h': // middle horizontal row (row 2)
      for (let c = 0; c < 5; c++) s.add(10 + c);
      break;
    case 'linea-v': // middle vertical col (col 2)
      for (let r = 0; r < 5; r++) s.add(r * 5 + 2);
      break;
    case 'cruz':
      for (let c = 0; c < 5; c++) s.add(10 + c);   // row 2
      for (let r = 0; r < 5; r++) s.add(r * 5 + 2); // col 2
      break;
    case 'esquinas':
      s.add(0); s.add(4); s.add(20); s.add(24);
      break;
    case 'marco':
      for (let c = 0; c < 5; c++) { s.add(c); s.add(20 + c); }      // row 0,4
      for (let r = 1; r < 4; r++) { s.add(r * 5); s.add(r * 5 + 4); } // col 0,4
      break;
    case 'X':
      for (let i = 0; i < 5; i++) {
        s.add(i * 5 + i);        // diagonal \
        s.add(i * 5 + (4 - i)); // diagonal /
      }
      break;
    case 'full':
      for (let i = 0; i < 25; i++) s.add(i);
      break;
  }
  return s;
}

function updateFigActiva() {
  if (figuraGuardada.size === 0) {
    figActiva.textContent = 'Sin figura configurada. Ve a la pestaña Figura.';
    return;
  }
  const count = [...figuraGuardada].filter(i => !(Math.floor(i/5) === 2 && i%5 === 2)).length;
  figActiva.innerHTML = `Figura activa: <strong>${count + 1} celdas</strong> (incluye centro)`;
}

// ══════════════════════════════════════════
// GAME CARDS
// ══════════════════════════════════════════
function renderGameCards() {
  gameCardsGrid.innerHTML = '';
  updateFigActiva();

  if (cartones.length === 0) {
    gameCardsGrid.appendChild(buildEmptyState('🎲', 'Registra cartones en la pestaña Cartones.'));
    return;
  }
  if (figuraGuardada.size === 0) {
    gameCardsGrid.appendChild(buildEmptyState('🎯', 'Configura y guarda una figura en la pestaña Figura.'));
    return;
  }

  cartones.forEach(carton => {
    gameCardsGrid.appendChild(buildGameCard(carton));
  });

  juegoActivo = true;
  inpNumero.disabled = false;
  btnCantar.disabled = false;
}

function buildEmptyState(icon, msg) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.style.gridColumn = '1/-1';
  div.innerHTML = `<div class="empty-icon">${icon}</div><p>${msg}</p>`;
  return div;
}

function buildGameCard(carton) {
  const div = document.createElement('div');
  div.className = 'game-card';
  div.id = `gc-${carton.control}`;

  const header = document.createElement('div');
  header.className = 'game-card-header';
  const ctrl  = document.createElement('span');
  ctrl.className = 'game-card-control';
  ctrl.textContent = `N° ${carton.control}`;
  const name  = document.createElement('span');
  name.className = 'game-card-name';
  name.textContent = carton.nombre;
  header.appendChild(ctrl);
  header.appendChild(name);
  div.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'game-bingo-grid';

  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const cell = document.createElement('div');
      const idx = row * 5 + col;
      cell.className = `game-cell col-${col}`;
      cell.dataset.idx = idx;

      if (row === 2 && col === 2) {
        cell.classList.add('center', 'marked');
        cell.textContent = carton.control;
      } else {
        const num = carton.matrix[row][col];
        cell.textContent = num;
        cell.dataset.num = num;
        if (numerosCantados.has(num)) cell.classList.add('marked');
      }

      // Highlight figure cells
      if (figuraGuardada.has(idx)) {
        cell.classList.add('figura-highlight');
      }

      grid.appendChild(cell);
    }
  }

  div.appendChild(grid);
  return div;
}

// ══════════════════════════════════════════
// CANTAR NÚMERO
// ══════════════════════════════════════════
inpNumero.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnCantar.click();
});

btnCantar.addEventListener('click', () => {
  if (!juegoActivo) return;

  const n = parseInt(inpNumero.value, 10);
  if (isNaN(n) || n < 1 || n > 75) {
    pulseError(inpNumero);
    return;
  }
  if (numerosCantados.has(n)) {
    pulseError(inpNumero);
    return;
  }

  numerosCantados.add(n);
  inpNumero.value = '';
  inpNumero.focus();

  // Add chip
  addNumeroChip(n);
  cantadosCount.textContent = numerosCantados.size;

  // Mark on all game cards
  const col = getColumnForNum(n);
  document.querySelectorAll(`.game-cell[data-num="${n}"]`).forEach(cell => {
    cell.classList.add('marked');
  });

  // Check winner
  checkWinners();
});

function getColumnForNum(n) {
  for (let c = 0; c < 5; c++) {
    if (n >= COL_RANGES[c][0] && n <= COL_RANGES[c][1]) return c;
  }
  return 0;
}

function addNumeroChip(n) {
  const col = getColumnForNum(n);
  const chip = document.createElement('span');
  chip.className = `numero-chip chip-${COL_LETTERS[col].toLowerCase()}`;
  chip.textContent = n;
  chip.title = `${COL_LETTERS[col]}-${n}`;
  numerosCantadosEl.appendChild(chip);
}

function pulseError(el) {
  el.style.borderColor = 'var(--red)';
  el.style.boxShadow = '0 0 0 3px rgba(255,92,106,.25)';
  setTimeout(() => {
    el.style.borderColor = '';
    el.style.boxShadow = '';
  }, 600);
}

// ══════════════════════════════════════════
// CHECK WINNERS
// ══════════════════════════════════════════
function checkWinners() {
  for (const carton of cartones) {
    const gameCardEl = document.getElementById(`gc-${carton.control}`);
    if (!gameCardEl || gameCardEl.classList.contains('winner')) continue;

    let win = true;
    for (const idx of figuraGuardada) {
      const row = Math.floor(idx / 5);
      const col = idx % 5;
      if (row === 2 && col === 2) continue; // center always marked
      const num = carton.matrix[row][col];
      if (!numerosCantados.has(num)) { win = false; break; }
    }

    if (win) {
      // Highlight complete figure cells
      gameCardEl.querySelectorAll('.game-cell.figura-highlight').forEach(c => {
        c.classList.add('figura-complete');
      });
      gameCardEl.classList.add('winner');
      showBingoModal(carton.control, carton.nombre);
      stopGame();
      return;
    }
  }
}

function stopGame() {
  juegoActivo = false;
  inpNumero.disabled = true;
  btnCantar.disabled = true;
}

function showBingoModal(control, nombre) {
  modalControl.textContent = control;
  modalJugador.textContent = nombre;
  bingoModal.classList.remove('hidden');
  modalOverlay.classList.remove('hidden');
}

btnCloseModal.addEventListener('click', () => {
  bingoModal.classList.add('hidden');
  modalOverlay.classList.add('hidden');
  // Scroll to winner card
  const winner = document.querySelector('.game-card.winner');
  if (winner) winner.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
modalOverlay.addEventListener('click', () => {
  bingoModal.classList.add('hidden');
  modalOverlay.classList.add('hidden');
});

// ══════════════════════════════════════════
// RESET
// ══════════════════════════════════════════
btnReset.addEventListener('click', async () => {
  const ok = await showConfirm('¿Iniciar nueva ronda? Se borrarán los números cantados y las marcas de los cartones (los cartones y la figura se conservan).', 'Nueva ronda');
  if (!ok) return;
  numerosCantados.clear();
  numerosCantadosEl.innerHTML = '';
  cantadosCount.textContent = '0';
  inpNumero.value = '';
  inpNumero.disabled = false;
  btnCantar.disabled = false;
  juegoActivo = cartones.length > 0 && figuraGuardada.size > 0;
  renderGameCards();
});

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
function init() {
  buildInputGrid();
  // center always in figura
  figuraSeleccionada.add(12);
  buildFiguraGrid();
  renderMiniCards();
  updateStats();
  updateFigActiva();
  
  if (token && user) {
    showApp();
    loadData();
  } else {
    showAuthScreen();
  }
}

init();
