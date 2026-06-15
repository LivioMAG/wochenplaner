const STORAGE_KEY = 'wochenplaner-mvp-v1';
const DB_NAME = 'wochenplaner-db';
const DB_STORE = 'app-state';
const DB_STATE_KEY = 'state';
const WEEKDAYS = [
  ['monday', 'Montag'], ['tuesday', 'Dienstag'], ['wednesday', 'Mittwoch'], ['thursday', 'Donnerstag'], ['friday', 'Freitag'],
];
const CATEGORIES = {
  'layout-anpassung': 'Layout-Anpassung', hochregallager: 'Hochregallager', kaelte: 'Kälte',
};
const defaultSettings = () => {
  const now = new Date();
  return { calendarWeek: getIsoWeek(now), year: getIsoWeekYear(now), workHoursPerDay: 8.5, expensesPerWorkdayChf: 18 };
};
let state = createFallbackState();
let activeAssignment = null;

function createFallbackState() { return { employees: [], works: [], assignments: [], carpools: [], settings: defaultSettings() }; }
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB nicht verfügbar')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.addEventListener('upgradeneeded', () => request.result.createObjectStore(DB_STORE));
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}
function readDatabaseState() {
  return openDatabase().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, 'readonly');
    const request = transaction.objectStore(DB_STORE).get(DB_STATE_KEY);
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
    transaction.addEventListener('complete', () => db.close());
  }));
}
function writeDatabaseState(nextState) {
  return openDatabase().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, 'readwrite');
    transaction.objectStore(DB_STORE).put(nextState, DB_STATE_KEY);
    transaction.addEventListener('complete', () => { db.close(); resolve(); });
    transaction.addEventListener('error', () => { db.close(); reject(transaction.error); });
  }));
}
async function loadState() {
  const fallback = createFallbackState();
  try {
    const databaseState = await readDatabaseState();
    if (databaseState) return { ...fallback, ...databaseState };
  } catch (error) {
    console.warn('IndexedDB konnte nicht gelesen werden, localStorage-Fallback wird verwendet.', error);
  }
  try { return { ...fallback, ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}) }; } catch { return fallback; }
}
async function saveState() {
  try {
    await writeDatabaseState(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderAll();
    updateStorageStatus('In der lokalen Datenbank gespeichert');
  } catch (error) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderAll();
    updateStorageStatus('Im Browser-Fallback gespeichert');
  }
}
function id(prefix) { return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`; }
function money(value) { return new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(value || 0); }
function getIsoWeek(date) { const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return Math.ceil((((d - y) / 86400000) + 1) / 7); }
function getIsoWeekYear(date) { const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); return d.getUTCFullYear(); }
function getIsoWeeksInYear(year) { return getIsoWeek(new Date(Date.UTC(year, 11, 28))); }
function getNormalizedWeekSettings(year, week) {
  let nextYear = Number(year);
  let nextWeek = Number(week);
  while (nextWeek < 1) {
    nextYear -= 1;
    nextWeek += getIsoWeeksInYear(nextYear);
  }
  while (nextWeek > getIsoWeeksInYear(nextYear)) {
    nextWeek -= getIsoWeeksInYear(nextYear);
    nextYear += 1;
  }
  return { year: nextYear, calendarWeek: nextWeek };
}
function getWeekDates(year, week) { const jan4 = new Date(Date.UTC(year, 0, 4)); const monday = new Date(jan4); monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (week - 1) * 7); return WEEKDAYS.map((day, index) => { const date = new Date(monday); date.setUTCDate(monday.getUTCDate() + index); return { key: day[0], label: day[1], date }; }); }
function formatDate(date) { return new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit' }).format(date); }
function formatDateWithYear(date) { return new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date); }
function getWeekRangeLabel() { const days = getWeekDates(state.settings.year, state.settings.calendarWeek); return `${formatDateWithYear(days[0].date)} bis ${formatDateWithYear(days[days.length - 1].date)}`; }
function getActiveWeekLabel() { return `KW ${state.settings.calendarWeek} / ${state.settings.year} · ${getWeekRangeLabel()}`; }
function changeCalendarWeek(offset) {
  const nextWeek = getNormalizedWeekSettings(state.settings.year, state.settings.calendarWeek + offset);
  state.settings = { ...state.settings, ...nextWeek };
  saveState();
}
function setCurrentCalendarWeek() {
  const now = new Date();
  state.settings = { ...state.settings, calendarWeek: getIsoWeek(now), year: getIsoWeekYear(now) };
  saveState();
}
function employeeName(employee) { return `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim(); }
function getEmployeeById(employeeId) { return state.employees.find((employee) => employee.id === employeeId); }
function getWorkById(workId) { return state.works.find((work) => work.id === workId); }
function getWeekCarpools() { return (state.carpools || []).filter((carpool) => carpool.calendarWeek === state.settings.calendarWeek && carpool.year === state.settings.year); }
function assignmentKey(employeeId, weekday) { return `${state.settings.year}-${state.settings.calendarWeek}-${employeeId}-${weekday}`; }
function findAssignment(employeeId, weekday) { return state.assignments.find((a) => a.id === assignmentKey(employeeId, weekday)); }
function upsertAssignment(employeeId, weekday, status, workId) {
  const key = assignmentKey(employeeId, weekday);
  state.assignments = state.assignments.filter((a) => a.id !== key);
  if (status !== 'empty') state.assignments.push({ id: key, calendarWeek: state.settings.calendarWeek, year: state.settings.year, employeeId, weekday, status, workId: status === 'assigned' ? workId : undefined });
  saveState();
}

