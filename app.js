const state = {
  view: 'explore', category: 'All topics', search: '', sort: 'newest', layout: 'grid',
  user: null, documents: [], uploads: [], settings: {},
  adminTab: 'overview', adminDocFilter: 'pending', adminReportFilter: 'open', adminSearch: '', admin: null, pendingView: null,
};
const API_BASE_URL = String(window.STUDYPOINT_API_URL || '').replace(/\/$/, '');

const root = document.getElementById('view-root');
const modalBackdrop = document.getElementById('modal-backdrop');
const modal = document.getElementById('modal');
const toastEl = document.getElementById('toast');
let toastTimer;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include', ...options });
  const type = response.headers.get('content-type') || '';
  const body = type.includes('application/json') ? await response.json() : await response.blob();
  if (!response.ok) throw new Error(type.includes('application/json') ? body.error : `Request failed (${response.status}).`);
  return { response, body };
}

async function refreshData() {
  const {body} = await api('/api/bootstrap');
  state.user = body.user;
  state.documents = body.documents;
  state.uploads = body.uploads || [];
  state.settings = body.settings;
  const currentUrl = new URL(window.location.href);
  const paymentRef = currentUrl.searchParams.get('reference');
  if (currentUrl.searchParams.get('payment') === 'return' && paymentRef && state.user) {
    try {
      const {body: payment} = await api('/api/payments/verify', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({reference:paymentRef})});
      state.user.credits = payment.credits;
      showToast('Payment confirmed. One credit has been added.');
    } catch (error) { showToast(error.message); }
    currentUrl.searchParams.delete('payment'); currentUrl.searchParams.delete('reference'); currentUrl.searchParams.delete('trxref');
    history.replaceState({}, '', currentUrl);
  } else if (currentUrl.searchParams.get('payment') === 'cancelled') {
    currentUrl.searchParams.delete('payment'); history.replaceState({}, '', currentUrl);
    showToast('Checkout was cancelled. No credit was added.');
  }
  updateHeader();
  if (state.view === 'admin' && state.user?.role !== 'admin') state.view = 'explore';
  render();
}

