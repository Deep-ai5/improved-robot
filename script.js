/* College Library: 1. rules  2. tests  3. screen. Data lives in localStorage. */
const LOAN = 14, MAX = 3, FINE = 2, KEY = 'library-simple-v1';

/* ---------- 1. RULES (never touch the page) ---------- */
const newDb = () => ({ books: [], students: [], loans: [], nextId: 1 });
const fail = m => { throw new Error(m); };

const day = s => Date.parse(s) / 864e5;                 // "YYYY-MM-DD" -> day number
const addDays = (s, n) => new Date((day(s) + n) * 864e5).toISOString().slice(0, 10);
const diff = (a, b) => day(a) - day(b);
const today = () => new Date().toLocaleDateString('en-CA');   // en-CA gives YYYY-MM-DD

const getBook = (db, i) => db.books.find(b => b.id === i);
const getStudent = (db, i) => db.students.find(s => s.id === i);
const getLoan = (db, i) => db.loans.find(l => l.id === i);
const openLoans = db => db.loans.filter(l => !l.returned);
const copiesOut = (db, b) => openLoans(db).filter(l => l.bookId === b).length;
const copiesLeft = (db, b) => getBook(db, b).copies - copiesOut(db, b);
const unpaid = (db, s) => db.loans.filter(l => l.studentId === s && l.returned && !l.paid).reduce((t, l) => t + l.fine, 0);
const loanStatus = (l, now) => l.returned ? 'returned' : diff(now, l.due) > 0 ? 'overdue' : 'borrowed';

// edit if editId given, else create
const upsert = (db, list, prefix, editId, data) => {
  if (editId) return Object.assign(db[list].find(x => x.id === editId), data);
  const o = { id: prefix + db.nextId++, ...data };
  db[list].push(o);
  return o;
};

function saveBook(db, f, editId) {
  const title = f.title.trim(), author = f.author.trim(), isbn = f.isbn.replace(/[\s-]/g, ''), copies = +f.copies;
  if (!title || !author) fail('Title and author are required.');
  if (!/^(\d{10}|\d{13})$/.test(isbn)) fail('ISBN must be 10 or 13 digits.');
  if (!Number.isInteger(copies) || copies < 1) fail('Copies must be a whole number, at least 1.');
  if (db.books.some(b => b.isbn === isbn && b.id !== editId)) fail('A book with this ISBN already exists.');
  if (editId && copies < copiesOut(db, editId)) fail(copiesOut(db, editId) + ' copies are currently borrowed, so copies cannot be less than that.');
  return upsert(db, 'books', 'B', editId, { title, author, isbn, copies });
}

function saveStudent(db, f, editId) {
  const roll = f.roll.trim().toUpperCase(), name = f.name.trim(), department = f.department.trim();
  if (!roll || !name || !department) fail('Roll number, name and department are required.');
  if (db.students.some(s => s.roll === roll && s.id !== editId)) fail('A student with this roll number already exists.');
  return upsert(db, 'students', 'S', editId, { roll, name, department });
}

function deleteBook(db, i) {
  if (copiesOut(db, i)) fail('This book is currently borrowed and cannot be deleted.');
  db.books = db.books.filter(b => b.id !== i);
}

function deleteStudent(db, i) {
  if (openLoans(db).some(l => l.studentId === i)) fail('This student still has borrowed books.');
  if (unpaid(db, i)) fail('This student has an unpaid fine.');
  db.students = db.students.filter(s => s.id !== i);
}

function issueBook(db, sid, bid, now) {
  const s = getStudent(db, sid), b = getBook(db, bid);
  if (!s) fail('Please select a student.');
  if (!b) fail('Please select a book.');
  const mine = openLoans(db).filter(l => l.studentId === sid);
  if (mine.some(l => loanStatus(l, now) === 'overdue')) fail(s.name + ' has an overdue book. Return it first.');
  if (unpaid(db, sid)) fail(s.name + ' has an unpaid fine of ₹' + unpaid(db, sid) + '.');
  if (mine.length >= MAX) fail(s.name + ' already has ' + MAX + ' books.');
  if (mine.some(l => l.bookId === bid)) fail(s.name + ' already has a copy of this book.');
  if (copiesLeft(db, bid) < 1) fail('No copies of "' + b.title + '" are available.');
  const loan = {   // name/title copied in so records stay readable after deletes
    id: 'L' + db.nextId++, studentId: sid, bookId: bid, studentName: s.name, roll: s.roll,
    bookTitle: b.title, issued: now, due: addDays(now, LOAN), returned: null, fine: 0, paid: true
  };
  db.loans.push(loan);
  return loan;
}