function getWorkingEmployeeIdsForDay(weekday) {
  return new Set(state.assignments.filter((assignment) => assignment.calendarWeek === state.settings.calendarWeek && assignment.year === state.settings.year && assignment.weekday === weekday && assignment.status === 'assigned').map((assignment) => assignment.employeeId));
}
function getCarpoolOccupantIdsForDay(weekday, excludeCarpoolId) {
  const occupants = new Set();
  getWeekCarpools().filter((carpool) => carpool.weekday === weekday && carpool.id !== excludeCarpoolId).forEach((carpool) => {
    if (carpool.driverId) occupants.add(carpool.driverId);
    (carpool.passengerIds || []).forEach((employeeId) => occupants.add(employeeId));
  });
  return occupants;
}
function getCarpoolFormSelection() {
  return {
    carpoolId: document.querySelector('#carpool-id')?.value || '',
    weekday: document.querySelector('#carpool-day')?.value || getWeekDates(state.settings.year, state.settings.calendarWeek)[0]?.key,
    driverId: document.querySelector('#carpool-driver')?.value || '',
    passengerIds: Array.from(document.querySelector('#carpool-passengers')?.selectedOptions || []).map((option) => option.value),
  };
}
function getCarpoolSeatCapacity(driverId) {
  const driver = getEmployeeById(driverId);
  return Math.max(1, Number(driver?.vehicleSeats) || 1);
}
function getAvailablePassengerSlots(driverId) { return Math.max(0, getCarpoolSeatCapacity(driverId) - 1); }
function getWorkingEmployeesForDay(weekday) {
  const workingIds = getWorkingEmployeeIdsForDay(weekday);
  return state.employees.filter((employee) => workingIds.has(employee.id));
}
function getAvailableDriversForDay(weekday, carpoolId) {
  const occupiedIds = getCarpoolOccupantIdsForDay(weekday, carpoolId);
  return getWorkingEmployeesForDay(weekday).filter((employee) => employee.hasVehicle && !occupiedIds.has(employee.id));
}
function getAvailablePassengersForDay(weekday, driverId, carpoolId, currentPassengerIds = []) {
  const occupiedIds = getCarpoolOccupantIdsForDay(weekday, carpoolId);
  return getWorkingEmployeesForDay(weekday).filter((employee) => employee.id !== driverId && (!occupiedIds.has(employee.id) || currentPassengerIds.includes(employee.id)));
}
function renderWorkingEmployeesSummary(weekday) {
  const summary = document.querySelector('#carpool-working-employees');
  if (!summary) return;
  const workingEmployees = getWorkingEmployeesForDay(weekday);
  summary.innerHTML = workingEmployees.length ? `<strong>Arbeiten an diesem Tag:</strong><ul>${workingEmployees.map((employee) => `<li>${escapeHtml(employeeName(employee))}${employee.hasVehicle ? ` · Fahrzeug (${getCarpoolSeatCapacity(employee.id)} Plätze)` : ''}</li>`).join('')}</ul>` : '<strong>Arbeiten an diesem Tag:</strong><p class="muted">Für diesen Tag sind noch keine Mitarbeitenden in der Disposition eingeteilt.</p>';
}
function updateCarpoolFormOptions() {
  const daySelect = document.querySelector('#carpool-day');
  const driverSelect = document.querySelector('#carpool-driver');
  const passengersSelect = document.querySelector('#carpool-passengers');
  const seatInfo = document.querySelector('#carpool-seat-info');
  if (!daySelect || !driverSelect || !passengersSelect || !seatInfo) return;
  const selection = getCarpoolFormSelection();
  const drivers = getAvailableDriversForDay(selection.weekday, selection.carpoolId);
  if (selection.driverId && !drivers.some((driver) => driver.id === selection.driverId)) {
    const currentDriver = getEmployeeById(selection.driverId);
    if (currentDriver) drivers.unshift(currentDriver);
  }
  driverSelect.innerHTML = drivers.map((employee) => `<option value="${employee.id}">${escapeHtml(employeeName(employee))} (${getCarpoolSeatCapacity(employee.id)} Plätze)</option>`).join('');
  if (drivers.some((driver) => driver.id === selection.driverId)) driverSelect.value = selection.driverId;
  const driverId = driverSelect.value;
  const maxPassengers = getAvailablePassengerSlots(driverId);
  const passengers = getAvailablePassengersForDay(selection.weekday, driverId, selection.carpoolId, selection.passengerIds);
  passengersSelect.innerHTML = passengers.map((employee) => `<option value="${employee.id}">${escapeHtml(employeeName(employee))}</option>`).join('');
  Array.from(passengersSelect.options).forEach((option) => { option.selected = selection.passengerIds.includes(option.value); });
  const selectedPassengers = Array.from(passengersSelect.selectedOptions);
  selectedPassengers.slice(maxPassengers).forEach((option) => { option.selected = false; });
  seatInfo.textContent = driverId ? `${maxPassengers} freie Mitfahrer-Plätze verfügbar.` : 'Bitte zuerst einen Fahrer mit Fahrzeug auswählen.';
  renderWorkingEmployeesSummary(selection.weekday);
}