function updateHeader() {
  const initials = state.user?.name.split(/\s+/).map(part => part[0]).join('').slice(0,2).toUpperCase() || '–';
  document.getElementById('credit-count').textContent = state.user?.credits ?? 0;
  document.getElementById('library-count').textContent = state.user ? new Set([...state.user.savedIds,...state.user.downloadedIds]).size : 0;
  document.getElementById('crumb-label').textContent = ({explore:'Explore',library:'My library',contribute:'Contribute',admin:'Admin'})[state.view] || 'Explore';
  document.getElementById('profile-button').textContent = initials;
  document.getElementById('sidebar-avatar').textContent = initials;
  document.getElementById('sidebar-name').textContent = state.user?.name || 'Sign in';
  document.getElementById('sidebar-role').textContent = state.user?.role === 'admin' ? 'Administrator' : state.user?.email || 'Create an account';
  document.getElementById('admin-nav').hidden = state.user?.role !== 'admin';
  document.getElementById('copyright-year').textContent = new Date().getFullYear();
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

function openModal(content) {
  modal.innerHTML = content;
  if(!modal.querySelector('.modal-close'))modal.insertAdjacentHTML('afterbegin','<button class="modal-close" aria-label="Close">×</button>');
  modalBackdrop.classList.add('open');
  modalBackdrop.setAttribute('aria-hidden','false');
  document.body.style.overflow = 'hidden';
  modal.querySelector('.modal-close')?.addEventListener('click',closeModal);
}

function closeModal() {
  modalBackdrop.classList.remove('open');
  modalBackdrop.setAttribute('aria-hidden','true');
  document.body.style.overflow = '';
}

function getDoc(id) { return state.documents.find(doc => doc.id === id) || state.uploads.find(doc => doc.id === id); }
function allDocs() { return [...state.documents,...state.uploads]; }
function isSaved(id) { return state.user?.savedIds.includes(id) || false; }
function isDownloaded(id) { return state.user?.downloadedIds.includes(id) || false; }
function cardClass() { return `document-grid ${state.layout === 'list' ? 'list-view' : ''}`; }

function coverHtml(doc) {
  return `<div class="cover cover-${escapeHtml(doc.cover || 'mint')}"><div class="cover-paper"><div class="paper-kicker">${escapeHtml(doc.category || 'Study notes')}</div><div class="paper-title">${escapeHtml(doc.shortTitle || doc.title)}</div><div class="paper-line"></div></div><div class="doc-type">${escapeHtml(doc.format || 'PDF')}</div></div>`;
}

function cardHtml(doc) {
  return `<article class="doc-card" data-open-doc="${escapeHtml(doc.id)}" tabindex="0" role="button" aria-label="Open ${escapeHtml(doc.title)}">
    ${coverHtml(doc)}<div class="doc-content"><div class="doc-meta-top"><span class="doc-category">${escapeHtml(doc.category)}</span><span class="doc-pages">${doc.pages || '—'} pages</span></div>
    <h3 class="doc-title" title="${escapeHtml(doc.title)}">${escapeHtml(doc.title)}</h3><p class="doc-desc">${escapeHtml(doc.description)}</p>
    <div class="doc-footer"><div class="uploader"><span class="uploader-avatar">${escapeHtml(doc.initials)}</span><span>${escapeHtml(doc.author)}</span></div>
    <button class="doc-download" data-download="${escapeHtml(doc.id)}">${isDownloaded(doc.id) ? 'Download again' : 'Preview & download'} <span>↓</span></button></div></div></article>`;
}

function filteredDocs(docs) {
  const query = state.search.trim().toLowerCase();
  let filtered = docs.filter(doc => (state.category === 'All topics' || doc.category === state.category) &&
    (!query || `${doc.title} ${doc.category} ${doc.description} ${doc.author}`.toLowerCase().includes(query)));
  if (state.sort === 'title') filtered = filtered.sort((a,b) => a.title.localeCompare(b.title));
  if (state.sort === 'pages') filtered = filtered.sort((a,b) => (a.pages || 0) - (b.pages || 0));
  if (state.sort === 'newest') filtered = filtered.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return filtered;
}

function renderExplore() {
  const visible = filteredDocs([...state.documents]);
  root.innerHTML = `<div class="page-wrap"><section class="hero-row"><div class="hero-copy"><div class="eyebrow"><span></span> YOUR NEXT GOOD IDEA IS HERE</div>
    <h1>Find notes that move you forward.</h1><p>Discover useful study guides, class notes, and practical knowledge shared by learners like you.</p>
    <label class="searchbar"><svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg><input id="search-input" aria-label="Search subjects, topics, or keywords" value="${escapeHtml(state.search)}" /><span class="search-shortcut">Ctrl K</span></label></div>
    <aside class="welcome-card"><div class="welcome-orb"></div><div class="welcome-label">A BETTER WAY TO STUDY</div><h2>Good notes make hard things clearer.</h2><p>Save a guide for later or share something that helped you.</p><button data-view="contribute">Share your knowledge <span>↗</span></button><div class="welcome-art"><div class="book-card"><div class="book-spine"></div><div class="book-sun"></div></div></div></aside></section>
    <section class="catalog-top"><div><div class="section-eyebrow">THE COMMUNITY LIBRARY</div><h2 class="section-title">Explore documents</h2><div class="catalog-count">${visible.length} published ${visible.length===1?'document':'documents'}</div></div>
      <div class="catalog-controls"><select class="sort-select" id="sort-select" aria-label="Sort documents"><option value="newest" ${state.sort==='newest'?'selected':''}>Newest</option><option value="title" ${state.sort==='title'?'selected':''}>Title A–Z</option><option value="pages" ${state.sort==='pages'?'selected':''}>Page count</option></select>
        <div class="view-toggle"><button class="${state.layout==='grid'?'active':''}" data-layout="grid" aria-label="Grid view">▦</button><button class="${state.layout==='list'?'active':''}" data-layout="list" aria-label="List view">☰</button></div></div></section>
    <div class="filter-row">${['All topics','Business','Science','Technology','Humanities'].map(cat=>`<button class="filter-chip ${state.category===cat?'active':''}" data-category="${cat}">${cat}</button>`).join('')}</div>
    <section class="${cardClass()}">${visible.length?visible.map(cardHtml).join(''):state.documents.length?`<div class="empty-state"><strong>No documents found</strong>Try another search or choose a different topic.</div>`:`<div class="empty-state"><strong>No published documents yet</strong><span>Approved contributions will appear here.</span><br /><button class="btn-primary" data-view="contribute">Contribute a document</button></div>`}</section></div>`;
  const search = document.getElementById('search-input');
  search.addEventListener('input',()=>{const caret=search.selectionStart;state.search=search.value;renderExplore();const next=document.getElementById('search-input');next.focus();next.setSelectionRange(caret,caret);});
  document.getElementById('sort-select').addEventListener('change',event=>{state.sort=event.target.value;renderExplore();});
}

function renderLibrary() {
  const ids = new Set([...state.user.savedIds,...state.user.downloadedIds]);
  const owned = state.documents.filter(doc=>ids.has(doc.id));
  const visible = filteredDocs(owned);
  root.innerHTML = `<div class="page-wrap"><div class="eyebrow"><span></span> YOUR PERSONAL STUDY SPACE</div><h1 style="margin-top:13px">My library.</h1>
    <p style="font-size:12px;line-height:1.7;color:#818c84;max-width:530px;margin-bottom:0">Keep your saved and downloaded documents together so your next study session is ready when you are.</p>
    <div class="library-intro"><span style="font-size:17px;color:#63866a">✦</span><span><b>Good to know</b> — downloading uses one credit. Saving a document keeps it in your library without using a credit.</span></div>
    <div class="library-toolbar"><input id="library-search" aria-label="Search your library" value="${escapeHtml(state.search)}" /><button class="btn-secondary" id="back-explore">Explore more</button></div>
    ${owned.length?`<section class="${cardClass()}">${visible.length?visible.map(cardHtml).join(''):`<div class="empty-state">No matching documents in your library.</div>`}</section>`:
    `<div class="library-empty"><div class="empty-icon">▤</div><h3>Your library is ready for its first document.</h3><p>Save or download a guide from Explore to see it here.</p><button class="btn-primary" data-view="explore">Explore documents</button></div>`}</div>`;
  document.getElementById('library-search').addEventListener('input',event=>{const caret=event.target.selectionStart;state.search=event.target.value;renderLibrary();const next=document.getElementById('library-search');next.focus();next.setSelectionRange(caret,caret);});
  document.getElementById('back-explore')?.addEventListener('click',()=>setView('explore'));
}

function renderContribute() {
  const pending=state.uploads.filter(doc=>doc.status==='pending'),approved=state.uploads.filter(doc=>doc.status==='approved'),rejected=state.uploads.filter(doc=>doc.status==='rejected');
  const count=state.user.contributionCount||0,threshold=state.settings.rewardUploadCount||3,progress=count%threshold,until=threshold-progress;
  const uploadsDisabled=!state.settings.uploadEnabled;
  root.innerHTML = `<div class="page-wrap contribute-page"><div class="contribute-heading"><div class="eyebrow"><span></span> SHARE WHAT YOU KNOW</div><h1>Good notes go further.</h1>
    <p>Contribute an original guide, your own class notes, or a resource you have permission to share. Every ${threshold} approved, unique uploads earn one download credit.</p></div>
    <div class="contribute-layout"><section class="panel"><h2 class="panel-title">Contribute a document</h2><p class="panel-caption">Add a clear title and tell learners what they’ll find inside.</p>
      ${uploadsDisabled?'<div class="empty-state">Uploads are temporarily paused by the StudyPoint team.</div>':`<form class="form-stack" id="upload-form"><div class="form-field"><label for="upload-title">Document title</label><input id="upload-title" name="title" maxlength="90" required /></div>
      <div class="form-field"><label for="upload-category">Subject</label><select id="upload-category" name="category" required><option value="">Choose a subject</option><option>Business</option><option>Science</option><option>Technology</option><option>Humanities</option><option>Other</option></select></div>
      <div class="form-field"><label for="upload-description">Short description</label><textarea id="upload-description" name="description" maxlength="180" required></textarea></div>
      <div class="file-drop"><span style="font-size:18px;color:#6e9878">↑</span><div><strong>Choose a document</strong><span>PDF, Word, PowerPoint, or text · up to 20 MB</span></div><input id="upload-file" name="file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt" required /></div>
      <label class="check-line"><input type="checkbox" name="rightsConfirmed" value="true" required /><span>I created this work or have permission to share it publicly, and it does not include private or sensitive information.</span></label>
      <button class="btn-primary" type="submit">Submit for review <span style="padding-left:10px">↗</span></button></form>`}
      <div class="upload-disclaimer">Uploads are saved on this local server. Approved contributions earn credits; pending or rejected documents do not.</div>
      ${state.uploads.length?`<div class="upload-history"><h3>Your contributions · ${approved.length} approved · ${pending.length} pending · ${rejected.length} declined</h3>${state.uploads.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,6).map(doc=>`<div class="upload-row"><span class="uploader-avatar">${escapeHtml(doc.initials||'A')}</span><span>${escapeHtml(doc.title)}</span><span class="status-${doc.status}">${doc.status==='approved'?'Approved':doc.status==='pending'?'In review':'Declined'}</span></div>`).join('')}</div>`:''}
    </section><aside class="panel contribute-side"><div class="section-eyebrow">YOUR CONTRIBUTION REWARD</div><h3>Turn good notes into credits.</h3>
      <div class="progress-card"><div class="progress-top"><span>Approved unique uploads</span><strong>${count} total</strong></div><div class="progress-track"><span style="width:${(progress/threshold)*100}%"></span></div><div class="progress-top" style="margin-top:9px"><span>${until===threshold?'Start your next reward':`${until} more to earn a credit`}</span><strong>${progress}/${threshold}</strong></div></div>
      <div class="reward-step"><span class="step-num">1</span><div><strong>Upload useful original work</strong><span>Choose a readable, well-labeled document you’re allowed to share.</span></div></div><div class="reward-step"><span class="step-num">2</span><div><strong>Pass review and duplicate checks</strong><span>We check for quality, rights, and existing copies.</span></div></div><div class="reward-step"><span class="step-num">3</span><div><strong>Earn one download credit</strong><span>Every ${threshold} approved documents unlock one credit.</span></div></div>
      <div class="rule-box"><strong>What makes a good contribution?</strong><br />Clear, helpful notes; no blank pages; no copied books or private records; and a license that allows public sharing.</div></aside></div></div>`;
  document.getElementById('upload-form')?.addEventListener('submit',submitUpload);
}