function returnBook(db, i, now) {
  const l = getLoan(db, i);
  if (!l) fail('Loan not found.');
  if (l.returned) fail('This book was already returned.');
  l.returned = now;
  l.fine = Math.max(0, diff(now, l.due)) * FINE;
  l.paid = !l.fine;
  return l;
}

function payFine(db, i) {
  const l = getLoan(db, i);
  if (!l || !l.returned || !l.fine || l.paid) fail('There is no unpaid fine on this loan.');
  l.paid = true;
  return l;
}

/* ---------- 2. TESTS ---------- */
function runTests() {
  const res = [];
  const test = (name, fn) => { try { fn(); res.push({ name, ok: true }); } catch (e) { res.push({ name, ok: false, error: e.message }); } };
  const ok = (c, m) => { if (!c) throw new Error(m || 'Check failed'); };
  const err = (fn, t) => {
    try { fn(); } catch (e) { ok(e.message.includes(t), 'Wrong error: ' + e.message); return; }
    throw new Error('Expected an error containing "' + t + '"');
  };
  const setup = (copies = 1) => {
    const db = newDb();
    return {
      db,
      book: saveBook(db, { title: 'Clean Code', author: 'R. Martin', isbn: '9780132350884', copies }, null),
      stu: saveStudent(db, { roll: 'cs01', name: 'Asha', department: 'CSE' }, null)
    };
  };
  const extra = (db, n) => saveBook(db, { title: 'Book ' + n, author: 'A', isbn: '97800000000' + (10 + n), copies: 1 }, null);
  const D = '2026-10-01';

  test('validation rules', () => {
    const { db, stu } = setup();
    ok(stu.roll === 'CS01', 'roll should be upper-cased');
    err(() => saveBook(db, { title: 'X', author: 'Y', isbn: '978-0132350884', copies: 1 }, null), 'already exists');
    err(() => saveBook(db, { title: 'X', author: 'Y', isbn: '123', copies: 1 }, null), 'ISBN');
    err(() => saveBook(db, { title: '', author: 'Y', isbn: '1234567890', copies: 1 }, null), 'required');
    err(() => saveBook(db, { title: 'X', author: 'Y', isbn: '1234567890', copies: 0 }, null), 'Copies');
    err(() => saveStudent(db, { roll: 'CS01', name: 'Dup', department: 'CSE' }, null), 'already exists');
  });
  test('issue sets due date +14 days and reduces copies', () => {
    const { db, book, stu } = setup(2);
    const l = issueBook(db, stu.id, book.id, D);
    ok(l.due === '2026-10-15', 'due was ' + l.due);
    ok(copiesLeft(db, book.id) === 1);
  });
  test('no copies left', () => {
    const { db, book, stu } = setup();
    const s2 = saveStudent(db, { roll: 'CS02', name: 'Ravi', department: 'CSE' }, null);
    issueBook(db, stu.id, book.id, D);
    err(() => issueBook(db, s2.id, book.id, D), 'No copies');
  });
  test('same book twice is blocked', () => {
    const { db, book, stu } = setup(3);
    issueBook(db, stu.id, book.id, D);
    err(() => issueBook(db, stu.id, book.id, D), 'already has a copy');
  });
  test('max 3 books per student', () => {
    const { db, stu } = setup();
    const bs = [1, 2, 3, 4].map(n => extra(db, n));
    bs.slice(0, 3).forEach(b => issueBook(db, stu.id, b.id, D));
    err(() => issueBook(db, stu.id, bs[3].id, D), 'already has 3');
  });
  test('on-time return: no fine, copy freed', () => {
    const { db, book, stu } = setup();
    const l = issueBook(db, stu.id, book.id, D);
    returnBook(db, l.id, '2026-10-15');
    ok(l.fine === 0 && l.paid && copiesLeft(db, book.id) === 1);
  });
  test('late return costs ₹2 per day', () => {
    const { db, book, stu } = setup();
    const l = issueBook(db, stu.id, book.id, D);
    returnBook(db, l.id, '2026-10-20');
    ok(l.fine === 10, 'fine was ' + l.fine);
  });
  test('unpaid fine blocks borrowing until paid', () => {
    const { db, book, stu } = setup();
    const b2 = extra(db, 1), l = issueBook(db, stu.id, book.id, D);
    returnBook(db, l.id, '2026-10-17');
    err(() => issueBook(db, stu.id, b2.id, '2026-10-17'), 'unpaid fine');
    payFine(db, l.id);
    issueBook(db, stu.id, b2.id, '2026-10-17');
  });
  test('overdue book blocks borrowing', () => {
    const { db, book, stu } = setup();
    const b2 = extra(db, 1);
    issueBook(db, stu.id, book.id, D);
    err(() => issueBook(db, stu.id, b2.id, '2026-10-16'), 'overdue');
  });
  test('cannot return twice', () => {
    const { db, book, stu } = setup();
    const l = issueBook(db, stu.id, book.id, D);
    returnBook(db, l.id, '2026-10-02');
    err(() => returnBook(db, l.id, '2026-10-03'), 'already returned');
  });
  test('delete and edit limits', () => {
    const { db, book, stu } = setup(3);
    const s2 = saveStudent(db, { roll: 'CS02', name: 'Ravi', department: 'CSE' }, null);
    issueBook(db, stu.id, book.id, D);
    issueBook(db, s2.id, book.id, D);
    err(() => deleteBook(db, book.id), 'borrowed');
    err(() => deleteStudent(db, stu.id), 'borrowed');
    err(() => saveBook(db, { title: 'Clean Code', author: 'R. Martin', isbn: '9780132350884', copies: 1 }, book.id), 'cannot be less');
  });
  test('records survive book deletion', () => {
    const { db, book, stu } = setup();
    const l = issueBook(db, stu.id, book.id, D);
    returnBook(db, l.id, '2026-10-02');
    deleteBook(db, book.id);
    ok(db.loans[0].bookTitle === 'Clean Code' && db.loans.length === 1);
  });
  test('date helper crosses month and year ends', () => {
    ok(addDays('2026-12-25', 14) === '2027-01-08');
    ok(addDays('2028-02-20', 10) === '2028-03-01');
  });
  return res;
}