function calculateCosts() {
  const result = { wageTotal: 0, expensesTotal: 0, total: 0, byEmployee: [], byCategory: Object.fromEntries(Object.keys(CATEGORIES).map((key) => [key, 0])) };
  state.employees.forEach((employee) => {
    let workdays = 0, wage = 0, expenses = 0;
    WEEKDAYS.forEach(([weekday]) => {
      const assignment = findAssignment(employee.id, weekday);
      const work = state.works.find((item) => item.id === assignment?.workId);
      if (assignment?.status === 'assigned' && work) {
        const dayWage = (Number(employee.hourlyRateChf) || 0) * Number(state.settings.workHoursPerDay);
        const dayExpenses = Number(state.settings.expensesPerWorkdayChf) || 0;
        workdays += 1; wage += dayWage; expenses += dayExpenses; result.byCategory[work.category] += dayWage + dayExpenses;
      }
    });
    result.wageTotal += wage; result.expensesTotal += expenses; result.byEmployee.push({ employee, workdays, wage, expenses, total: wage + expenses });
  });
  result.total = result.wageTotal + result.expensesTotal;
  return result;
}

function renderAll() { renderEmployees(); renderWorks(); renderSettings(); renderDisposition(); renderCarpools(); }
function renderEmployees() {
  const list = document.querySelector('#employee-list');
  list.innerHTML = state.employees.length ? state.employees.map((e) => `<article class="item-card"><h3>${escapeHtml(employeeName(e))}</h3><p>${money(e.hourlyRateChf)} / h</p><p class="muted">${e.hasVehicle ? `Fahrzeug · ${Number(e.vehicleSeats) || 1} Plätze` : 'Kein Fahrzeug hinterlegt'}</p><div class="item-actions"><button data-edit-employee="${e.id}">Bearbeiten</button><button class="danger" data-delete-employee="${e.id}">Löschen</button></div></article>`).join('') : '<div class="empty-state">Noch keine Mitarbeiter erfasst.</div>';
}
function renderWorks() {
  document.querySelector('#work-category').innerHTML = Object.entries(CATEGORIES).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  const list = document.querySelector('#work-list');
  list.innerHTML = state.works.length ? state.works.map((w) => `<article class="item-card"><span class="badge">${CATEGORIES[w.category]}</span><h3>${escapeHtml(w.title)}</h3><p>${escapeHtml(w.description || 'Keine Beschreibung')}</p><div class="item-actions"><button data-edit-work="${w.id}">Bearbeiten</button><button class="danger" data-delete-work="${w.id}">Löschen</button></div></article>`).join('') : '<div class="empty-state">Noch keine Arbeiten erfasst.</div>';
}
function renderSettings() { document.querySelector('#settings-week').value = state.settings.calendarWeek; document.querySelector('#settings-year').value = state.settings.year; document.querySelector('#settings-hours').value = state.settings.workHoursPerDay; document.querySelector('#settings-expenses').value = state.settings.expensesPerWorkdayChf; }
function renderCarpools() {
  const daySelect = document.querySelector('#carpool-day');
  const driverSelect = document.querySelector('#carpool-driver');
  const passengersSelect = document.querySelector('#carpool-passengers');
  const workSelect = document.querySelector('#carpool-work');
  if (!daySelect || !driverSelect || !passengersSelect || !workSelect) return;
  const days = getWeekDates(state.settings.year, state.settings.calendarWeek);
  daySelect.innerHTML = days.map((day) => `<option value="${day.key}">${day.label} · ${formatDate(day.date)}</option>`).join('');
  workSelect.innerHTML = state.works.map((work) => `<option value="${work.id}">${escapeHtml(work.title)}</option>`).join('');
  document.querySelector('#carpool-week-label').textContent = getActiveWeekLabel();
  const empty = document.querySelector('#carpool-empty');
  const hasVehicles = state.employees.some((employee) => employee.hasVehicle);
  const hasAssignedWork = state.assignments.some((assignment) => assignment.calendarWeek === state.settings.calendarWeek && assignment.year === state.settings.year && assignment.status === 'assigned');
  empty.hidden = !!(state.employees.length && hasVehicles && state.works.length && hasAssignedWork);
  empty.textContent = !state.employees.length ? 'Bitte zuerst Mitarbeiter erfassen.' : (!hasVehicles ? 'Bitte mindestens ein Fahrzeug bei einem Mitarbeiter hinterlegen.' : (!state.works.length ? 'Bitte zuerst Arbeiten erfassen.' : (!hasAssignedWork ? 'Bitte zuerst Mitarbeitende in der Disposition für diese Woche einteilen.' : '')));
  document.querySelector('#carpool-form').hidden = !empty.hidden;
  if (empty.hidden) updateCarpoolFormOptions();
  const list = document.querySelector('#carpool-list');
  const carpools = getWeekCarpools();
  list.innerHTML = carpools.length ? carpools.map(renderCarpoolCard).join('') : '<div class="empty-state">Noch keine Fahrgemeinschaften für diese Woche erfasst.</div>';
}
function renderCarpoolCard(carpool) {
  const day = getWeekDates(carpool.year, carpool.calendarWeek).find((item) => item.key === carpool.weekday);
  const driver = getEmployeeById(carpool.driverId);
  const work = getWorkById(carpool.workId);
  const passengers = (carpool.passengerIds || []).map(getEmployeeById).filter(Boolean).map(employeeName);
  return `<article class="item-card"><span class="badge">${day ? `${day.label} ${formatDate(day.date)}` : carpool.weekday}</span><h3>${escapeHtml(work?.title || 'Baustelle nicht gefunden')}</h3><p><strong>Fahrer:</strong> ${escapeHtml(employeeName(driver))}</p><p><strong>Mitfahrer:</strong> ${passengers.length ? escapeHtml(passengers.join(', ')) : 'Keine'}</p><p><strong>Auf Baustelle:</strong> ${escapeHtml(carpool.arrivalTime || 'ohne Zeit')}</p><div class="item-actions"><button data-edit-carpool="${carpool.id}">Bearbeiten</button><button class="danger" data-delete-carpool="${carpool.id}">Löschen</button></div></article>`;
}
function renderDisposition() {
  document.querySelector('#week-label').textContent = getActiveWeekLabel();
  const empty = document.querySelector('#disposition-empty');
  empty.hidden = state.employees.length && state.works.length;
  empty.textContent = !state.employees.length ? 'Bitte zuerst Mitarbeiter erfassen.' : (!state.works.length ? 'Bitte zuerst Arbeiten erfassen.' : '');
  const days = getWeekDates(state.settings.year, state.settings.calendarWeek);
  const table = document.querySelector('#disposition-table');
  table.innerHTML = `<thead><tr><th>Mitarbeiter</th>${days.map((d) => `<th>${d.label}<br><span class="muted">${formatDate(d.date)}</span></th>`).join('')}</tr></thead><tbody>${state.employees.map((e) => `<tr><th>${escapeHtml(`${e.firstName} ${e.lastName || ''}`.trim())}</th>${days.map((d) => renderCell(e.id, d.key)).join('')}</tr>`).join('')}</tbody>`;
  renderCosts();
}
function renderCell(employeeId, weekday) { const a = findAssignment(employeeId, weekday); const w = state.works.find((item) => item.id === a?.workId); if (a?.status === 'absent') return `<td class="assignment cell-absent" data-employee="${employeeId}" data-weekday="${weekday}">Abwesend</td>`; if (a?.status === 'assigned' && w) return `<td class="assignment cell-assigned" data-employee="${employeeId}" data-weekday="${weekday}">${escapeHtml(w.title)}<span class="cell-category">${CATEGORIES[w.category]}</span></td>`; return `<td class="assignment cell-empty" data-employee="${employeeId}" data-weekday="${weekday}">Leer</td>`; }
function renderCosts() { const c = calculateCosts(); document.querySelector('#cost-summary').innerHTML = `<div class="summary-card"><h3>Wochentotal</h3><div class="summary-row"><span>Lohnkosten</span><strong>${money(c.wageTotal)}</strong></div><div class="summary-row"><span>Spesen</span><strong>${money(c.expensesTotal)}</strong></div><div class="summary-row"><span>Total</span><strong>${money(c.total)}</strong></div></div><div class="summary-card"><h3>Kosten pro Los</h3>${Object.entries(CATEGORIES).map(([key,label]) => `<div class="summary-row"><span>${label}</span><strong>${money(c.byCategory[key])}</strong></div>`).join('')}</div><div class="summary-card"><h3>Kosten pro Mitarbeiter</h3>${c.byEmployee.map((row) => `<div class="summary-row"><span>${escapeHtml(row.employee.firstName)} (${row.workdays} Tage)</span><strong>${money(row.total)}</strong></div>`).join('') || '<p class="muted">Keine Mitarbeiter.</p>'}</div>`; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

function updateStorageStatus(message) {
  const status = document.querySelector('#storage-status');
  if (!status) return;
  const savedAt = new Date().toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' });
  status.textContent = `${message || 'Daten werden automatisch in der lokalen Browser-Datenbank gespeichert'} · Stand: ${savedAt}`;
}
function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `wochenplaner-backup-${state.settings.year}-kw-${state.settings.calendarWeek}.json`;
  link.click();
  URL.revokeObjectURL(url);
  updateStorageStatus('Backup-Datei erstellt');
}
function normalizeImportedState(imported) {
  if (!imported || typeof imported !== 'object') throw new Error('Ungültige Datei');
  return {
    employees: Array.isArray(imported.employees) ? imported.employees : [],
    works: Array.isArray(imported.works) ? imported.works : [],
    assignments: Array.isArray(imported.assignments) ? imported.assignments : [],
    carpools: Array.isArray(imported.carpools) ? imported.carpools : [],
    settings: { ...defaultSettings(), ...(imported.settings || {}) },
  };
}
function importBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    try {
      state = normalizeImportedState(JSON.parse(reader.result));
      saveState();
      updateStorageStatus('Backup importiert und gespeichert');
    } catch (error) {
      alert('Die Backup-Datei konnte nicht importiert werden. Bitte eine gültige Wochenplaner-JSON-Datei auswählen.');
    }
  });
  reader.readAsText(file);
}


