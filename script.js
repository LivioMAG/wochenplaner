const STORAGE_KEY = 'wochenplaner-mvp-v1';
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
let state = loadState();
let activeAssignment = null;

function loadState() {
  const fallback = { employees: [], works: [], assignments: [], settings: defaultSettings() };
  try { return { ...fallback, ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}) }; } catch { return fallback; }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); renderAll(); }
function id(prefix) { return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`; }
function money(value) { return new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(value || 0); }
function getIsoWeek(date) { const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return Math.ceil((((d - y) / 86400000) + 1) / 7); }
function getIsoWeekYear(date) { const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); return d.getUTCFullYear(); }
function getWeekDates(year, week) { const jan4 = new Date(Date.UTC(year, 0, 4)); const monday = new Date(jan4); monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (week - 1) * 7); return WEEKDAYS.map((day, index) => { const date = new Date(monday); date.setUTCDate(monday.getUTCDate() + index); return { key: day[0], label: day[1], date }; }); }
function formatDate(date) { return new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit' }).format(date); }
function assignmentKey(employeeId, weekday) { return `${state.settings.year}-${state.settings.calendarWeek}-${employeeId}-${weekday}`; }
function findAssignment(employeeId, weekday) { return state.assignments.find((a) => a.id === assignmentKey(employeeId, weekday)); }
function upsertAssignment(employeeId, weekday, status, workId) {
  const key = assignmentKey(employeeId, weekday);
  state.assignments = state.assignments.filter((a) => a.id !== key);
  if (status !== 'empty') state.assignments.push({ id: key, calendarWeek: state.settings.calendarWeek, year: state.settings.year, employeeId, weekday, status, workId: status === 'assigned' ? workId : undefined });
  saveState();
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

function renderAll() { renderEmployees(); renderWorks(); renderSettings(); renderDisposition(); }
function renderEmployees() {
  const list = document.querySelector('#employee-list');
  list.innerHTML = state.employees.length ? state.employees.map((e) => `<article class="item-card"><h3>${escapeHtml(`${e.firstName} ${e.lastName || ''}`.trim())}</h3><p>${money(e.hourlyRateChf)} / h</p><div class="item-actions"><button data-edit-employee="${e.id}">Bearbeiten</button><button class="danger" data-delete-employee="${e.id}">Löschen</button></div></article>`).join('') : '<div class="empty-state">Noch keine Mitarbeiter erfasst.</div>';
}
function renderWorks() {
  document.querySelector('#work-category').innerHTML = Object.entries(CATEGORIES).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  const list = document.querySelector('#work-list');
  list.innerHTML = state.works.length ? state.works.map((w) => `<article class="item-card"><span class="badge">${CATEGORIES[w.category]}</span><h3>${escapeHtml(w.title)}</h3><p>${escapeHtml(w.description || 'Keine Beschreibung')}</p><div class="item-actions"><button data-edit-work="${w.id}">Bearbeiten</button><button class="danger" data-delete-work="${w.id}">Löschen</button></div></article>`).join('') : '<div class="empty-state">Noch keine Arbeiten erfasst.</div>';
}
function renderSettings() { document.querySelector('#settings-week').value = state.settings.calendarWeek; document.querySelector('#settings-year').value = state.settings.year; document.querySelector('#settings-hours').value = state.settings.workHoursPerDay; document.querySelector('#settings-expenses').value = state.settings.expensesPerWorkdayChf; }
function renderDisposition() {
  document.querySelector('#week-label').textContent = `KW ${state.settings.calendarWeek} / ${state.settings.year}`;
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

function exportPdf() {
  const jspdf = window.jspdf?.jsPDF; if (!jspdf) { alert('PDF-Bibliothek konnte nicht geladen werden.'); return; }
  const doc = new jspdf(); const days = getWeekDates(state.settings.year, state.settings.calendarWeek); const costs = calculateCosts();
  doc.text(`Disposition KW ${state.settings.calendarWeek} / ${state.settings.year}`, 14, 16);
  doc.autoTable({ startY: 24, head: [['Mitarbeiter', ...days.map((d) => `${d.label} ${formatDate(d.date)}`)]], body: state.employees.map((e) => [`${e.firstName} ${e.lastName || ''}`.trim(), ...days.map((d) => { const a = findAssignment(e.id, d.key); const w = state.works.find((item) => item.id === a?.workId); return a?.status === 'absent' ? 'Abwesend' : (w ? `${w.title} (${CATEGORIES[w.category]})` : ''); })]) });
  doc.autoTable({ startY: doc.lastAutoTable.finalY + 10, head: [['Kostenübersicht', 'CHF']], body: [['Lohnkosten total', money(costs.wageTotal)], ['Spesen total', money(costs.expensesTotal)], ['Gesamtkosten total', money(costs.total)]] });
  doc.autoTable({ startY: doc.lastAutoTable.finalY + 10, head: [['Mitarbeiter', 'Tage', 'Lohn', 'Spesen', 'Total']], body: costs.byEmployee.map((r) => [`${r.employee.firstName} ${r.employee.lastName || ''}`.trim(), r.workdays, money(r.wage), money(r.expenses), money(r.total)]) });
  doc.autoTable({ startY: doc.lastAutoTable.finalY + 10, head: [['Los / Zuordnung', 'Kosten']], body: Object.entries(CATEGORIES).map(([key, label]) => [label, money(costs.byCategory[key])]) });
  doc.save(`Disposition-KW-${state.settings.calendarWeek}-${state.settings.year}.pdf`);
}

function bindEvents() {
  document.querySelectorAll('.nav-button').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.nav-button,.page').forEach((el) => el.classList.remove('active')); button.classList.add('active'); document.querySelector(`#${button.dataset.page}`).classList.add('active'); }));
  document.querySelector('#employee-form').addEventListener('submit', (event) => { event.preventDefault(); const employee = { id: document.querySelector('#employee-id').value || id('emp'), firstName: document.querySelector('#employee-first-name').value.trim(), lastName: document.querySelector('#employee-last-name').value.trim() || undefined, hourlyRateChf: Number(document.querySelector('#employee-hourly-rate').value) || 0 }; if (!employee.firstName || employee.hourlyRateChf < 0) return; state.employees = state.employees.filter((e) => e.id !== employee.id).concat(employee); event.target.reset(); document.querySelector('#employee-id').value = ''; saveState(); });
  document.querySelector('#employee-reset').addEventListener('click', () => { document.querySelector('#employee-form').reset(); document.querySelector('#employee-id').value = ''; });
  document.querySelector('#work-form').addEventListener('submit', (event) => { event.preventDefault(); const work = { id: document.querySelector('#work-id').value || id('work'), title: document.querySelector('#work-title').value.trim(), description: document.querySelector('#work-description').value.trim() || undefined, category: document.querySelector('#work-category').value }; if (!work.title || !CATEGORIES[work.category]) return; state.works = state.works.filter((w) => w.id !== work.id).concat(work); event.target.reset(); document.querySelector('#work-id').value = ''; saveState(); });
  document.querySelector('#work-reset').addEventListener('click', () => { document.querySelector('#work-form').reset(); document.querySelector('#work-id').value = ''; });
  document.querySelector('#settings-form').addEventListener('submit', (event) => { event.preventDefault(); const settings = { calendarWeek: Number(document.querySelector('#settings-week').value), year: Number(document.querySelector('#settings-year').value), workHoursPerDay: Number(document.querySelector('#settings-hours').value), expensesPerWorkdayChf: Number(document.querySelector('#settings-expenses').value) }; if (settings.calendarWeek < 1 || settings.calendarWeek > 53 || settings.workHoursPerDay < 0 || settings.expensesPerWorkdayChf < 0) return; state.settings = settings; saveState(); });
  document.body.addEventListener('click', (event) => handleActionClick(event));
  document.querySelector('#assignment-status').addEventListener('change', () => document.querySelector('#assignment-work-label').hidden = document.querySelector('#assignment-status').value !== 'assigned');
  document.querySelector('#assignment-save').addEventListener('click', (event) => { event.preventDefault(); if (!activeAssignment) return; const status = document.querySelector('#assignment-status').value; const workId = document.querySelector('#assignment-work').value; if (status === 'assigned' && !workId) return; upsertAssignment(activeAssignment.employeeId, activeAssignment.weekday, status, workId); document.querySelector('#assignment-dialog').close(); });
  document.querySelector('#export-pdf').addEventListener('click', exportPdf);
}
function handleActionClick(event) {
  const target = event.target.closest('button,td.assignment'); if (!target) return;
  if (target.dataset.editEmployee) { const e = state.employees.find((item) => item.id === target.dataset.editEmployee); document.querySelector('#employee-id').value = e.id; document.querySelector('#employee-first-name').value = e.firstName; document.querySelector('#employee-last-name').value = e.lastName || ''; document.querySelector('#employee-hourly-rate').value = e.hourlyRateChf || ''; }
  if (target.dataset.deleteEmployee && confirm('Mitarbeiter löschen?')) { state.employees = state.employees.filter((e) => e.id !== target.dataset.deleteEmployee); state.assignments = state.assignments.filter((a) => a.employeeId !== target.dataset.deleteEmployee); saveState(); }
  if (target.dataset.editWork) { const w = state.works.find((item) => item.id === target.dataset.editWork); document.querySelector('#work-id').value = w.id; document.querySelector('#work-title').value = w.title; document.querySelector('#work-description').value = w.description || ''; document.querySelector('#work-category').value = w.category; }
  if (target.dataset.deleteWork && confirm('Arbeit löschen?')) { state.works = state.works.filter((w) => w.id !== target.dataset.deleteWork); state.assignments = state.assignments.map((a) => a.workId === target.dataset.deleteWork ? { ...a, status: 'empty', workId: undefined } : a).filter((a) => a.status !== 'empty'); saveState(); }
  if (target.matches('td.assignment')) openAssignmentDialog(target.dataset.employee, target.dataset.weekday);
}
function openAssignmentDialog(employeeId, weekday) { activeAssignment = { employeeId, weekday }; const a = findAssignment(employeeId, weekday); document.querySelector('#assignment-status').value = a?.status || 'empty'; document.querySelector('#assignment-work').innerHTML = state.works.map((w) => `<option value="${w.id}">${escapeHtml(w.title)} - ${CATEGORIES[w.category]}</option>`).join(''); document.querySelector('#assignment-work').value = a?.workId || state.works[0]?.id || ''; document.querySelector('#assignment-work-label').hidden = document.querySelector('#assignment-status').value !== 'assigned'; document.querySelector('#assignment-dialog').showModal(); }

bindEvents(); renderAll();