async function submitUpload(event) {
  event.preventDefault();
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]');
  button.disabled=true;button.textContent='Uploading…';
  try {const {body}=await api('/api/uploads',{method:'POST',body:new FormData(form)});await refreshData();showToast(body.message);}
  catch(error){showToast(error.message);button.disabled=false;button.innerHTML='Submit for review <span style="padding-left:10px">↗</span>';}
}

function render() {
  updateHeader();
  document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item.dataset.view===state.view));
  if(state.view==='explore')renderExplore();
  else if(state.view==='library')renderLibrary();
  else if(state.view==='contribute')renderContribute();
  else if(state.view==='admin')renderAdmin();
}

function setView(view) {
  if(view==='admin'&&state.user?.role!=='admin'){showToast('Admin access is required.');return;}
  if((view==='library'||view==='contribute')&&!state.user){state.pendingView=view;openAccount('login');return;}
  state.view=view;state.search='';state.category='All topics';render();window.scrollTo({top:0,behavior:'smooth'});
}

function openDocument(id) {
  const doc=getDoc(id);if(!doc)return;
  openModal(`<div class="modal-kicker">${escapeHtml(doc.category)} · ${doc.pages?`${doc.pages} pages`:'Page count unavailable'} · ${escapeHtml(doc.format||'File')}</div><h2 id="modal-title">${escapeHtml(doc.title)}</h2>
    <p class="modal-subtitle">Shared by ${escapeHtml(doc.author)} · ${escapeHtml(doc.description)}</p>
    <div class="reader-preview"><div class="preview-heading">Document preview</div><div id="document-preview">Loading preview…</div></div>
    <div class="modal-actions"><div class="modal-side-actions"><button class="btn-quiet" id="save-doc">${isSaved(id)?'✓ Saved':'＋ Save for later'}</button><button class="btn-quiet" id="report-doc">Report document</button></div><button class="btn-primary" id="download-doc">${isDownloaded(id)?'Download again':'Use 1 credit to download'} <span style="padding-left:8px">↓</span></button></div>`);
  api(`/api/documents/${encodeURIComponent(id)}/preview`).then(({body})=>{const preview=modal.querySelector('#document-preview');if(preview)preview.textContent=body.text||`Preview is unavailable for ${body.format||doc.format} files. The title and description above come from the contributor.`;}).catch(()=>{const preview=modal.querySelector('#document-preview');if(preview)preview.textContent='Preview could not be loaded.';});
  modal.querySelector('#save-doc').addEventListener('click',()=>state.user?toggleSaved(id):openAccount('login'));
  modal.querySelector('#report-doc').addEventListener('click',()=>state.user?openReport(id):openAccount('login'));
  modal.querySelector('#download-doc').addEventListener('click',()=>downloadDoc(id));
}