function getDispositionPdfBody(includeCategory) {
  const days = getWeekDates(state.settings.year, state.settings.calendarWeek);
  return state.employees.map((employee) => [`${employee.firstName} ${employee.lastName || ''}`.trim(), ...days.map((day) => {
    const assignment = findAssignment(employee.id, day.key);
    const work = state.works.find((item) => item.id === assignment?.workId);
    if (assignment?.status === 'absent') return 'Abwesend';
    if (!work) return '';
    return includeCategory ? `${work.title} (${CATEGORIES[work.category]})` : work.title;
  })]);
}
function addPdfHeader(doc, title, subtitle) {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(title, 14, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(subtitle, 14, 24);
  doc.setTextColor(24, 32, 47);
}
function exportPdfFull() {
  const jspdf = window.jspdf?.jsPDF; if (!jspdf) { alert('PDF-Bibliothek konnte nicht geladen werden.'); return; }
  const doc = new jspdf(); const days = getWeekDates(state.settings.year, state.settings.calendarWeek); const costs = calculateCosts();
  addPdfHeader(doc, `Disposition KW ${state.settings.calendarWeek} / ${state.settings.year}`, 'Vollständiger Export mit Lohnkosten, Spesen und Los-Kosten');
  doc.autoTable({ startY: 42, head: [['Mitarbeiter', ...days.map((d) => `${d.label} ${formatDate(d.date)}`)]], body: getDispositionPdfBody(true), headStyles: { fillColor: [37, 99, 235] }, alternateRowStyles: { fillColor: [248, 250, 252] } });
  doc.autoTable({ startY: doc.lastAutoTable.finalY + 10, head: [['Kostenübersicht', 'CHF']], body: [['Lohnkosten total', money(costs.wageTotal)], ['Spesen total', money(costs.expensesTotal)], ['Gesamtkosten total', money(costs.total)]], headStyles: { fillColor: [17, 24, 39] } });
  doc.autoTable({ startY: doc.lastAutoTable.finalY + 10, head: [['Mitarbeiter', 'Tage', 'Lohn', 'Spesen', 'Total']], body: costs.byEmployee.map((r) => [`${r.employee.firstName} ${r.employee.lastName || ''}`.trim(), r.workdays, money(r.wage), money(r.expenses), money(r.total)]), headStyles: { fillColor: [37, 99, 235] } });
  doc.autoTable({ startY: doc.lastAutoTable.finalY + 10, head: [['Los / Zuordnung', 'Kosten']], body: Object.entries(CATEGORIES).map(([key, label]) => [label, money(costs.byCategory[key])]), headStyles: { fillColor: [37, 99, 235] } });
  doc.save(`Disposition-mit-Kosten-KW-${state.settings.calendarWeek}-${state.settings.year}.pdf`);
}
function getCarpoolPdfBody() {
  const days = getWeekDates(state.settings.year, state.settings.calendarWeek);
  return getWeekCarpools().map((carpool) => {
    const day = days.find((item) => item.key === carpool.weekday);
    const driver = getEmployeeById(carpool.driverId);
    const passengers = (carpool.passengerIds || []).map(getEmployeeById).filter(Boolean).map(employeeName);
    const work = getWorkById(carpool.workId);
    return [
      day ? `${day.label} ${formatDate(day.date)}` : carpool.weekday,
      employeeName(driver),
      passengers.join(', ') || '-',
      work?.title || '-',
      carpool.arrivalTime || '-',
    ];
  });
}
function exportPdfDispoOnly() {
  const jspdf = window.jspdf?.jsPDF; if (!jspdf) { alert('PDF-Bibliothek konnte nicht geladen werden.'); return; }
  const doc = new jspdf({ orientation: 'landscape' }); const days = getWeekDates(state.settings.year, state.settings.calendarWeek);
  doc.setTextColor(24, 32, 47);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`KW ${state.settings.calendarWeek} / ${state.settings.year} · ${getWeekRangeLabel()}`, 10, 10);
  doc.autoTable({
    startY: 16,
    margin: { left: 10, right: 10 },
    head: [['Team', ...days.map((d) => `${d.label}\n${formatDate(d.date)}`)]],
    body: getDispositionPdfBody(false),
    styles: { cellPadding: 5, fontSize: 10, lineColor: [226, 232, 240], lineWidth: 0.2, valign: 'middle' },
    headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    bodyStyles: { minCellHeight: 16 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { fillColor: [248, 250, 252], fontStyle: 'bold', cellWidth: 36 } },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index > 0 && data.cell.raw === 'Abwesend') {
        data.cell.styles.fillColor = [17, 24, 39];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
      } else if (data.section === 'body' && data.column.index > 0 && data.cell.raw) {
        data.cell.styles.fillColor = [220, 252, 231];
        data.cell.styles.textColor = [22, 101, 52];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  const carpoolBody = getCarpoolPdfBody();
  if (carpoolBody.length) {
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 8,
      margin: { left: 10, right: 10 },
      head: [['Tag', 'Fahrer', 'Mitfahrer', 'Baustelle', 'Auf Baustelle um']],
      body: carpoolBody,
      styles: { cellPadding: 3, fontSize: 9, lineColor: [226, 232, 240], lineWidth: 0.2 },
      headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255], fontStyle: 'bold' },
    });
  }
  doc.save(`Nur-Dispo-KW-${state.settings.calendarWeek}-${state.settings.year}.pdf`);
}

