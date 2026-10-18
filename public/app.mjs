import { cleanCandidate, cleanComparison, summarize, STORAGE_KEY, CATEGORIES } from './core.mjs';

const $ = selector => document.querySelector(selector);
const MAX_BYTES = 8 * 1024 * 1024;
const replayRequested = new URLSearchParams(globalThis.location?.search || '').get('replay') === '1';
const runtime = { live: false, replay: false, replayManifest: null, token: '', source: null, sourceUrl: null, busy: false, candidates: [] };
let board = cleanComparison({ currency: 'USD', budget: null, candidates: [cleanCandidate(), cleanCandidate()] });
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const restored = cleanComparison(JSON.parse(saved));
    if (restored.candidates.length >= 2) {
      board = restored;
      $('#save-status').textContent = 'Saved notes restored. Choose photos again to try on.';
    }
  }
} catch { $('#save-status').textContent = 'Saved notes could not be read. This page still works without storage.'; }

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function message(text) { $('#global-message').textContent = text; }
function money(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: board.currency, maximumFractionDigits: board.currency === 'KRW' ? 0 : 2 }).format(value);
}
function readPrice(value) {
  return value.trim() && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100000000 ? Number(value) : null;
}
function updateSummary() {
  const result = summarize(board);
  for (const candidate of runtime.candidates) {
    if (candidate.nameDisplay) candidate.nameDisplay.textContent = candidate.data.name || 'Untitled piece';
    if (candidate.priceDisplay) candidate.priceDisplay.textContent = candidate.data.price === null ? 'Add a price' : money(candidate.data.price);
  }
  $('#board-summary').textContent = result.priced
    ? `${result.priced} priced ${result.priced === 1 ? 'piece' : 'pieces'} · Lowest price ${money(result.cheapest)} · ${result.shortlisted} shortlisted${board.budget === null ? '' : ` · ${result.overBudget} above your budget`}`
    : 'Add prices, then use your notes to decide what belongs on the shortlist.';
  $('#add-item').disabled = board.candidates.length >= 3 || runtime.busy;
}
function updateButtons() {
  for (const candidate of runtime.candidates) {
    candidate.button.disabled = !(runtime.live || runtime.replay) || runtime.busy || !runtime.source || !candidate.file || !$('#upload-consent').checked;
    if (runtime.replay) candidate.button.textContent = 'View recorded try-on';
    candidate.photoInput.disabled = runtime.busy;
    candidate.categoryInput.disabled = runtime.busy;
  }
  $('#person-file').disabled = runtime.busy;
  $('#clear-board').disabled = runtime.busy;
  updateSummary();
}
function showPreview(container, url, alt) {
  container.replaceChildren();
  const image = element('img');
  image.src = url;
  image.alt = alt;
  container.append(image);
}
function clearResult(candidate, text = 'No AI result yet. Your garment preview is not a try-on.') {
  candidate.taskId = null;
  candidate.article?.classList.toggle('has-result', false);
  candidate.result.replaceChildren(element('span', '', 'Your generated try-on will appear here.'));
  candidate.result.setAttribute('data-result-kind', 'empty');
  candidate.status.textContent = text;
  candidate.button.textContent = runtime.replay ? 'View recorded try-on' : 'Generate try-on';
}
async function validateFile(file) {
  if (!file || !['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Choose a JPEG or PNG image.');
  if (file.size === 0 || file.size > MAX_BYTES) throw new Error('Each photo must be at most 8 MiB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const min = Math.min(image.naturalWidth, image.naturalHeight);
    const max = Math.max(image.naturalWidth, image.naturalHeight);
    if (min < 384 || max < 512 || max > 4096) throw new Error('Use at least 512 × 384 pixels, with no side above 4096 pixels.');
  } catch (error) { URL.revokeObjectURL(url); throw error; }
  return url;
}
function encodedFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ mime: file.type, base64: String(reader.result).split(',')[1] });
    reader.onerror = () => reject(new Error('The photo could not be read.'));
    reader.readAsDataURL(file);
  });
}
async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', 'X-App-Token': runtime.token, ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || 'The local request failed.');
  return body;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(candidate) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (attempt > 0) await pause(10000);
    const result = await request(`/api/tasks/${encodeURIComponent(candidate.taskId)}`);
    if (result.status === 'success') {
      const image = element('img');
      image.src = result.imageUrl;
      image.alt = `YouCam generated try-on for ${candidate.data.name || 'this piece'}`;
      let decodeTimeout;
      try {
        await Promise.race([
          image.decode(),
          new Promise((_, reject) => {
            decodeTimeout = setTimeout(() => reject(new Error('Image decoding timed out.')), 20000);
          })
        ]);
      }
      catch { throw new Error('The generated image could not be loaded. Use “Check existing task” to retry loading this result without creating another try-on.'); }
      finally { clearTimeout(decodeTimeout); }
      candidate.result.replaceChildren(image);
      candidate.result.setAttribute('data-result-kind', 'live');
      candidate.article?.classList.add('has-result');
      candidate.status.textContent = 'Generated by YouCam. Assess appearance only; size and physical fit remain unverified.';
      candidate.button.textContent = 'Try again (uses units)';
      candidate.taskId = null;
      return;
    }
    if (result.status === 'error') {
      candidate.taskId = null;
      candidate.button.textContent = 'Try again (uses units)';
      throw new Error(result.message);
    }
    candidate.status.textContent = `YouCam is processing this try-on. Checking every 10 seconds (${attempt + 1}/30).`;
  }
  candidate.status.textContent = 'Still processing. Use “Check existing task” to query this task without creating another one.';
  candidate.button.textContent = 'Check existing task';
}
async function generate(candidate) {
  if (runtime.busy || !(runtime.live || runtime.replay) || !runtime.source || !candidate.file || !$('#upload-consent').checked) return;
  runtime.busy = true;
  message('');
  updateButtons();
  try {
    if (runtime.replay) {
      await showRecordedResult(candidate);
      return;
    }
    if (!candidate.taskId) {
      clearResult(candidate, 'Sending the selected photos to YouCam…');
      const source = await encodedFile(runtime.source);
      const garment = await encodedFile(candidate.file);
      const result = await request('/api/tryon', { method: 'POST', body: JSON.stringify({ consent: true, source, garment, category: candidate.data.category }) });
      candidate.taskId = result.taskId;
      candidate.status.textContent = 'Task created. Waiting for the actual YouCam result…';
    }
    await poll(candidate);
  } catch (error) {
    candidate.status.textContent = error.message;
    if (candidate.taskId) candidate.button.textContent = 'Check existing task';
    message(runtime.replay ? 'No generation was requested. This recorded example only supports its original input files.' : 'This attempt did not produce a verified result. Check the provider console before creating another task.');
  } finally { runtime.busy = false; updateButtons(); }
}
async function fingerprint(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}
async function showRecordedResult(candidate) {
  const manifest = runtime.replayManifest;
  const sourceHash = await fingerprint(runtime.source);
  const garmentHash = await fingerprint(candidate.file);
  const recorded = manifest.candidates.find(item => item.garment.sha256 === garmentHash);
  if (sourceHash !== manifest.person.sha256 || !recorded || candidate.data.category !== 'upper_body') {
    clearResult(candidate, 'This recorded result belongs to the original demo photos. Open the recorded example to view it.');
    throw new Error('The selected photos do not match the recorded example. No photos were uploaded.');
  }
  const image = element('img');
  image.src = recorded.result.url;
  image.alt = `Previously generated real YouCam result: ${recorded.name}`;
  await image.decode();
  candidate.result.replaceChildren(image);
  candidate.result.setAttribute('data-result-kind', 'recorded');
  candidate.article.classList.add('has-result');
  candidate.status.textContent = 'Recorded YouCam result · 18 Oct 2026. No new generation. Details and physical fit can differ.';
  candidate.taskId = null;
}
async function setPerson(file) {
  const url = await validateFile(file);
  if (runtime.sourceUrl) URL.revokeObjectURL(runtime.sourceUrl);
  runtime.source = file;
  runtime.sourceUrl = url;
  showPreview($('#person-preview'), url, 'Local preview of your person photo');
  runtime.candidates.forEach(candidate => clearResult(candidate));
  message('Your photo is previewed locally. No upload has taken place.');
}
async function setGarment(candidate, file) {
  const url = await validateFile(file);
  if (candidate.fileUrl) URL.revokeObjectURL(candidate.fileUrl);
  candidate.file = file;
  candidate.fileUrl = url;
  showPreview(candidate.article.querySelector('.product-preview'), url, 'Local garment photo');
  clearResult(candidate);
  message('Garment preview loaded locally. No photo was uploaded.');
}
async function loadRecordedExample() {
  if (!runtime.replay || runtime.busy) return;
  runtime.busy = true;
  updateButtons();
  try {
    const manifest = runtime.replayManifest;
    const localFile = async (entry, name) => {
      const response = await fetch(entry.url);
      if (!response.ok) throw new Error('The recorded demo file is unavailable.');
      const file = new File([await response.blob()], name, { type: 'image/png' });
      if (await fingerprint(file) !== entry.sha256) throw new Error('A recorded input file has changed.');
      return file;
    };
    for (const prior of runtime.candidates) if (prior.fileUrl) URL.revokeObjectURL(prior.fileUrl);
    board = cleanComparison({ currency: 'KRW', budget: 50000, candidates: manifest.candidates.map(item => ({name:item.name, price:item.price, category:'upper_body', wardrobe:item.wardrobe, preference:item.preference, decision:item.decision})) });
    runtime.candidates = [];
    render();
    $('#currency').value = board.currency;
    $('#budget').value = board.budget;
    const personFile = await localFile(manifest.person, 'fictional-person.png');
    const personTransfer = new DataTransfer(); personTransfer.items.add(personFile);
    $('#person-file').files = personTransfer.files;
    await setPerson(personFile);
    for (let index=0; index<runtime.candidates.length; index++) {
      const candidate = runtime.candidates[index];
      const garmentFile = await localFile(manifest.candidates[index].garment, `demo-garment-${index+1}.png`);
      const garmentTransfer = new DataTransfer(); garmentTransfer.items.add(garmentFile);
      candidate.photoInput.files = garmentTransfer.files;
      await setGarment(candidate, garmentFile);
      await showRecordedResult(candidate);
    }
    // Viewing already-created local assets requires no provider upload consent.
    // Users can still test the checkbox gate before displaying a result again.
    $('#upload-consent').checked = true;
    $('#save-status').textContent = 'Recorded example opened. Saved browser notes have not been replaced.';
    message('Original fictional inputs and two real YouCam results from 18 Oct 2026. No new generation or units.');
  } catch (error) { message(error.message); }
  finally { runtime.busy = false; updateButtons(); }
}
function field(label, control) {
  const wrap = element('label', 'field', label);
  wrap.append(control);
  return wrap;
}
function input(type, value, onChange) {
  const node = element('input');
  node.type = type;
  node.value = value ?? '';
  node.addEventListener('input', () => { onChange(node.value); updateSummary(); });
  return node;
}
function select(values, selected, onChange) {
  const node = element('select');
  for (const [value, label] of values) {
    const option = element('option', '', label);
    option.value = value;
    option.selected = String(value) === String(selected);
    node.append(option);
  }
  node.addEventListener('change', () => { onChange(node.value); updateSummary(); });
  return node;
}
function createCandidate(data, index) {
  const candidate = { data, file: null, fileUrl: null, taskId: null };
  const article = element('article', 'candidate');
  article.id = `piece-${index+1}`;
  const header = element('div', 'candidate-header');
  header.append(element('strong', '', `PIECE ${String(index + 1).padStart(2, '0')}`));
  const body = element('div', 'candidate-body');
  const preview = element('div', 'product-preview preview');
  preview.append(element('span', '', 'Garment\nphoto'));
  const photo = element('input', 'garment-file');
  photo.type = 'file';
  photo.accept = 'image/jpeg,image/png';
  photo.setAttribute('aria-label', `Garment photo for piece ${index + 1}`);
  candidate.photoInput = photo;
  photo.addEventListener('change', async () => {
    const file = photo.files[0];
    if (!file) return;
    try {
      await setGarment(candidate, file);
    } catch (error) { photo.value = ''; message(error.message); }
    updateButtons();
  });
  const fields = element('div', 'candidate-fields');
  const name = input('text', data.name, value => { data.name = value; });
  name.maxLength = 80;
  name.placeholder = 'e.g. Linen overshirt';
  const price = input('number', data.price, value => { data.price = readPrice(value); });
  price.min = '0'; price.max = '100000000'; price.step = '.01'; price.placeholder = '0.00';
  fields.append(field('Product name', name), field('Price', price));
  const category = select(CATEGORIES.map(value => [value, ({ upper_body: 'Upper body', outer: 'Outerwear', full_body: 'Full body', lower_body: 'Lower body', shoes: 'Shoes', auto: 'Auto detect' })[value]]), data.category, value => { data.category = value; clearResult(candidate); });
  candidate.categoryInput = category;
  category.setAttribute('aria-label', `Garment category for piece ${index + 1}`);
  const wardrobe = input('text', data.wardrobe, value => { data.wardrobe = value; });
  wardrobe.maxLength = 180;
  wardrobe.placeholder = 'e.g. Works with my navy trousers';
  const rating = select([1, 2, 3, 4, 5].map(value => [value, `${value} / 5`]), data.preference, value => { data.preference = Number(value); });
  rating.className = 'preference-choice';
  const decision = select([['undecided', 'Undecided'], ['shortlist', 'Shortlist'], ['skip', 'Skip']], data.decision, value => { data.decision = value; });
  decision.className = 'decision-choice';
  const decisionRow = element('div', 'decision-row');
  decisionRow.append(field('Your decision', decision));
  const caption = element('div', 'product-caption');
  candidate.nameDisplay = element('h3', 'product-name', data.name || 'Untitled piece');
  candidate.priceDisplay = element('p', 'product-price', data.price === null ? 'Add a price' : money(data.price));
  caption.append(candidate.nameDisplay, candidate.priceDisplay);
  const resultLabel = element('div', 'result-label');
  resultLabel.append(element('span', '', 'VIRTUAL TRY-ON'), element('span', '', 'YOUCAM API'));
  candidate.result = element('div', 'result-preview preview');
  candidate.status = element('p', 'result-status');
  candidate.status.setAttribute('role', 'status');
  candidate.button = element('button', 'button generate', 'Generate try-on');
  candidate.button.type = 'button';
  candidate.button.addEventListener('click', () => generate(candidate));
  const source = element('div', 'garment-source');
  source.append(preview, field('Garment image', photo));
  const edits = element('details', 'piece-details');
  edits.open = !data.name;
  edits.append(element('summary', '', 'Edit details'), fields, source, field('Garment category', category), field('Wardrobe match / reason', wardrobe), field('Your preference', rating));
  body.append(candidate.result, resultLabel, candidate.status, caption, decisionRow, candidate.button, edits);
  article.append(header, body);
  clearResult(candidate);
  candidate.article = article;
  return candidate;
}
function render() {
  // Called when starting a new board or adding an item. Existing photos are restored below.
  const old = runtime.candidates;
  runtime.candidates = board.candidates.map(createCandidate);
  runtime.candidates.forEach((candidate, index) => {
    const prior = old[index];
    if (prior?.file) {
      candidate.file = prior.file;
      candidate.fileUrl = prior.fileUrl;
      showPreview(candidate.article.querySelector('.product-preview'), prior.fileUrl, `Local garment photo for piece ${index + 1}`);
    }
  });
  $('#candidate-grid').classList.toggle('three', board.candidates.length === 3);
  $('#candidate-grid').replaceChildren(...runtime.candidates.map(item => item.article));
  updateButtons();
}