async function toggleSaved(id) {
  if(!state.user){openAccount('login');return;}
  try {const {body}=await api(`/api/documents/${encodeURIComponent(id)}/save`,{method:'POST'});state.user.savedIds=body.savedIds;updateHeader();if(state.view==='library')renderLibrary();if(modalBackdrop.classList.contains('open'))openDocument(id);showToast(state.user.savedIds.includes(id)?'Saved to your library.':'Removed from your library.');}
  catch(error){showToast(error.message);}
}

async function downloadDoc(id) {
  if(!state.user){openAccount('login');return;}
  try {
    const {response,body}=await api(`/api/documents/${encodeURIComponent(id)}/download`,{method:'POST'});
    state.user.credits=Number(response.headers.get('X-StudyPoint-Credits')||state.user.credits);
    if(!state.user.downloadedIds.includes(id))state.user.downloadedIds.push(id);
    updateHeader();const blob=body,url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download=decodeURIComponent(response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1]||`${id}.txt`);anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    closeModal();showToast('Your document download has started.');if(state.view==='library')renderLibrary();
  } catch(error) { if(error.message.includes('out of credits'))openCredits();else showToast(error.message); }
}

function openCredits() {
  if(!state.user){openAccount('login');return;}
  const price=Number(state.settings.pricePerCreditGhs),priceLabel=Number.isFinite(price)?`GH₵${price.toFixed(2)}`:'Price not configured';
  openModal(`<div class="modal-kicker">DOWNLOAD CREDITS</div><h2 id="modal-title">Continue learning.</h2><p class="modal-subtitle">You have <strong>${state.user.credits} credits</strong>. Each credit unlocks one document. Previously downloaded documents are available again without another credit.</p>
    <div class="plan-list"><div class="plan"><span><strong>One download credit</strong><small>Ghana cedi · Paystack checkout</small></span><span class="plan-price">${priceLabel}</span></div></div>
    ${state.settings.paymentEnabled?'<button class="btn-primary" id="paystack-checkout">Continue to Paystack</button>':'<div class="settings-warning">Checkout is unavailable until the server has a Paystack secret key.</div>'}`);
  modal.querySelector('#paystack-checkout')?.addEventListener('click',buyCredits);
}

async function buyCredits() {
  const button=modal.querySelector('#paystack-checkout');if(button){button.disabled=true;button.textContent='Opening Paystack…';}
  try {const {body}=await api('/api/payments/initialize',{method:'POST'});window.location.assign(body.authorizationUrl);}
  catch(error){showToast(error.message);if(button){button.disabled=false;button.textContent='Continue to Paystack';}}
}