function bindEvents() {
  document.querySelectorAll('.nav-button').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.nav-button,.page').forEach((el) => el.classList.remove('active')); button.classList.add('active'); document.querySelector(`#${button.dataset.page}`).classList.add('active'); }));
  document.querySelector('#employee-form').addEventListener('submit', (event) => { event.preventDefault(); const employee = { id: document.querySelector('#employee-id').value || id('emp'), firstName: document.querySelector('#employee-first-name').value.trim(), lastName: document.querySelector('#employee-last-name').value.trim() || undefined, hourlyRateChf: Number(document.querySelector('#employee-hourly-rate').value) || 0, hasVehicle: document.querySelector('#employee-has-vehicle').checked, vehicleSeats: Number(document.querySelector('#employee-vehicle-seats').value) || 1 }; if (!employee.firstName || employee.hourlyRateChf < 0 || employee.vehicleSeats < 1) return; state.employees = state.employees.filter((e) => e.id !== employee.id).concat(employee); event.target.reset(); document.querySelector('#employee-id').value = ''; saveState(); });
  document.querySelector('#employee-reset').addEventListener('click', () => { document.querySelector('#employee-form').reset(); document.querySelector('#employee-id').value = ''; document.querySelector('#employee-has-vehicle').checked = false; document.querySelector('#employee-vehicle-seats').value = ''; });
  document.querySelector('#work-form').addEventListener('submit', (event) => { event.preventDefault(); const work = { id: document.querySelector('#work-id').value || id('work'), title: document.querySelector('#work-title').value.trim(), description: document.querySelector('#work-description').value.trim() || undefined, category: document.querySelector('#work-category').value }; if (!work.title || !CATEGORIES[work.category]) return; state.works = state.works.filter((w) => w.id !== work.id).concat(work); event.target.reset(); document.querySelector('#work-id').value = ''; saveState(); });
  document.querySelector('#work-reset').addEventListener('click', () => { document.querySelector('#work-form').reset(); document.querySelector('#work-id').value = ''; });
  document.querySelector('#export-backup').addEventListener('click', exportBackup);
  document.querySelector('#import-backup').addEventListener('change', (event) => { importBackup(event.target.files[0]); event.target.value = ''; });
  document.querySelector('#carpool-day').addEventListener('change', updateCarpoolFormOptions);
  document.querySelector('#carpool-driver').addEventListener('change', updateCarpoolFormOptions);
  document.querySelector('#carpool-passengers').addEventListener('change', () => { const selection = getCarpoolFormSelection(); const maxPassengers = getAvailablePassengerSlots(selection.driverId); const selected = Array.from(document.querySelector('#carpool-passengers').selectedOptions); if (selected.length > maxPassengers) { selected[selected.length - 1].selected = false; alert(`Dieses Fahrzeug hat nur ${maxPassengers} freie Mitfahrer-Plätze.`); } });
  document.querySelector('#carpool-form').addEventListener('submit', (event) => { event.preventDefault(); const carpoolId = document.querySelector('#carpool-id').value || id('carpool'); const weekday = document.querySelector('#carpool-day').value; const driverId = document.querySelector('#carpool-driver').value; const passengerIds = Array.from(document.querySelector('#carpool-passengers').selectedOptions).map((option) => option.value).filter((employeeId) => employeeId !== driverId); const workingIds = getWorkingEmployeeIdsForDay(weekday); const occupiedIds = getCarpoolOccupantIdsForDay(weekday, carpoolId); const seats = getCarpoolSeatCapacity(driverId); if (!driverId) { alert('Bitte einen Fahrer mit Fahrzeug auswählen.'); return; } if (!workingIds.has(driverId) || passengerIds.some((employeeId) => !workingIds.has(employeeId))) { alert('Es können nur Mitarbeitende ausgewählt werden, die an diesem Tag arbeiten.'); return; } if (occupiedIds.has(driverId) || passengerIds.some((employeeId) => occupiedIds.has(employeeId))) { alert('Mindestens eine ausgewählte Person hat an diesem Tag bereits eine Fahrgemeinschaft.'); return; } if (passengerIds.length + 1 > seats) { alert(`Dieses Fahrzeug hat nur ${seats} Plätze.`); return; } const carpool = { id: carpoolId, calendarWeek: state.settings.calendarWeek, year: state.settings.year, weekday, driverId, passengerIds, workId: document.querySelector('#carpool-work').value, arrivalTime: document.querySelector('#carpool-arrival-time').value }; if (!carpool.weekday || !carpool.driverId || !carpool.workId || !carpool.arrivalTime) return; state.carpools = (state.carpools || []).filter((item) => item.id !== carpool.id).concat(carpool); event.target.reset(); document.querySelector('#carpool-id').value = ''; saveState(); });
  document.querySelector('#carpool-reset').addEventListener('click', () => { document.querySelector('#carpool-form').reset(); document.querySelector('#carpool-id').value = ''; updateCarpoolFormOptions(); });
  document.querySelector('#settings-form').addEventListener('submit', (event) => { event.preventDefault(); const rawWeek = Number(document.querySelector('#settings-week').value); const rawYear = Number(document.querySelector('#settings-year').value); const normalizedWeek = getNormalizedWeekSettings(rawYear, rawWeek); const settings = { calendarWeek: normalizedWeek.calendarWeek, year: normalizedWeek.year, workHoursPerDay: Number(document.querySelector('#settings-hours').value), expensesPerWorkdayChf: Number(document.querySelector('#settings-expenses').value) }; if (rawWeek < 1 || rawWeek > 53 || rawYear < 2000 || rawYear > 2100 || settings.workHoursPerDay < 0 || settings.expensesPerWorkdayChf < 0) return; state.settings = settings; saveState(); });
  document.body.addEventListener('click', (event) => handleActionClick(event));
  document.querySelector('#assignment-status').addEventListener('change', () => document.querySelector('#assignment-work-label').hidden = document.querySelector('#assignment-status').value !== 'assigned');
  document.querySelector('#assignment-save').addEventListener('click', (event) => { event.preventDefault(); if (!activeAssignment) return; const status = document.querySelector('#assignment-status').value; const workId = document.querySelector('#assignment-work').value; if (status === 'assigned' && !workId) return; upsertAssignment(activeAssignment.employeeId, activeAssignment.weekday, status, workId); document.querySelector('#assignment-dialog').close(); });
  document.querySelector('#export-pdf-full').addEventListener('click', exportPdfFull);
  document.querySelector('#export-pdf-dispo').addEventListener('click', exportPdfDispoOnly);
  document.querySelector('#previous-week').addEventListener('click', () => changeCalendarWeek(-1));
  document.querySelector('#current-week').addEventListener('click', setCurrentCalendarWeek);
  document.querySelector('#next-week').addEventListener('click', () => changeCalendarWeek(1));
}
function handleActionClick(event) {
  const target = event.target.closest('button,td.assignment'); if (!target) return;
  if (target.dataset.editEmployee) { const e = state.employees.find((item) => item.id === target.dataset.editEmployee); document.querySelector('#employee-id').value = e.id; document.querySelector('#employee-first-name').value = e.firstName; document.querySelector('#employee-last-name').value = e.lastName || ''; document.querySelector('#employee-hourly-rate').value = e.hourlyRateChf || ''; document.querySelector('#employee-has-vehicle').checked = !!e.hasVehicle; document.querySelector('#employee-vehicle-seats').value = e.vehicleSeats || ''; }
  if (target.dataset.deleteEmployee && confirm('Mitarbeiter löschen?')) { state.employees = state.employees.filter((e) => e.id !== target.dataset.deleteEmployee); state.assignments = state.assignments.filter((a) => a.employeeId !== target.dataset.deleteEmployee); state.carpools = (state.carpools || []).filter((carpool) => carpool.driverId !== target.dataset.deleteEmployee && !(carpool.passengerIds || []).includes(target.dataset.deleteEmployee)); saveState(); }
  if (target.dataset.editWork) { const w = state.works.find((item) => item.id === target.dataset.editWork); document.querySelector('#work-id').value = w.id; document.querySelector('#work-title').value = w.title; document.querySelector('#work-description').value = w.description || ''; document.querySelector('#work-category').value = w.category; }
  if (target.dataset.deleteWork && confirm('Arbeit löschen?')) { state.works = state.works.filter((w) => w.id !== target.dataset.deleteWork); state.assignments = state.assignments.map((a) => a.workId === target.dataset.deleteWork ? { ...a, status: 'empty', workId: undefined } : a).filter((a) => a.status !== 'empty'); state.carpools = (state.carpools || []).filter((carpool) => carpool.workId !== target.dataset.deleteWork); saveState(); }
  if (target.dataset.editCarpool) openCarpoolForEdit(target.dataset.editCarpool);
  if (target.dataset.deleteCarpool && confirm('Fahrgemeinschaft löschen?')) { state.carpools = (state.carpools || []).filter((carpool) => carpool.id !== target.dataset.deleteCarpool); saveState(); }
  if (target.matches('td.assignment')) openAssignmentDialog(target.dataset.employee, target.dataset.weekday);
}
function openAssignmentDialog(employeeId, weekday) { activeAssignment = { employeeId, weekday }; const a = findAssignment(employeeId, weekday); document.querySelector('#assignment-status').value = a?.status || 'empty'; document.querySelector('#assignment-work').innerHTML = state.works.map((w) => `<option value="${w.id}">${escapeHtml(w.title)} - ${CATEGORIES[w.category]}</option>`).join(''); document.querySelector('#assignment-work').value = a?.workId || state.works[0]?.id || ''; document.querySelector('#assignment-work-label').hidden = document.querySelector('#assignment-status').value !== 'assigned'; document.querySelector('#assignment-dialog').showModal(); }

async function initApp() {
  state = await loadState();
  bindEvents();
  renderAll();
  updateStorageStatus();
}

initApp();

function openCarpoolForEdit(carpoolId) { const carpool = (state.carpools || []).find((item) => item.id === carpoolId); if (!carpool) return; document.querySelector('#carpool-id').value = carpool.id; document.querySelector('#carpool-day').value = carpool.weekday; document.querySelector('#carpool-driver').value = carpool.driverId; updateCarpoolFormOptions(); document.querySelector('#carpool-driver').value = carpool.driverId; updateCarpoolFormOptions(); document.querySelector('#carpool-work').value = carpool.workId; document.querySelector('#carpool-arrival-time').value = carpool.arrivalTime || ''; Array.from(document.querySelector('#carpool-passengers').options).forEach((option) => { option.selected = (carpool.passengerIds || []).includes(option.value); }); document.querySelector('#carpool-form').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