$('#currency').value = board.currency;
$('#budget').value = board.budget ?? '';
$('#currency').addEventListener('change', event => { board.currency = event.target.value; updateSummary(); });
$('#budget').addEventListener('input', event => { board.budget = readPrice(event.target.value); updateSummary(); });
$('#upload-consent').addEventListener('change', updateButtons);
$('#person-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    await setPerson(file);
  } catch (error) { event.target.value = ''; message(error.message); }
  updateButtons();
});
$('#add-item').addEventListener('click', () => {
  if (board.candidates.length >= 3 || runtime.busy) return;
  const data = cleanCandidate();
  board.candidates.push(data);
  const candidate = createCandidate(data, board.candidates.length - 1);
  runtime.candidates.push(candidate);
  $('#candidate-grid').append(candidate.article);
  $('#candidate-grid').classList.add('three');
  updateButtons();
});
$('#save-board').addEventListener('click', () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanComparison(board)));
    $('#save-status').textContent = 'Saved on this browser. Photos and generated image links were excluded.';
  } catch { $('#save-status').textContent = 'This browser could not save the comparison. Your current board is still available in this page.'; }
});
$('#clear-board').addEventListener('click', () => {
  if (runtime.busy) return;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* UI still clears when browser storage is blocked. */ }
  if (runtime.sourceUrl) URL.revokeObjectURL(runtime.sourceUrl);
  runtime.candidates.forEach(candidate => { if (candidate.fileUrl) URL.revokeObjectURL(candidate.fileUrl); });
  runtime.candidates = [];
  runtime.source = null;
  runtime.sourceUrl = null;
  board = cleanComparison({ currency: 'USD', candidates: [cleanCandidate(), cleanCandidate()] });
  $('#currency').value = board.currency;
  $('#budget').value = '';
  $('#person-file').value = '';
  $('#upload-consent').checked = false;
  $('#person-preview').replaceChildren(element('span', '', 'Your photo stays in this page\nuntil you choose to generate.'));
  $('#save-status').textContent = 'The current board and local saved notes were cleared. This does not delete provider files.';
  render();
});
render();
try {
  if (replayRequested) {
    const response = await fetch('/demo-manifest.json');
    if (!response.ok) throw new Error('Recorded demo unavailable');
    runtime.replayManifest = await response.json();
    runtime.replay = true;
    document.body.classList.add('replay-mode');
    $('#replay-banner').hidden = false;
    $('#load-replay-example').hidden = false;
    $('#load-replay-example').addEventListener('click', loadRecordedExample);
    $('#consent-title').textContent = 'Recorded comparison';
    $('#consent-copy').textContent = 'Display the saved result for matching demo photos. This mode stays on this PC and does not generate or upload.';
    $('#connection-status').textContent = 'Original fictional model and garments. Prices are examples.';
    if (!localStorage.getItem(STORAGE_KEY)) await loadRecordedExample();
  } else {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error('Unavailable');
  const config = await response.json();
  runtime.live = config.live === true;
  runtime.token = config.token;
  $('#connection-status').textContent = runtime.live ? 'Live try-on. New generations send photos to YouCam and use API units.' : 'Photo previews and notes are available. Live generation is off.';
  $('#connection-status').classList.toggle('live', runtime.live);
  }
} catch { $('#connection-status').textContent = 'Local connection unavailable. Product comparison and local previews still work.'; }
updateButtons();