function openReport(id) {
  const doc=getDoc(id);if(!doc)return;
  if(!state.user){openAccount('login');return;}
  openModal(`<div class="modal-kicker">HELP KEEP THE LIBRARY TRUSTWORTHY</div><h2 id="modal-title">Report this document</h2><p class="modal-subtitle">Tell the moderation team what needs attention: “${escapeHtml(doc.title)}”.</p><form id="report-form" class="form-stack"><div class="form-field"><label for="report-reason">Reason</label><select id="report-reason" required><option value="">Choose a reason</option><option>Copyright concern</option><option>Incorrect or misleading</option><option>Poor quality</option><option>Private information</option><option>Other</option></select></div><div class="form-field"><label for="report-details">More detail (optional)</label><textarea id="report-details" maxlength="600"></textarea></div><button class="btn-primary" type="submit">Send report</button></form>`);
  modal.querySelector('#report-form').addEventListener('submit',async event=>{event.preventDefault();const reason=document.getElementById('report-reason').value,details=document.getElementById('report-details').value;try{await api('/api/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({documentId:id,reason,details})});closeModal();showToast('Thanks. Your report was sent to moderation.');}catch(error){showToast(error.message);}});
}

function openAccount(mode='login') {
  if(state.user) {
    openModal(`<div class="modal-kicker">YOUR STUDYPOINT ACCOUNT</div><h2 id="modal-title">${escapeHtml(state.user.name)}</h2><p class="modal-subtitle">${escapeHtml(state.user.email)} · ${state.user.role==='admin'?'Administrator':'Member'} · ${state.user.credits} credits</p><div class="account-card"><span>Account type</span><strong>${state.user.role==='admin'?'Administrator':'Member account'}</strong></div><div class="modal-actions"><button class="btn-quiet" id="logout-button">Sign out</button>${state.user.role==='admin'?'<button class="btn-primary" data-view="admin">Open admin</button>':''}</div>`);
    modal.querySelector('#logout-button').addEventListener('click',logout);modal.querySelector('[data-view="admin"]')?.addEventListener('click',closeModal);return;
  }
  const register=mode==='register';
  openModal(`<div class="modal-kicker">${register?'CREATE YOUR FREE ACCOUNT':'WELCOME TO STUDYPOINT'}</div><h2 id="modal-title">${register?'Make your study space yours.':'Sign in to your study space.'}</h2><p class="modal-subtitle">${register?`Your account starts with ${state.settings.starterCredits||0} credits.`:'Access your credits, saved documents, and contributions.'}</p>
    <form id="account-form" class="form-stack">${register?'<div class="form-field"><label for="account-name">Your name</label><input id="account-name" name="name" maxlength="70" autocomplete="name" required /></div>':''}<div class="form-field"><label for="account-email">Email</label><input id="account-email" name="email" type="email" autocomplete="email" required /></div><div class="form-field"><label for="account-password">Password</label><input id="account-password" name="password" type="password" minlength="8" autocomplete="${register?'new-password':'current-password'}" required /></div><button class="btn-primary" type="submit">${register?'Create account':'Sign in'}</button></form>
    <p class="account-switch">${register?'Already have an account?':'New to StudyPoint?'} <button id="account-switch">${register?'Sign in':'Create an account'}</button></p>
    <div class="admin-sign-in-note"><strong>Administrator sign-in</strong><br />Use the configured administrator email and password.</div>`);
  modal.querySelector('#account-switch').addEventListener('click',()=>openAccount(register?'login':'register'));
  modal.querySelector('#account-form').addEventListener('submit',async event=>{event.preventDefault();const form=new FormData(event.currentTarget);const payload=Object.fromEntries(form.entries());try{const {body}=await api(register?'/api/auth/register':'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});closeModal();state.view=body.user.role==='admin'?'admin':(state.pendingView||'explore');state.pendingView=null;await refreshData();showToast(register?'Your account is ready.':'Welcome back.');}catch(error){showToast(error.message);}});
}

async function logout() { try{await api('/api/auth/logout',{method:'POST'});closeModal();state.view='explore';await refreshData();showToast('Signed out.');}catch(error){showToast(error.message);} }

function openAbout(guidelines=false) {
  const title=guidelines?'Community guidelines':'A community library for learning';
  const intro=guidelines?'Keep StudyPoint useful, respectful, and safe for learners.':'StudyPoint helps learners find useful notes and guides, then rewards contributors whose original work makes the library better.';
  openModal(`<div class="modal-kicker">${guidelines?'SHARE RESPONSIBLY':'ABOUT STUDYPOINT'}</div><h2 id="modal-title">${guidelines?'A few simple community rules.':'Knowledge grows when it’s shared.'}</h2><p class="modal-subtitle">${intro}</p><div class="about-list"><div class="about-item"><span class="about-icon">⌕</span><div><strong>${guidelines?'Share work you’re allowed to publish':'Discover with confidence'}</strong><span>${guidelines?'Upload work you created or have permission to make public. Don’t post copied books, private records, or personal data.':'Preview available text before downloading and see who shared each resource.'}</span></div></div><div class="about-item"><span class="about-icon">✦</span><div><strong>${guidelines?'Make it useful and accurate':'Credits that are easy to understand'}</strong><span>${guidelines?'Use a clear title and description. Report documents that are misleading, unsafe, or infringing.':'One credit unlocks one document. Three approved unique contributions earn one credit.'}</span></div></div><div class="about-item"><span class="about-icon">♡</span><div><strong>${guidelines?'Treat learners with respect':'Respect creators and learners'}</strong><span>${guidelines?'Keep comments and descriptions constructive. Moderators can reject or remove content that breaks these rules.':'Only share work you created or have permission to make public. Use Report document to flag a concern.'}</span></div></div></div>`);
}

async function fetchAdminData() {
  const [summary,documents,reports,users,transactions,settings]=await Promise.all([
    api('/api/admin/summary'),api('/api/admin/documents'),api('/api/admin/reports'),api('/api/admin/users'),api('/api/admin/transactions'),api('/api/admin/settings')
  ]);
  state.admin={summary:summary.body,documents:documents.body.documents,reports:reports.body.reports,users:users.body.users,transactions:transactions.body.transactions,settings:settings.body.settings};
}

function renderAdmin() {
  root.innerHTML='<div class="page-wrap admin-page"><div class="admin-loading">Loading admin workspace…</div></div>';
  fetchAdminData().then(()=>{if(state.view==='admin')renderAdminPage();}).catch(error=>{root.innerHTML=`<div class="page-wrap"><div class="admin-error">${escapeHtml(error.message)}</div></div>`;});
}

function renderAdminPage() {
  const admin=state.admin;if(!admin)return;
  const tab=state.adminTab;
  const tabButton=(id,label)=>`<button class="admin-tab ${tab===id?'active':''}" data-admin-tab="${id}">${label}</button>`;
  let content='';
  if(tab==='overview'){
    const s=admin.summary;const pending=admin.documents.filter(doc=>doc.status==='pending').slice(0,5);
    content=`<div class="admin-stats"><div class="admin-stat"><span>Approved documents</span><strong>${s.documents}</strong><small>Visible in the public library</small></div><div class="admin-stat"><span>Awaiting review</span><strong>${s.pending}</strong><small>Needs moderator action</small></div><div class="admin-stat"><span>Open reports</span><strong>${s.reports}</strong><small>Reader submitted</small></div><div class="admin-stat"><span>Member accounts</span><strong>${s.users}</strong><small>${s.creditsOutstanding} credits outstanding</small></div></div>
      <div class="admin-panel"><div class="admin-panel-heading"><div><h3>Review queue</h3><p>Recent document uploads awaiting approval.</p></div><button class="btn-secondary" data-admin-tab="documents">View all documents</button></div>${pending.length?`<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Document</th><th>Contributor</th><th>Submitted</th><th>Actions</th></tr></thead><tbody>${pending.map(adminDocRow).join('')}</tbody></table></div>`:'<div class="admin-empty">No documents are waiting for review.</div>'}</div>`;
  } else if(tab==='documents'){
    const search=state.adminSearch.toLowerCase();const docs=admin.documents.filter(doc=>(state.adminDocFilter==='all'||doc.status===state.adminDocFilter)&&`${doc.title} ${doc.author} ${doc.category}`.toLowerCase().includes(search));
    content=`<div class="admin-panel"><div class="admin-panel-heading admin-tools"><div><h3>Document moderation</h3><p>Review uploads and manage the public catalog.</p></div><div><button class="btn-secondary" id="export-documents">Export CSV</button><button class="btn-secondary" id="refresh-admin">Refresh</button></div></div><div class="admin-filters"><input id="admin-search" aria-label="Search documents" value="${escapeHtml(state.adminSearch)}"/><div>${['pending','approved','rejected','all'].map(filter=>`<button class="filter-chip ${state.adminDocFilter===filter?'active':''}" data-admin-filter="${filter}" data-admin-kind="documents">${filter==='all'?'All':filter[0].toUpperCase()+filter.slice(1)}</button>`).join('')}</div></div>${docs.length?`<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Document</th><th>Contributor</th><th>Status</th><th>Submitted</th><th>Actions</th></tr></thead><tbody>${docs.map(adminDocRow).join('')}</tbody></table></div>`:'<div class="admin-empty">No documents match this view.</div>'}</div>`;
  } else if(tab==='reports'){
    const reports=admin.reports.filter(report=>state.adminReportFilter==='all'||report.status===state.adminReportFilter);
    content=`<div class="admin-panel"><div class="admin-panel-heading"><div><h3>Reader reports</h3><p>Review copyright, quality, accuracy, and privacy reports.</p></div><button class="btn-secondary" id="refresh-admin">Refresh</button></div><div class="admin-filters"><div>${['open','resolved','dismissed','all'].map(filter=>`<button class="filter-chip ${state.adminReportFilter===filter?'active':''}" data-admin-filter="${filter}" data-admin-kind="reports">${filter==='all'?'All':filter[0].toUpperCase()+filter.slice(1)}</button>`).join('')}</div></div>${reports.length?`<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Document / reason</th><th>Reported by</th><th>Details</th><th>Status</th><th>Actions</th></tr></thead><tbody>${reports.map(report=>`<tr><td><strong>${escapeHtml(report.title)}</strong><small>${escapeHtml(report.reason)}</small></td><td>${escapeHtml(report.reporterName)}</td><td>${escapeHtml(report.details||'—')}</td><td><span class="status-${report.status}">${report.status}</span></td><td>${report.status==='open'?`<button class="table-action" data-report-status="resolved" data-report-id="${report.id}">Resolve</button><button class="table-action muted" data-report-status="dismissed" data-report-id="${report.id}">Dismiss</button>`:'—'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="admin-empty">No reports in this view.</div>'}</div>`;
  } else if(tab==='members'){
    const members=admin.users.filter(user=>`${user.name} ${user.email||''}`.toLowerCase().includes(state.adminSearch.toLowerCase()));
    content=`<div class="admin-panel"><div class="admin-panel-heading admin-tools"><div><h3>Members</h3><p>Member accounts and current credit balances.</p></div><button class="btn-secondary" id="refresh-admin">Refresh</button></div><div class="admin-filters"><input id="admin-search" aria-label="Search members" value="${escapeHtml(state.adminSearch)}"/></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Member</th><th>Role</th><th>Credits</th><th>Contributions</th><th>Joined</th><th>Actions</th></tr></thead><tbody>${members.map(user=>`<tr><td><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></td><td>${escapeHtml(user.role)}</td><td><strong>${user.credits}</strong></td><td>${user.contributionCount||0}</td><td>${formatDate(user.createdAt)}</td><td><button class="table-action" data-add-credit="${user.id}">+1 credit</button></td></tr>`).join('')}</tbody></table></div></div>`;
  } else if(tab==='settings'){
    const s=admin.settings;
    content=`<div class="admin-panel settings-panel"><div class="admin-panel-heading"><div><h3>Library settings</h3><p>Adjust starter credits, contribution rewards, and upload availability.</p></div></div><form id="settings-form" class="settings-form"><div class="form-field"><label for="starter-credits">Starter credits for new accounts</label><input id="starter-credits" name="starterCredits" type="number" min="0" max="100" value="${s.starterCredits}" required /></div><div class="form-field"><label for="reward-count">Approved uploads per reward credit</label><input id="reward-count" name="rewardUploadCount" type="number" min="1" max="20" value="${s.rewardUploadCount}" required /></div><div class="form-field"><label for="credit-price">Single download price (GHS)</label><input id="credit-price" name="pricePerCreditGhs" type="number" min="0.10" max="10000" step="0.10" value="${s.pricePerCreditGhs}" required /></div><label class="check-line"><input type="checkbox" name="uploadEnabled" ${s.uploadEnabled?'checked':''} /><span>Allow members to submit documents</span></label><button class="btn-primary" type="submit">Save settings</button></form><div class="settings-warning">Checkout ${s.paymentEnabled?'is configured for Paystack.':'is disabled until PAYSTACK_SECRET_KEY is set on the server.'} Prices use Ghana cedis.</div></div>`;
  } else if(tab==='activity'){
    content=`<div class="admin-panel"><div class="admin-panel-heading"><div><h3>Recent activity</h3><p>Credit purchases, downloads, rewards, and manual adjustments.</p></div><button class="btn-secondary" id="refresh-admin">Refresh</button></div>${admin.transactions.length?`<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Activity</th><th>Member</th><th>Credits</th><th>Amount</th><th>Date</th></tr></thead><tbody>${admin.transactions.map(tx=>`<tr><td><strong>${escapeHtml(tx.type.replaceAll('_',' '))}</strong><small>${escapeHtml(tx.note||'')}</small></td><td>${escapeHtml(tx.userName)}</td><td>${tx.credits>0?'+':''}${tx.credits}</td><td>${tx.amount?`GH₵${Number(tx.amount).toFixed(2)}`:'—'}</td><td>${formatDate(tx.createdAt)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="admin-empty">No activity yet.</div>'}</div>`;
  }
  root.innerHTML=`<div class="page-wrap admin-page"><div class="admin-page-heading"><div><div class="eyebrow"><span></span> STUDYPOINT CONTROL ROOM</div><h1>Admin workspace.</h1><p>Review contributions, respond to reader reports, and manage library settings.</p></div><div class="admin-local-badge"><span></span> Administrator</div></div><div class="admin-tabs">${tabButton('overview','Overview')}${tabButton('documents','Documents')}${tabButton('reports','Reports')}${tabButton('members','Members')}${tabButton('activity','Activity')}${tabButton('settings','Settings')}</div>${content}</div>`;
  document.getElementById('admin-search')?.addEventListener('input',event=>{state.adminSearch=event.target.value;renderAdminPage();const input=document.getElementById('admin-search');input?.focus();input?.setSelectionRange(state.adminSearch.length,state.adminSearch.length);});
  document.getElementById('settings-form')?.addEventListener('submit',saveAdminSettings);
}

function adminDocRow(doc) {
  const actions=doc.status==='pending'?`<button class="table-action" data-doc-review="approve" data-doc-id="${doc.id}">Approve</button><button class="table-action muted" data-doc-review="reject" data-doc-id="${doc.id}">Reject</button>`:`<span class="muted-cell">${doc.status==='approved'?'In public catalog':'Not published'}</span>`;
  return `<tr><td><strong>${escapeHtml(doc.title)}</strong><small>${escapeHtml(doc.category)} · ${escapeHtml(doc.format||'File')}</small></td><td>${escapeHtml(doc.uploaderName||doc.author)}</td><td><span class="status-${doc.status}">${doc.status}</span></td><td>${formatDate(doc.createdAt)}</td><td>${actions}</td></tr>`;
}
function formatDate(value) { return value ? new Intl.DateTimeFormat(undefined,{dateStyle:'medium'}).format(new Date(value)) : '—'; }
async function reloadAdmin() { await fetchAdminData();renderAdminPage(); }
async function reviewDocument(id,action) { try{const {body}=await api(`/api/admin/documents/${encodeURIComponent(id)}/review`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});await refreshData();await fetchAdminData();renderAdminPage();showToast(body.message);}catch(error){showToast(error.message);} }
async function updateReport(id,status) { try{await api(`/api/admin/reports/${encodeURIComponent(id)}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});await reloadAdmin();showToast(`Report ${status}.`);}catch(error){showToast(error.message);} }
async function addMemberCredit(id) { try{await api(`/api/admin/users/${encodeURIComponent(id)}/credits`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:1,note:'Admin courtesy credit'})});await reloadAdmin();showToast('One credit added.');}catch(error){showToast(error.message);} }
async function saveAdminSettings(event) { event.preventDefault();const form=new FormData(event.currentTarget),payload={starterCredits:Number(form.get('starterCredits')),rewardUploadCount:Number(form.get('rewardUploadCount')),pricePerCreditGhs:Number(form.get('pricePerCreditGhs')),uploadEnabled:form.get('uploadEnabled')==='on'};try{await api('/api/admin/settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});await reloadAdmin();showToast('Library settings saved.');}catch(error){showToast(error.message);} }
function exportDocuments() { const rows=[['Title','Category','Status','Contributor','Submitted'],...state.admin.documents.map(doc=>[doc.title,doc.category,doc.status,doc.uploaderName||doc.author,doc.createdAt])];const csv=rows.map(row=>row.map(value=>`"${String(value||'').replaceAll('"','""')}"`).join(',')).join('\r\n');downloadBlob(new Blob([csv],{type:'text/csv'}),'studypoint-documents.csv'); }
function downloadBlob(blob,filename){const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function attachGlobalEvents() {
  document.addEventListener('click',event=>{
    const view=event.target.closest('[data-view]');if(view){event.preventDefault();setView(view.dataset.view);return;}
    const nav=event.target.closest('.nav-item');if(nav){setView(nav.dataset.view);return;}
    const category=event.target.closest('[data-category]');if(category){state.category=category.dataset.category;state.view='explore';render();return;}
    const layout=event.target.closest('[data-layout]');if(layout){state.layout=layout.dataset.layout;render();return;}
    const tab=event.target.closest('[data-admin-tab]');if(tab){state.adminTab=tab.dataset.adminTab;state.adminSearch='';if(state.admin){renderAdminPage();}else renderAdmin();return;}
    const filter=event.target.closest('[data-admin-filter]');if(filter){if(filter.dataset.adminKind==='reports')state.adminReportFilter=filter.dataset.adminFilter;else state.adminDocFilter=filter.dataset.adminFilter;renderAdminPage();return;}
    const review=event.target.closest('[data-doc-review]');if(review){reviewDocument(review.dataset.docId,review.dataset.docReview);return;}
    const reportStatus=event.target.closest('[data-report-status]');if(reportStatus){updateReport(reportStatus.dataset.reportId,reportStatus.dataset.reportStatus);return;}
    const addCredit=event.target.closest('[data-add-credit]');if(addCredit){addMemberCredit(addCredit.dataset.addCredit);return;}
    const download=event.target.closest('[data-download]');if(download){event.stopPropagation();if(!state.user){openAccount('login');return;}if(isDownloaded(download.dataset.download)){downloadDoc(download.dataset.download);}else if(state.user.credits<1)openCredits();else openDocument(download.dataset.download);return;}
    const card=event.target.closest('[data-open-doc]');if(card){openDocument(card.dataset.openDoc);return;}
    if(event.target.closest('#credit-button')){openCredits();return;}
    if(event.target.closest('#profile-button')||event.target.closest('#sidebar-profile')){openAccount();return;}
    if(event.target.closest('#help-button')){openAbout();return;}
    if(event.target.closest('#about-link')){event.preventDefault();openAbout();return;}
    if(event.target.closest('#guidelines-link')){event.preventDefault();openAbout(true);return;}
    if(event.target.closest('#refresh-admin')){reloadAdmin();return;}
    if(event.target.closest('#export-documents')){exportDocuments();return;}
  });
  modalBackdrop.addEventListener('click',event=>{if(event.target===modalBackdrop)closeModal();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal();if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setView('explore');setTimeout(()=>document.getElementById('search-input')?.focus(),0);}if(event.key==='Enter'&&event.target.matches('[data-open-doc]'))openDocument(event.target.dataset.openDoc);});
}

attachGlobalEvents();
refreshData().catch(error=>{root.innerHTML=`<div class="page-wrap"><div class="admin-error">Could not connect to the StudyPoint API: ${escapeHtml(error.message)}. Restart the local server and refresh.</div></div>`;});