/* ---------- 3. SCREEN (browser only) ---------- */
if (typeof document !== 'undefined') {
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)) || newDb(); } catch { db = newDb(); }

  const $ = i => document.getElementById(i);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tag = (t, c) => `<span class="tag ${c}">${esc(t)}</span>`;
  const btn = (d, i, label, cls = '') => `<button class="${cls}" data-do="${d}" data-id="${i}">${label}</button>`;
  const opts = (first, items) => `<option value="">${first}</option>` + items.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('');
  const table = (head, rows) => `<thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>` +
    (rows.join('') || `<tr><td class="empty" colspan="${head.length}">Nothing here yet.</td></tr>`) + '</tbody>';
  const keep = (sel, html) => { const o = sel.value; sel.innerHTML = html; if ([...sel.options].some(x => x.value === o)) sel.value = o; };

  const msg = (t, bad) => {
    $('message').innerHTML = `<div class="${bad ? 'bad' : ''}">${esc(t)}</div>`;
    setTimeout(() => { $('message').innerHTML = ''; }, 4000);
  };

  // run a change -> save -> redraw. If a rule blocks it, show why.
  const act = (fn, okText) => {
    try {
      fn();
      localStorage.setItem(KEY, JSON.stringify(db));
      render();
      if (okText) msg(okText);
      return true;
    } catch (e) { msg(e.message, true); return false; }
  };

  // tabs
  document.querySelector('nav').onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    document.querySelectorAll('nav button').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('main section').forEach(s => { s.hidden = s.id !== b.dataset.tab; });
  };

  // book + student forms share the same code
  const savers = { book: saveBook, student: saveStudent };
  for (const k in savers) {
    const f = $(k + '-form'), Name = k[0].toUpperCase() + k.slice(1);
    const reset = () => { f.reset(); f.elements.id.value = ''; $(k + '-submit').textContent = 'Add ' + k; $(k + '-cancel').hidden = true; };
    f.onsubmit = e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f)), editing = d.id || null;
      if (act(() => savers[k](db, d, editing), `${Name} ${editing ? 'updated' : 'added'}.`)) reset();
    };
    $(k + '-cancel').onclick = reset;
  }
  const edit = (k, o) => {   // fill the form with an existing row
    for (const x in o) $(k + '-form').elements[x].value = o[x];
    $(k + '-submit').textContent = 'Update ' + k;
    $(k + '-cancel').hidden = false;
  };

  const renderBooks = () => $('book-table').innerHTML = table(['ID', 'Title', 'Author', 'ISBN', 'Available', ''],
    db.books.map(b => {
      const n = copiesLeft(db, b.id);
      return `<tr><td>${b.id}</td><td>${esc(b.title)}</td><td>${esc(b.author)}</td><td>${b.isbn}</td>` +
        `<td>${tag(n + ' / ' + b.copies, n ? 'green' : 'red')}</td>` +
        `<td>${btn('edit-book', b.id, 'Edit')}${btn('del-book', b.id, 'Delete', 'danger')}</td></tr>`;
    }));

  const renderStudents = () => $('student-table').innerHTML = table(['Roll', 'Name', 'Department', 'Borrowed', 'Fine due', ''],
    db.students.map(s => {
      const n = openLoans(db).filter(l => l.studentId === s.id).length, fine = unpaid(db, s.id);
      return `<tr><td>${esc(s.roll)}</td><td>${esc(s.name)}</td><td>${esc(s.department)}</td>` +
        `<td>${n} / ${MAX}</td><td>${fine ? tag('₹' + fine, 'orange') : '—'}</td>` +
        `<td>${btn('history', s.id, 'Records')}${btn('edit-student', s.id, 'Edit')}${btn('del-student', s.id, 'Delete', 'danger')}</td></tr>`;
    }));

  const loanHead = ['Student', 'Book', 'Issued', 'Due', 'Returned', 'Fine', 'Status', ''];
  const loanRow = l => {
    const now = today(), st = loanStatus(l, now);
    let fine = '—';
    if (st === 'overdue') fine = tag('₹' + diff(now, l.due) * FINE + ' so far', 'red');
    if (l.returned && l.fine) fine = tag('₹' + l.fine + (l.paid ? ' paid' : ' due'), l.paid ? 'green' : 'orange');
    const action = !l.returned ? btn('return', l.id, 'Return', 'primary')
      : l.fine && !l.paid ? btn('pay', l.id, 'Pay ₹' + l.fine, 'primary') : '';
    const stTag = { overdue: tag('Overdue', 'red'), borrowed: tag('Borrowed', 'blue'), returned: tag('Returned', 'green') }[st];
    return `<tr><td>${esc(l.studentName)} (${esc(l.roll)})</td><td>${esc(l.bookTitle)}</td><td>${l.issued}</td><td>${l.due}</td>` +
      `<td>${l.returned || '—'}</td><td>${fine}</td><td>${stTag}</td><td>${action}</td></tr>`;
  };

  const studentOpts = first => opts(first, db.students.map(s => [s.id, s.roll + ' — ' + s.name]));

  const renderIssue = () => {
    keep($('issue-student'), studentOpts('Select student…'));
    keep($('issue-book'), opts('Select book…', db.books.filter(b => copiesLeft(db, b.id) > 0)
      .map(b => [b.id, `${b.title} (${copiesLeft(db, b.id)} left)`])));
    $('open-table').innerHTML = table(loanHead, [...openLoans(db)].reverse().map(loanRow));
  };

  const renderRecords = () => {
    keep($('record-student'), studentOpts('All students'));
    const who = $('record-student').value;
    $('record-table').innerHTML = table(loanHead, db.loans.filter(l => !who || l.studentId === who).reverse().map(loanRow));
  };
  $('record-student').onchange = renderRecords;

  $('issue-form').onsubmit = e => {
    e.preventDefault();
    act(() => {
      const l = issueBook(db, $('issue-student').value, $('issue-book').value, today());
      msg(`Issued "${l.bookTitle}" to ${l.studentName}. Due ${l.due}.`);
    });
  };

  // every button inside a table is handled here, picked by its data-do
  const find = (list, i) => db[list].find(x => x.id === i);
  document.onclick = e => {
    const b = e.target.closest('[data-do]');
    if (!b) return;
    const i = b.dataset.id;
    ({
      'edit-book': () => edit('book', find('books', i)),
      'edit-student': () => edit('student', find('students', i)),
      'del-book': () => confirm('Delete this book? Past records are kept.') && act(() => deleteBook(db, i), 'Book deleted.'),
      'del-student': () => confirm('Delete this student? Past records are kept.') && act(() => deleteStudent(db, i), 'Student deleted.'),
      history: () => { $('record-student').value = i; renderRecords(); document.querySelector('[data-tab=records]').click(); },
      return: () => act(() => { const l = returnBook(db, i, today()); msg(l.fine ? 'Returned. Late fine: ₹' + l.fine + '.' : 'Returned. No fine.'); }),
      pay: () => act(() => payFine(db, i), 'Fine marked as paid.')
    })[b.dataset.do]();
  };

  $('run-tests').onclick = () => {
    const r = runTests(), p = r.filter(x => x.ok).length;
    $('test-results').innerHTML = `<li><b>${p} / ${r.length} tests passed</b></li>` +
      r.map(x => `<li class="${x.ok ? 'pass' : 'fail'}">${x.ok ? '✓ ' : '✗ '}${esc(x.name)}${x.ok ? '' : ' — ' + esc(x.error)}</li>`).join('');
  };

  function render() {
    $('today').textContent = 'Today: ' + today();
    renderBooks(); renderStudents(); renderIssue(); renderRecords();
  }
  render();
}

if (typeof module !== 'undefined') module.exports = { runTests };