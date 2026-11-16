const modal = document.getElementById('helpModal');
const loginModal = document.getElementById('loginModal');
const form = document.getElementById('helpForm');
const toast = document.getElementById('toast');
let toastTimer;
let language = localStorage.getItem('campuscare-language') || 'en';
let user = JSON.parse(localStorage.getItem('campuscare-user') || '{"name":"Alex Student","role":"student"}');
let requestCache = null;
let backendAvailable = false;
let backendReady = Promise.resolve(false);

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
}

function getRequests() {
  if (requestCache) return requestCache;
  const stored = JSON.parse(localStorage.getItem('campuscare-requests') || '[]');
  const migrated = stored.map((request, index) => ({
    ...request,
    id: request.id || `legacy-${index}-${request.createdAt || Date.now()}`,
    user: request.user || 'Alex Student',
    status: request.status || 'New'
  }));
  requestCache = migrated;
  if (JSON.stringify(stored) !== JSON.stringify(migrated)) localStorage.setItem('campuscare-requests', JSON.stringify(migrated));
  return requestCache;
}

function saveRequests(requests) {
  requestCache = requests;
  localStorage.setItem('campuscare-requests', JSON.stringify(requests));
}

async function initializeBackend() {
  try {
    const health = await fetch('/api/health', { cache: 'no-store' });
    if (!health.ok) return false;
    backendAvailable = true;
    const response = await fetch('/api/requests', { cache: 'no-store' });
    if (!response.ok) throw new Error('Request API unavailable');
    let remoteRequests = await response.json();
    const localRequests = getRequests();
    if (remoteRequests.length === 0 && localRequests.length) {
      for (const request of localRequests) {
        await fetch('/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
      }
      const migratedResponse = await fetch('/api/requests', { cache: 'no-store' });
      remoteRequests = await migratedResponse.json();
    }
    requestCache = remoteRequests;
    renderRequests();
    return true;
  } catch {
    backendAvailable = false;
    return false;
  }
}

async function createRequest(request) {
  await backendReady;
  if (backendAvailable) {
    try {
      const response = await fetch('/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
      if (!response.ok) throw new Error('Unable to save request');
      requestCache = await fetch('/api/requests', { cache: 'no-store' }).then(result => result.json());
      return true;
    } catch {
      backendAvailable = false;
      showToast('Local server unavailable. Saving this request in this browser instead.');
    }
  }
  const requests = getRequests(); requests.unshift(request); saveRequests(requests);
  return false;
}

async function updateRequestStatus(id, status) {
  await backendReady;
  if (backendAvailable) {
    try {
      const response = await fetch(`/api/requests/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      if (!response.ok) throw new Error('Unable to update status');
      requestCache = await fetch('/api/requests', { cache: 'no-store' }).then(result => result.json());
      return;
    } catch {
      backendAvailable = false;
      showToast('Local server unavailable. Updating this browser copy only.');
    }
  }
  const requests = getRequests();
  const request = requests.find(item => item.id === id);
  if (request) { request.status = status; saveRequests(requests); }
}

function openModal(category = '') {
  form.reset();
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  if (category) document.getElementById('requestType').value = category;
  updateEscortFields();
  setTimeout(() => document.getElementById('requestType').focus(), 50);
}

function closeDialog(dialog) {
  dialog.classList.remove('open');
  dialog.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function updateEscortFields() {
  const isSafeWalk = document.getElementById('requestType').value === 'Safe Walk';
  const isIncident = document.getElementById('requestType').value === 'Incident report';
  const fields = document.getElementById('escortFields');
  const isScheduled = document.getElementById('escortTime').value === 'Schedule later';
  fields.hidden = !isSafeWalk;
  document.getElementById('escortDestination').required = isSafeWalk;
  document.getElementById('scheduledTimeWrap').hidden = !isSafeWalk || !isScheduled;
  document.getElementById('scheduledTime').required = isSafeWalk && isScheduled;
  document.getElementById('reportFields').hidden = !isIncident;
  document.getElementById('reportNote').hidden = !isIncident;
  document.getElementById('requestDetails').required = isIncident;
  document.getElementById('detailsLabel').innerHTML = isIncident
    ? (language === 'hi' ? 'क्या हुआ? <span>(ज़रूरी)</span>' : 'What happened? <span>(required)</span>')
    : (language === 'hi' ? 'एक छोटा संदेश लिखें <span>(वैकल्पिक)</span>' : 'Add a short note <span>(optional)</span>');
  if (isIncident) document.getElementById('requestDetails').placeholder = language === 'hi' ? 'समस्या और उससे जुड़ी जानकारी बताएँ' : 'Describe the concern and any helpful details';
  else document.getElementById('requestDetails').placeholder = language === 'hi' ? 'जवाब देने में मददगार जानकारी लिखें' : 'Share anything that will help us respond';
  document.getElementById('locationLabel').textContent = isSafeWalk
    ? (language === 'hi' ? 'आपको कहाँ से लेना है?' : 'Where should we meet you?')
    : (language === 'hi' ? 'आप कहाँ हैं?' : 'Where are you?');
}

function updateProfile() {
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || 'CC';
  document.getElementById('profileName').textContent = user.name;
  document.getElementById('profileRole').textContent = user.role === 'admin' ? 'Campus staff · Demo admin' : 'Student account · Demo';
  document.querySelector('.avatar').textContent = initials;
  document.getElementById('topAvatar').textContent = initials;
  document.getElementById('adminNav').hidden = user.role !== 'admin';
  document.getElementById('admin').hidden = user.role !== 'admin';
  document.getElementById('loginName').value = user.name;
  document.getElementById('loginRole').value = user.role;
  renderRequests();
}

function formatTime(iso) {
  return new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en', {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(new Date(iso));
}

function renderRequests() {
  const all = getRequests();
  const mine = user.role === 'admin' ? all : all.filter(request => request.user === user.name);
  const activeMine = mine.filter(request => (request.status || 'New') !== 'Resolved').length;
  document.getElementById('statRequestCount').textContent = language === 'hi' ? `${activeMine} सक्रिय` : `${activeMine} active`;
  document.getElementById('statRequestNote').textContent = activeMine ? (language === 'hi' ? 'स्थिति ट्रैक करने के लिए खोलें' : 'Open to track status') : (language === 'hi' ? 'ध्यान देने योग्य कुछ नहीं' : 'Nothing needs your attention');
  const totalLabel = language === 'hi' ? `${mine.length} अनुरोध` : `${mine.length} ${mine.length === 1 ? 'request' : 'requests'}`;
  document.getElementById('requestTotal').textContent = totalLabel;
  document.getElementById('adminTotal').textContent = `${all.length} ${language === 'hi' ? 'कुल अनुरोध' : all.length === 1 ? 'request' : 'requests'}`;
  const requestList = document.getElementById('requestList');
  if (!mine.length) {
    requestList.innerHTML = `<div class="empty-requests"><span>◷</span><strong>${language === 'hi' ? 'अभी कोई अनुरोध नहीं' : 'No requests yet'}</strong><small>${language === 'hi' ? 'आपके मदद के अनुरोध यहाँ दिखाई देंगे।' : 'Your submitted help requests will appear here.'}</small></div>`;
  } else {
    requestList.innerHTML = mine.map(request => `<article class="request-item"><span class="request-mark">${request.type === 'Medical' ? '✚' : request.type === 'Wellbeing' ? '♡' : request.type === 'Safe Walk' ? '⇢' : request.type === 'Incident report' ? '⚑' : '◷'}</span><div class="request-details"><strong>${escapeHTML(request.type === 'Safe Walk' && language === 'hi' ? 'सेफ वॉक एस्कॉर्ट' : request.type === 'Incident report' && language === 'hi' ? 'कैंपस चिंता रिपोर्ट' : `${request.type} ${language === 'hi' ? 'सहायता' : 'support'}`)}</strong><small>⌖ ${escapeHTML(request.location)}${request.destination ? ` → ${escapeHTML(request.destination)}` : ''} · ${formatTime(request.createdAt)}</small>${request.incidentCategory ? `<p>${escapeHTML(language === 'hi' ? translateIncidentCategory(request.incidentCategory) : request.incidentCategory)}</p>` : ''}${request.requestedTime ? `<p>${language === 'hi' ? 'पसंदीदा समय' : 'Preferred time'}: ${escapeHTML(request.scheduledAt ? formatTime(new Date(request.scheduledAt).toISOString()) : translateEscortTime(request.requestedTime))}</p>` : ''}${request.details ? `<p>${escapeHTML(request.details)}</p>` : ''}</div><span class="status-pill status-${(request.status || 'New').toLowerCase()}">${translateStatus(request.status || 'New')}</span></article>`).join('');
  }

  const adminList = document.getElementById('adminRequestList');
  if (!all.length) {
    adminList.innerHTML = `<tr><td colspan="4" class="empty-admin">${language === 'hi' ? 'इस ब्राउज़र में अभी अनुरोध नहीं हैं।' : 'No help requests in this browser yet.'}</td></tr>`;
  } else {
    adminList.innerHTML = all.map(request => `<tr><td><strong>${escapeHTML(request.type)}</strong><small>${escapeHTML(request.user || 'Student')}</small></td><td>${escapeHTML(request.location)}${request.destination ? ` → ${escapeHTML(request.destination)}` : ''}</td><td>${formatTime(request.createdAt)}</td><td><select class="status-select" data-request-id="${escapeHTML(request.id)}" aria-label="Update request status"><option ${request.status === 'New' ? 'selected' : ''}>New</option><option ${request.status === 'Assigned' ? 'selected' : ''}>Assigned</option><option ${request.status === 'Resolved' ? 'selected' : ''}>Resolved</option></select></td></tr>`).join('');
    adminList.querySelectorAll('.status-select').forEach(select => select.addEventListener('change', async () => {
      await updateRequestStatus(select.dataset.requestId, select.value);
      renderRequests(); showToast(`Request status updated to ${select.value}.`);
    }));
  }
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function translateStatus(status) {
  if (language !== 'hi') return status;
  return ({ New: 'नया', Assigned: 'सौंपा गया', Resolved: 'हल हुआ' })[status] || status;
}

function translateEscortTime(time) {
  if (language !== 'hi') return time;
  return ({ 'Now': 'जल्द से जल्द', 'In 15 minutes': 'लगभग 15 मिनट में', 'Schedule later': 'बाद के लिए तय करें' })[time] || time;
}

function translateIncidentCategory(category) {
  return ({ 'Safety hazard': 'सुरक्षा जोखिम', 'Accessibility issue': 'पहुँच संबंधी समस्या', 'Facilities issue': 'सुविधा संबंधी समस्या', 'Other concern': 'अन्य चिंता' })[category] || category;
}

function renderCheckin() {
  const checkedInAt = localStorage.getItem('campuscare-checkin');
  const status = document.getElementById('checkinStatus');
  const button = document.getElementById('checkinButton');
  if (!checkedInAt) {
    status.innerHTML = `<span class="checkin-pulse"></span><span><strong>${language === 'hi' ? 'अभी चेक-इन नहीं किया' : 'No check-in yet'}</strong><small>${language === 'hi' ? 'जब चाहें, नीचे टैप करके चेक-इन करें।' : 'Tap below whenever you want to check in.'}</small></span>`;
    button.textContent = language === 'hi' ? '✓  मैं सुरक्षित हूँ' : '✓  I’m safe';
    return;
  }
  const time = new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(checkedInAt));
  status.innerHTML = `<span class="checkin-done">✓</span><span><strong>${language === 'hi' ? 'आपने चेक-इन किया' : 'You checked in'}</strong><small>${time}</small></span>`;
  button.textContent = language === 'hi' ? '✓  फिर से चेक-इन करें' : '✓  Check in again';
}

function renderChecklist() {
  const items = JSON.parse(localStorage.getItem('campuscare-checklist') || '{}');
  document.querySelectorAll('.checklist-item input').forEach(input => { input.checked = Boolean(items[input.dataset.check]); });
  const done = document.querySelectorAll('.checklist-item input:checked').length;
  document.getElementById('checklistProgress').textContent = language === 'hi' ? `${done} / 4 पूरे` : `${done} / 4`;
  document.getElementById('progressBar').style.width = `${done * 25}%`;
}

const helpSearchItems = [
  { title: 'Medical help', description: 'Health center and first aid', terms: 'medical health doctor first aid चिकित्सा स्वास्थ्य डॉक्टर उपचार', category: 'Medical' },
  { title: 'Campus safety', description: 'Security and safe escort', terms: 'safety security escort campus सुरक्षा सिक्योरिटी', category: 'Campus safety' },
  { title: 'Wellbeing support', description: 'Counselling and mental health', terms: 'wellbeing counselling mental health support कल्याण काउंसलिंग मानसिक स्वास्थ्य', category: 'Wellbeing' },
  { title: 'Facilities issue', description: 'Accessibility, repairs and campus issues', terms: 'facilities accessibility repair issue campus सुविधाएँ मरम्मत', category: 'Facilities' },
  { title: 'Safe Walk escort', description: 'Request an escort between campus locations', terms: 'safe walk escort walk buddy night safety एस्कॉर्ट साथी पैदल', category: 'Safe Walk' },
  { title: 'Report a campus concern', description: 'Send a safety, accessibility, or facilities report', terms: 'incident report hazard accessibility facilities concern रिपोर्ट जोखिम पहुँच सुविधा', category: 'Incident report' },
  { title: 'Campus security', description: '24-hour response team · Key contacts', terms: 'security response team contact campus सुरक्षा संपर्क', target: '#contacts' },
  { title: 'Student wellbeing', description: 'Counselling and mental health · Key contacts', terms: 'wellbeing counselling mental health contact कल्याण काउंसलिंग', target: '#contacts' },
  { title: 'Health center', description: 'Mon–Fri, 8:00 AM–6:00 PM · Key contacts', terms: 'health center doctor clinic contact स्वास्थ्य केंद्र', target: '#contacts' },
  { title: 'East Library lift maintenance', description: 'Campus advisory · Campus alerts', terms: 'library lift maintenance advisory alert library लिफ्ट रखरखाव', target: '#alerts' },
  { title: 'Safety walk today', description: 'Campus safety · 5:30 PM · Campus alerts', terms: 'safety walk today security alert सुरक्षा वॉक', target: '#alerts' },
  { title: 'Main Gate security desk', description: 'Campus map · Open 24/7', terms: 'main gate security desk map entrance मुख्य द्वार सुरक्षा', target: '#map', place: 'Campus security desk · Main Gate' },
  { title: 'Student Hall safe point', description: 'Campus map · Staffed', terms: 'student hall safe point map safe सुरक्षित स्थान', target: '#map', place: 'Safe point · Student Hall' },
  { title: 'East Walk health center', description: 'Campus map · Open until 6 PM', terms: 'east walk health center map clinic ईस्ट वॉक स्वास्थ्य केंद्र', target: '#map', place: 'Health center · East Walk' }
];

const campusServices = [
  { id: 'security', name: 'Campus Security', nameHi: 'कैंपस सुरक्षा', bucket: 'security', icon: '✚', location: 'Main Gate', locationHi: 'मुख्य द्वार', hours: 'Open 24/7', hoursHi: '24/7 उपलब्ध', request: 'Campus safety', terms: 'safety patrol security escort सुरक्षा गश्त' },
  { id: 'health', name: 'Student Health Center', nameHi: 'छात्र स्वास्थ्य केंद्र', bucket: 'health', icon: '✚', location: 'East Walk · Building E', locationHi: 'ईस्ट वॉक · भवन E', hours: 'Weekdays · 8:00 AM–6:00 PM', hoursHi: 'कामकाजी दिन · सुबह 8–शाम 6', request: 'Medical', terms: 'doctor medical first aid health स्वास्थ्य डॉक्टर चिकित्सा' },
  { id: 'wellbeing', name: 'Wellbeing & Counselling', nameHi: 'कल्याण और काउंसलिंग', bucket: 'wellbeing', icon: '♡', location: 'Student Hall · Room 204', locationHi: 'स्टूडेंट हॉल · कमरा 204', hours: 'Weekdays · 9:00 AM–5:00 PM', hoursHi: 'कामकाजी दिन · सुबह 9–शाम 5', request: 'Wellbeing', terms: 'counselling mental health support काउंसलिंग मानसिक स्वास्थ्य' },
  { id: 'accessibility', name: 'Accessibility Services', nameHi: 'एक्सेसिबिलिटी सेवाएँ', bucket: 'campus', icon: '♿', location: 'Administration · Ground floor', locationHi: 'प्रशासन भवन · भूतल', hours: 'Weekdays · 8:30 AM–5:00 PM', hoursHi: 'कामकाजी दिन · सुबह 8:30–शाम 5', request: 'Facilities', terms: 'accessible wheelchair accommodations पहुंच व्हीलचेयर' },
  { id: 'facilities', name: 'Facilities Help Desk', nameHi: 'फैसिलिटीज़ हेल्प डेस्क', bucket: 'campus', icon: '⌂', location: 'North Service Yard', locationHi: 'नॉर्थ सर्विस यार्ड', hours: 'Weekdays · 8:00 AM–6:00 PM', hoursHi: 'कामकाजी दिन · सुबह 8–शाम 6', request: 'Facilities', terms: 'repair maintenance building facilities मरम्मत रखरखाव' },
  { id: 'incident-report', name: 'Report a campus concern', nameHi: 'कैंपस चिंता रिपोर्ट करें', bucket: 'campus', icon: '⚑', location: 'Submit online · any campus area', locationHi: 'ऑनलाइन जमा करें · कैंपस का कोई भी स्थान', hours: 'Available anytime · Demo only', hoursHi: 'कभी भी · केवल डेमो', request: 'Incident report', terms: 'incident safety hazard concern report जोखिम शिकायत रिपोर्ट' }
];
let directoryFilter = 'all';

function renderDirectory() {
  const query = document.getElementById('directorySearch').value.toLocaleLowerCase().trim();
  const favorites = JSON.parse(localStorage.getItem('campuscare-favorites') || '[]');
  const filtered = campusServices.filter(service => {
    const matchesFilter = directoryFilter === 'all' || (directoryFilter === 'favorites' ? favorites.includes(service.id) : service.bucket === directoryFilter);
    const matchesQuery = !query || `${service.name} ${service.nameHi} ${service.location} ${service.locationHi} ${service.hours} ${service.hoursHi} ${service.terms}`.toLocaleLowerCase().includes(query);
    return matchesFilter && matchesQuery;
  });
  document.getElementById('directoryCount').textContent = language === 'hi' ? `${filtered.length} सेवाएँ` : `${filtered.length} ${filtered.length === 1 ? 'service' : 'services'}`;
  document.getElementById('directoryGrid').innerHTML = filtered.length ? filtered.map((service, index) => `<article class="service-card"><div class="service-top"><span class="service-icon service-${service.bucket}">${service.icon}</span><span class="service-label">${language === 'hi' ? translateDirectoryBucket(service.bucket) : service.bucket}</span><button class="favorite-button ${favorites.includes(service.id) ? 'is-favorite' : ''}" data-favorite-id="${service.id}" aria-label="${favorites.includes(service.id) ? (language === 'hi' ? 'पसंदीदा से हटाएँ' : 'Remove from favorites') : (language === 'hi' ? 'पसंदीदा में जोड़ें' : 'Add to favorites')}" title="${favorites.includes(service.id) ? (language === 'hi' ? 'पसंदीदा' : 'Favorite') : (language === 'hi' ? 'पसंदीदा में जोड़ें' : 'Add to favorites')}">${favorites.includes(service.id) ? '★' : '☆'}</button></div><h3>${escapeHTML(language === 'hi' ? service.nameHi : service.name)}</h3><p class="service-location">⌖ ${escapeHTML(language === 'hi' ? service.locationHi : service.location)}</p><p class="service-hours">◷ ${escapeHTML(language === 'hi' ? service.hoursHi : service.hours)}</p><button class="service-request" data-service-index="${index}">${language === 'hi' ? 'मदद का अनुरोध करें' : 'Request help'} <span>→</span></button></article>`).join('') : `<div class="directory-empty">${directoryFilter === 'favorites' ? (language === 'hi' ? 'अभी कोई पसंदीदा सेवा नहीं। स्टार दबाकर सेवाएँ जोड़ें।' : 'No favorite services yet. Tap a star to save one.') : (language === 'hi' ? 'इस खोज के लिए कोई सेवा नहीं मिली।' : 'No services match your search.')}</div>`;
  document.querySelectorAll('.favorite-button').forEach(button => button.addEventListener('click', () => {
    const saved = JSON.parse(localStorage.getItem('campuscare-favorites') || '[]');
    const id = button.dataset.favoriteId;
    const next = saved.includes(id) ? saved.filter(item => item !== id) : [...saved, id];
    localStorage.setItem('campuscare-favorites', JSON.stringify(next));
    renderDirectory();
  }));
  document.querySelectorAll('.service-request').forEach(button => button.addEventListener('click', () => {
    const service = filtered[Number(button.dataset.serviceIndex)];
    openModal(service.request);
  }));
}

function translateDirectoryBucket(bucket) {
  return ({ security: 'सुरक्षा', health: 'स्वास्थ्य', wellbeing: 'कल्याण', campus: 'कैंपस' })[bucket] || bucket;
}

function buildEmergencyCard(campusPhone, localPhone, healthPhone) {
  const isHindi = language === 'hi';
  const campus = campusPhone || (isHindi ? 'सत्यापित कैंपस नंबर जोड़ें' : 'ADD VERIFIED CAMPUS NUMBER');
  const local = localPhone || (isHindi ? 'आधिकारिक स्थानीय नंबर जोड़ें' : 'ADD OFFICIAL LOCAL NUMBER');
  const health = healthPhone || (isHindi ? 'सत्यापित स्वास्थ्य केंद्र नंबर जोड़ें' : 'ADD VERIFIED HEALTH CENTER NUMBER');
  const title = isHindi ? 'आपातकालीन सुरक्षा कार्ड' : 'Emergency safety card';
  const steps = isHindi
    ? ['तत्काल खतरे में आधिकारिक स्थानीय आपातकालीन नंबर पर कॉल करें।', 'कैंपस सुरक्षा: मुख्य द्वार · 24/7', 'स्वास्थ्य केंद्र: ईस्ट वॉक · कामकाजी दिन सुबह 8 से शाम 6 बजे', 'अपना सटीक स्थान बताएं और लाइन पर बने रहें।']
    : ['For immediate danger, call the official local emergency number.', 'Campus Security: Main Gate · Open 24/7', 'Health Center: East Walk · Weekdays, 8 AM–6 PM', 'Share your exact location and stay on the line.'];
  const html = `<!doctype html><html lang="${isHindi ? 'hi' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — Northbridge University</title><style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#f2f5fa;color:#172436;font:15px Arial,sans-serif}.card{max-width:700px;margin:0 auto;background:white;border-radius:18px;overflow:hidden;box-shadow:0 16px 48px #1d31521a}.head{background:linear-gradient(120deg,#203f88,#315fe9);color:white;padding:28px 32px}.brand{font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.8}.head h1{font-size:27px;margin:16px 0 6px}.head p{font-size:13px;opacity:.86;margin:0}.alert{margin:22px 24px 12px;padding:15px;border-radius:10px;background:#fff1ed;border:1px solid #f7d7d1;color:#a93d32;font-weight:bold;font-size:13px}.contacts{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px 24px}.contact{border:1px solid #e5eaf1;border-radius:10px;padding:14px}.contact small{display:block;color:#788699;font-size:10px;text-transform:uppercase;letter-spacing:.6px}.contact strong{display:block;margin:7px 0;font-size:15px}.phone{color:#315fe9;font-size:14px;font-weight:bold;overflow-wrap:anywhere}.steps{padding:12px 32px 24px}.steps h2{font-size:15px}.steps li{padding:6px 0;color:#4e5d70;font-size:12px;line-height:1.5}.notice{margin:0 24px 24px;padding:11px;background:#fff8e8;color:#886b2e;border-radius:8px;font-size:10px;line-height:1.5}.print{display:block;margin:0 auto 23px;border:0;border-radius:7px;background:#315fe9;color:white;padding:11px 17px;font-weight:bold;cursor:pointer}@media(max-width:540px){body{padding:12px}.head{padding:22px}.contacts{grid-template-columns:1fr;padding:10px 15px}.steps{padding:8px 22px 20px}.alert{margin:16px 15px 8px}}@media print{body{padding:0;background:#fff}.card{box-shadow:none}.print{display:none}}</style></head><body><main class="card"><header class="head"><div class="brand">CampusCare · Northbridge University</div><h1>${title}</h1><p>${isHindi ? 'ऑफलाइन उपयोग के लिए सेव करें या प्रिंट करें' : 'Save or print for offline access'}</p></header><div class="alert">${isHindi ? 'तत्काल खतरे में, अपने आधिकारिक स्थानीय आपातकालीन नंबर पर कॉल करें।' : 'IN IMMEDIATE DANGER? Call your official local emergency number.'}</div><section class="contacts"><div class="contact"><small>${isHindi ? 'स्थानीय आपातकालीन सेवा' : 'LOCAL EMERGENCY SERVICES'}</small><strong>${isHindi ? 'आधिकारिक आपातकालीन नंबर' : 'Official emergency number'}</strong><div class="phone">${escapeHTML(local)}</div></div><div class="contact"><small>${isHindi ? 'कैंपस सुरक्षा · 24/7' : 'CAMPUS SECURITY · 24/7'}</small><strong>${isHindi ? 'मुख्य द्वार सुरक्षा डेस्क' : 'Main Gate Security Desk'}</strong><div class="phone">${escapeHTML(campus)}</div></div><div class="contact"><small>${isHindi ? 'स्वास्थ्य केंद्र' : 'HEALTH CENTER'}</small><strong>${isHindi ? 'ईस्ट वॉक' : 'East Walk'}</strong><div class="phone">${escapeHTML(health)}</div></div><div class="contact"><small>${isHindi ? 'सुरक्षित स्थान' : 'CAMPUS SAFE POINT'}</small><strong>${isHindi ? 'स्टूडेंट हॉल' : 'Student Hall'}</strong><div class="phone">${isHindi ? 'स्टाफ मौजूद' : 'Staffed location'}</div></div></section><section class="steps"><h2>${isHindi ? 'याद रखने योग्य बातें' : 'Quick safety steps'}</h2><ol>${steps.map(step => `<li>${step}</li>`).join('')}</ol></section><p class="notice">${isHindi ? 'महत्वपूर्ण: यह डेमो कार्ड है। उपयोग से पहले सभी आपातकालीन नंबर अपने कैंपस और स्थानीय अधिकारियों से सत्यापित करें।' : 'Important: This is a demo card. Verify every emergency number with your campus and local authorities before relying on it.'}</p><button class="print" onclick="window.print()">${isHindi ? 'प्रिंट / PDF सेव करें' : 'Print / Save as PDF'}</button></main></body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'campuscare-offline-emergency-card.html';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getAccessibilitySettings() {
  return JSON.parse(localStorage.getItem('campuscare-accessibility') || '{"textSize":"normal","highContrast":false}');
}

function applyAccessibilitySettings() {
  const settings = getAccessibilitySettings();
  document.body.classList.toggle('large-text', settings.textSize === 'large');
  document.body.classList.toggle('high-contrast', Boolean(settings.highContrast));
  document.getElementById('contrastToggle').checked = Boolean(settings.highContrast);
  document.getElementById('contrastToggle').setAttribute('aria-checked', String(Boolean(settings.highContrast)));
  document.querySelectorAll('[data-text-size]').forEach(button => {
    const active = button.dataset.textSize === settings.textSize;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function searchHelp(query) {
  const results = document.getElementById('searchResults');
  const normalized = query.toLocaleLowerCase().trim();
  if (!normalized) { results.hidden = true; results.innerHTML = ''; return; }
  const matches = helpSearchItems.filter(item => `${item.title} ${item.description} ${item.terms}`.toLocaleLowerCase().includes(normalized)).slice(0, 6);
  if (!matches.length) {
    results.innerHTML = `<div class="search-empty">${language === 'hi' ? 'कोई परिणाम नहीं मिला। कोई और शब्द खोजें।' : 'No results found. Try another search.'}</div>`;
  } else {
    results.innerHTML = matches.map((item, index) => `<button class="search-result" data-search-index="${index}"><span class="result-icon">${item.category ? '＋' : item.target === '#map' ? '⌖' : item.target === '#alerts' ? '◉' : '▦'}</span><span><strong>${escapeHTML(language === 'hi' ? translateSearchTitle(item.title) : item.title)}</strong><small>${escapeHTML(language === 'hi' ? translateSearchDescription(item.description) : item.description)}</small></span><span class="result-arrow">↗</span></button>`).join('');
    results.querySelectorAll('.search-result').forEach((button, resultIndex) => button.addEventListener('click', () => {
      const item = matches[resultIndex];
      results.hidden = true;
      document.getElementById('hubSearch').value = '';
      if (item.category) openModal(item.category);
      else {
        document.querySelector(item.target).scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (item.place) showToast(item.place);
      }
    }));
  }
  results.hidden = false;
}

function translateSearchTitle(title) {
  return ({ 'Medical help': 'चिकित्सा सहायता', 'Campus safety': 'कैंपस सुरक्षा', 'Wellbeing support': 'कल्याण सहायता', 'Facilities issue': 'सुविधा संबंधी समस्या', 'Safe Walk escort': 'सेफ वॉक एस्कॉर्ट', 'Report a campus concern': 'कैंपस चिंता रिपोर्ट करें', 'Campus security': 'कैंपस सुरक्षा', 'Student wellbeing': 'छात्र कल्याण सेवा', 'Health center': 'स्वास्थ्य केंद्र', 'East Library lift maintenance': 'ईस्ट लाइब्रेरी लिफ्ट रखरखाव', 'Safety walk today': 'आज सुरक्षा वॉक', 'Main Gate security desk': 'मुख्य द्वार सुरक्षा डेस्क', 'Student Hall safe point': 'स्टूडेंट हॉल सुरक्षित स्थान', 'East Walk health center': 'ईस्ट वॉक स्वास्थ्य केंद्र' })[title] || title;
}

function translateSearchDescription(description) {
  return ({ 'Health center and first aid': 'स्वास्थ्य केंद्र और प्राथमिक उपचार', 'Security and safe escort': 'सुरक्षा और सुरक्षित एस्कॉर्ट', 'Counselling and mental health': 'काउंसलिंग और मानसिक स्वास्थ्य', 'Accessibility, repairs and campus issues': 'पहुँच, मरम्मत और कैंपस समस्याएँ', 'Request an escort between campus locations': 'कैंपस के अंदर एस्कॉर्ट माँगें', 'Send a safety, accessibility, or facilities report': 'सुरक्षा, पहुँच या सुविधा की समस्या बताएँ', '24-hour response team · Key contacts': '24 घंटे सहायता टीम · ज़रूरी संपर्क', 'Counselling and mental health · Key contacts': 'काउंसलिंग और मानसिक स्वास्थ्य · संपर्क', 'Mon–Fri, 8:00 AM–6:00 PM · Key contacts': 'सोम–शुक्र, सुबह 8–शाम 6 · संपर्क', 'Campus advisory · Campus alerts': 'कैंपस सूचना · अलर्ट', 'Campus safety · 5:30 PM · Campus alerts': 'कैंपस सुरक्षा · शाम 5:30 · अलर्ट', 'Campus map · Open 24/7': 'कैंपस नक्शा · 24/7 खुला', 'Campus map · Staffed': 'कैंपस नक्शा · स्टाफ मौजूद', 'Campus map · Open until 6 PM': 'कैंपस नक्शा · शाम 6 बजे तक' })[description] || description;
}

const translations = {
  en: {
    '.breadcrumb': 'Northbridge University <span>/</span> <strong>Overview</strong>',
    '.nav-label': 'WORKSPACE', '.nav-label-spaced': 'CAMPUS',
    '.nav-link[href="#home"]': '<span class="nav-icon">⌂</span>Overview',
    '.nav-link[href="#alerts"]': '<span class="nav-icon">◉</span>Campus alerts <span class="nav-count">2</span>',
    '.nav-link[href="#help"]': '<span class="nav-icon">＋</span>Get help',
    '.nav-link[href="#contacts"]': '<span class="nav-icon">▦</span>Emergency contacts',
    '.nav-link[href="#map"]': '<span class="nav-icon">⌖</span>Campus map',
    '.nav-link[href="#safety"]': '<span class="nav-icon">✳</span>Safety resources',
    '.nav-link[href="#updates"]': '<span class="nav-icon">◷</span>My requests',
    '#adminNav': '<span class="nav-icon">▤</span>Admin dashboard',
    '.welcome-copy': 'Your campus support, all in one place.',
    '.safe-status strong': 'Campus status', '.safe-status small': 'All clear right now',
    '.hero-kicker': '<span class="pulse"></span> HERE FOR YOU, 24/7',
    '#emergencyHeading': 'If it’s urgent,<br>we’re one tap away.',
    '.hero-copy>p': 'Get immediate help from campus security or connect with the right support team.',
    '#sosButton': '<span>✚</span> Request emergency help <kbd>→</kbd>',
    '.hero-note': 'For immediate danger, use your local emergency number.',
    '.quick-section .eyebrow': 'HOW CAN WE HELP?', '.quick-section h2': 'Quick support',
    '#allHelpButton': 'All support options <span>→</span>',
    '.quick-card:nth-child(1) .quick-text': '<strong>Medical help</strong><small>Health center & first aid</small>',
    '.quick-card:nth-child(2) .quick-text': '<strong>Campus safety</strong><small>Security & safe escort</small>',
    '.quick-card:nth-child(3) .quick-text': '<strong>Wellbeing</strong><small>Counselling & support</small>',
    '.quick-card:nth-child(4) .quick-text': '<strong>Campus issue</strong><small>Facilities & accessibility</small>',
    '.alerts-panel h2': 'Campus alerts', '.contacts-panel h2': 'Key contacts',
    '.map-panel h2': 'Campus map & safe points', '#locateButton': '⌖ Find my location',
    '.requests-panel h2': 'My requests', '.admin-panel h2': 'Admin dashboard',
    '#loginTitle': 'Choose a demo profile', '#helpModal .modal-intro': 'Your request will be routed to the right campus team.', '.compact-modal .modal-intro': 'Switch between student and staff views on this device.',
    '.stat-card:nth-child(1) small': 'CAMPUS STATUS', '.stat-card:nth-child(1) strong': 'All clear', '.stat-card:nth-child(1) em': '<i></i> Updated just now',
    '.stat-card:nth-child(2) small': 'MY REQUESTS', '.stat-card:nth-child(3) small': 'SUPPORT TEAMS', '.stat-card:nth-child(3) strong': '3 available', '.stat-card:nth-child(3) em': 'Security · Health · Wellbeing',
    '#notificationPopover>strong': 'Notifications', '#notificationPopover p:nth-of-type(1) b': 'Lift maintenance', '#notificationPopover p:nth-of-type(1) small': 'East Library · Advisory',
    '#notificationPopover p:nth-of-type(2) b': 'Safety walk today', '#notificationPopover p:nth-of-type(2) small': 'Campus security · 5:30 PM', '#notificationPopover>a': 'View campus alerts →',
    '.alerts-panel .alert-item:nth-of-type(1) .alert-body strong': 'East Library — lift maintenance',
    '.alerts-panel .alert-item:nth-of-type(2) .alert-body strong': 'Welcome week safety walk',
    '.alert-item:nth-child(2) .alert-body p': 'Use the west entrance or contact Accessibility Services for assistance.',
    '.alert-item:nth-child(3) .alert-body p': 'Join campus security for a guided walk around campus at 5:30 PM.',
    '#contacts .contact-row:nth-of-type(2) .contact-info strong': 'Campus security',
    '#contacts .contact-row:nth-of-type(3) .contact-info strong': 'Student wellbeing',
    '#contacts .contact-row:nth-of-type(4) .contact-info strong': 'Health center',
    '.map-legend>strong': 'Help points', '.map-legend p:nth-of-type(1)': '<i class="legend-dot legend-red"></i>Campus security <small>Main Gate · Open 24/7</small>',
    '.map-legend p:nth-of-type(2)': '<i class="legend-dot legend-blue"></i>Health center <small>East Walk · Open until 6 PM</small>',
    '.map-legend p:nth-of-type(3)': '<i class="legend-dot legend-green"></i>Campus safe point <small>Student Hall · Staffed</small>',
    '.bottom-banner strong': 'A little prep goes a long way.', '.bottom-banner p': 'Save key contacts and learn your campus safe spaces before you need them.',
    '.bottom-banner a': 'Explore safety resources <span>→</span>', '.demo-note': 'Demo contact numbers — replace with your campus directory.',
    '.checkin-panel .eyebrow': 'QUICK WELLBEING CHECK', '#checkinTitle': 'Safety check-in', '.checkin-copy': 'Let yourself know you’re okay. Your check-in stays private on this device.', '.checkin-privacy': 'This does not notify campus staff or contacts.',
    '.checklist-panel .eyebrow': 'BE READY, FEEL CONFIDENT', '#checklistTitle': 'My safety checklist',
    '.checklist-item:nth-of-type(1) strong': 'Save important campus contacts', '.checklist-item:nth-of-type(1) small': 'Security, health center & support teams',
    '.checklist-item:nth-of-type(2) strong': 'Know your nearest exits', '.checklist-item:nth-of-type(2) small': 'Check the buildings you visit often',
    '.checklist-item:nth-of-type(3) strong': 'Find a campus safe point', '.checklist-item:nth-of-type(3) small': 'See marked locations on the campus map',
    '.checklist-item:nth-of-type(4) strong': 'Choose a check-in buddy', '.checklist-item:nth-of-type(4) small': 'Agree how you’ll reach each other'
  },
  hi: {
    '.breadcrumb': 'नॉर्थब्रिज यूनिवर्सिटी <span>/</span> <strong>अवलोकन</strong>',
    '.nav-label': 'कार्य क्षेत्र', '.nav-label-spaced': 'कैंपस',
    '.nav-link[href="#home"]': '<span class="nav-icon">⌂</span>अवलोकन',
    '.nav-link[href="#alerts"]': '<span class="nav-icon">◉</span>कैंपस अलर्ट <span class="nav-count">2</span>',
    '.nav-link[href="#help"]': '<span class="nav-icon">＋</span>मदद लें',
    '.nav-link[href="#contacts"]': '<span class="nav-icon">▦</span>आपातकालीन संपर्क',
    '.nav-link[href="#map"]': '<span class="nav-icon">⌖</span>कैंपस नक्शा',
    '.nav-link[href="#safety"]': '<span class="nav-icon">✳</span>सुरक्षा संसाधन',
    '.nav-link[href="#updates"]': '<span class="nav-icon">◷</span>मेरे अनुरोध',
    '#adminNav': '<span class="nav-icon">▤</span>एडमिन डैशबोर्ड',
    '.welcome-copy': 'कैंपस सहायता, सब एक ही जगह।',
    '.safe-status strong': 'कैंपस स्थिति', '.safe-status small': 'अभी सब ठीक है',
    '.hero-kicker': '<span class="pulse"></span> हम 24/7 आपके साथ हैं',
    '#emergencyHeading': 'आपात स्थिति में,<br>एक टैप पर मदद।',
    '.hero-copy>p': 'कैंपस सुरक्षा से तुरंत मदद पाएँ या सही सहायता टीम से जुड़ें।',
    '#sosButton': '<span>✚</span> आपातकालीन मदद माँगें <kbd>→</kbd>',
    '.hero-note': 'तत्काल खतरे में अपने स्थानीय आपातकालीन नंबर पर कॉल करें।',
    '.quick-section .eyebrow': 'हम कैसे मदद करें?', '.quick-section h2': 'त्वरित सहायता',
    '#allHelpButton': 'सभी सहायता विकल्प <span>→</span>',
    '.quick-card:nth-child(1) .quick-text': '<strong>चिकित्सा सहायता</strong><small>स्वास्थ्य केंद्र और प्राथमिक उपचार</small>',
    '.quick-card:nth-child(2) .quick-text': '<strong>कैंपस सुरक्षा</strong><small>सुरक्षा और सुरक्षित एस्कॉर्ट</small>',
    '.quick-card:nth-child(3) .quick-text': '<strong>कल्याण सहायता</strong><small>काउंसलिंग और सहयोग</small>',
    '.quick-card:nth-child(4) .quick-text': '<strong>कैंपस समस्या</strong><small>सुविधाएँ और पहुँच</small>',
    '.alerts-panel h2': 'कैंपस अलर्ट', '.contacts-panel h2': 'ज़रूरी संपर्क',
    '.map-panel h2': 'कैंपस नक्शा और सुरक्षित स्थान', '#locateButton': '⌖ मेरी जगह खोजें',
    '.requests-panel h2': 'मेरे अनुरोध', '.admin-panel h2': 'एडमिन डैशबोर्ड',
    '#loginTitle': 'डेमो प्रोफ़ाइल चुनें', '#helpModal .modal-intro': 'आपका अनुरोध सही कैंपस टीम तक भेजा जाएगा।', '.compact-modal .modal-intro': 'इस डिवाइस पर छात्र और स्टाफ व्यू के बीच बदलें।',
    '.stat-card:nth-child(1) small': 'कैंपस स्थिति', '.stat-card:nth-child(1) strong': 'सब ठीक है', '.stat-card:nth-child(1) em': '<i></i> अभी अपडेट हुआ',
    '.stat-card:nth-child(2) small': 'मेरे अनुरोध', '.stat-card:nth-child(3) small': 'सहायता टीमें', '.stat-card:nth-child(3) strong': '3 उपलब्ध', '.stat-card:nth-child(3) em': 'सुरक्षा · स्वास्थ्य · कल्याण',
    '#notificationPopover>strong': 'सूचनाएँ', '#notificationPopover p:nth-of-type(1) b': 'लिफ्ट का रखरखाव', '#notificationPopover p:nth-of-type(1) small': 'ईस्ट लाइब्रेरी · सूचना',
    '#notificationPopover p:nth-of-type(2) b': 'आज सुरक्षा वॉक', '#notificationPopover p:nth-of-type(2) small': 'कैंपस सुरक्षा · शाम 5:30', '#notificationPopover>a': 'कैंपस अलर्ट देखें →',
    '.alerts-panel .alert-item:nth-of-type(1) .alert-body strong': 'ईस्ट लाइब्रेरी — लिफ्ट का रखरखाव',
    '.alerts-panel .alert-item:nth-of-type(2) .alert-body strong': 'वेलकम वीक सुरक्षा वॉक',
    '.alert-item:nth-child(2) .alert-body p': 'वेस्ट प्रवेश द्वार का उपयोग करें या सहायता के लिए एक्सेसिबिलिटी सर्विसेज़ से संपर्क करें।',
    '.alert-item:nth-child(3) .alert-body p': 'शाम 5:30 बजे कैंपस सुरक्षा के साथ निर्देशित वॉक में शामिल हों।',
    '#contacts .contact-row:nth-of-type(2) .contact-info strong': 'कैंपस सुरक्षा',
    '#contacts .contact-row:nth-of-type(3) .contact-info strong': 'छात्र कल्याण सेवा',
    '#contacts .contact-row:nth-of-type(4) .contact-info strong': 'स्वास्थ्य केंद्र',
    '.map-legend>strong': 'सहायता केंद्र', '.map-legend p:nth-of-type(1)': '<i class="legend-dot legend-red"></i>कैंपस सुरक्षा <small>मुख्य द्वार · 24/7 खुला</small>',
    '.map-legend p:nth-of-type(2)': '<i class="legend-dot legend-blue"></i>स्वास्थ्य केंद्र <small>ईस्ट वॉक · शाम 6 बजे तक</small>',
    '.map-legend p:nth-of-type(3)': '<i class="legend-dot legend-green"></i>सुरक्षित स्थान <small>स्टूडेंट हॉल · स्टाफ मौजूद</small>',
    '.bottom-banner strong': 'थोड़ी तैयारी बहुत काम आती है।', '.bottom-banner p': 'ज़रूरी संपर्क सेव करें और सुरक्षित स्थानों की जानकारी रखें।',
    '.bottom-banner a': 'सुरक्षा संसाधन देखें <span>→</span>', '.demo-note': 'डेमो संपर्क नंबर — इन्हें कैंपस निर्देशिका से बदलें।',
    '.checkin-panel .eyebrow': 'त्वरित कुशलता जाँच', '#checkinTitle': 'सुरक्षा चेक-इन', '.checkin-copy': 'अपना हाल जानें। चेक-इन इसी डिवाइस पर निजी रहता है।', '.checkin-privacy': 'इससे कैंपस स्टाफ या संपर्कों को सूचना नहीं जाएगी।',
    '.checklist-panel .eyebrow': 'तैयार रहें, निश्चिंत रहें', '#checklistTitle': 'मेरी सुरक्षा सूची',
    '.checklist-item:nth-of-type(1) strong': 'ज़रूरी कैंपस संपर्क सेव करें', '.checklist-item:nth-of-type(1) small': 'सुरक्षा, स्वास्थ्य केंद्र और सहायता टीमें',
    '.checklist-item:nth-of-type(2) strong': 'नज़दीकी निकास जानें', '.checklist-item:nth-of-type(2) small': 'जिन इमारतों में जाते हैं, उनके निकास देखें',
    '.checklist-item:nth-of-type(3) strong': 'कैंपस का सुरक्षित स्थान जानें', '.checklist-item:nth-of-type(3) small': 'नक्शे पर चिह्नित स्थान देखें',
    '.checklist-item:nth-of-type(4) strong': 'चेक-इन साथी चुनें', '.checklist-item:nth-of-type(4) small': 'तय करें कि एक-दूसरे से कैसे संपर्क करेंगे'
  }
};

function setLanguage(nextLanguage) {
  language = nextLanguage;
  localStorage.setItem('campuscare-language', language);
  const dictionary = translations[language];
  Object.entries(dictionary).forEach(([selector, content]) => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(element => { element.innerHTML = content; });
  });
  document.documentElement.lang = language === 'hi' ? 'hi' : 'en';
  document.getElementById('languageToggle').textContent = language === 'hi' ? 'English' : 'हिन्दी';
  document.getElementById('accessibilityToggle').setAttribute('aria-label', language === 'hi' ? 'एक्सेसिबिलिटी सेटिंग' : 'Accessibility settings');
  document.getElementById('accessibilityToggle').title = language === 'hi' ? 'एक्सेसिबिलिटी सेटिंग' : 'Accessibility settings';
  document.getElementById('accessibilityPopover').setAttribute('aria-label', language === 'hi' ? 'एक्सेसिबिलिटी सेटिंग' : 'Accessibility settings');
  document.getElementById('accessibilityTitle').textContent = language === 'hi' ? 'एक्सेसिबिलिटी' : 'Accessibility';
  document.getElementById('textSizeLabel').textContent = language === 'hi' ? 'टेक्स्ट का आकार' : 'Text size';
  document.getElementById('normalTextButton').innerHTML = language === 'hi' ? 'A &nbsp; सामान्य' : 'A &nbsp; Normal';
  document.getElementById('largeTextButton').innerHTML = language === 'hi' ? 'A+ &nbsp; बड़ा' : 'A+ &nbsp; Large';
  document.getElementById('contrastLabel').textContent = language === 'hi' ? 'हाई कॉन्ट्रास्ट' : 'High contrast';
  document.getElementById('a11ySavedNote').textContent = language === 'hi' ? 'सेटिंग इसी डिवाइस पर सेव हैं।' : 'Settings are saved on this device.';
  document.querySelector('.download-card-button').innerHTML = language === 'hi' ? '↓ &nbsp; ऑफलाइन सुरक्षा कार्ड डाउनलोड करें' : '↓ &nbsp; Download offline card';
  document.querySelector('#cardModal>.eyebrow').textContent = language === 'hi' ? 'ऑफलाइन सुरक्षा' : 'OFFLINE SAFETY';
  document.getElementById('cardModalTitle').textContent = language === 'hi' ? 'आपातकालीन कार्ड तैयार करें' : 'Prepare your emergency card';
  document.querySelector('#cardModal .modal-intro').textContent = language === 'hi' ? 'सत्यापित नंबर भरें। कार्ड इसी डिवाइस पर बनेगा और ऑफलाइन काम करेगा।' : 'Add verified numbers. The card is generated on this device and works offline.';
  document.querySelector('#cardForm label[for="cardCampusPhone"]').innerHTML = language === 'hi' ? 'कैंपस सुरक्षा नंबर <span>(वैकल्पिक)</span>' : 'Campus security number <span>(optional)</span>';
  document.querySelector('#cardForm label[for="cardLocalPhone"]').innerHTML = language === 'hi' ? 'स्थानीय आपातकालीन नंबर <span>(वैकल्पिक)</span>' : 'Local emergency number <span>(optional)</span>';
  document.querySelector('#cardForm label[for="cardHealthPhone"]').innerHTML = language === 'hi' ? 'स्वास्थ्य केंद्र नंबर <span>(वैकल्पिक)</span>' : 'Health center number <span>(optional)</span>';
  document.getElementById('cardCampusPhone').placeholder = language === 'hi' ? 'सत्यापित कैंपस नंबर लिखें' : 'Enter verified campus number';
  document.getElementById('cardLocalPhone').placeholder = language === 'hi' ? 'आधिकारिक स्थानीय आपातकालीन नंबर लिखें' : 'Enter official local emergency number';
  document.getElementById('cardHealthPhone').placeholder = language === 'hi' ? 'सत्यापित स्वास्थ्य केंद्र नंबर लिखें' : 'Enter verified health center number';
  document.querySelector('.card-privacy-note').textContent = language === 'hi' ? 'नंबर केवल डाउनलोड की जाने वाली फ़ाइल में जाएंगे; खाली नंबरों के लिए सत्यापित नंबर जोड़ने का संकेत दिखेगा।' : 'Numbers are included only in the file you download. Empty numbers appear as “Add verified number”.';
  document.querySelector('#cardForm .submit-button').innerHTML = language === 'hi' ? 'आपातकालीन कार्ड डाउनलोड करें <span>↓</span>' : 'Download emergency card <span>↓</span>';
  document.getElementById('todayDate').textContent = new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());
  document.querySelector('.welcome-row .eyebrow').textContent = language === 'hi' ? 'सोमवार, 2 नवंबर 2026' : 'MONDAY, NOVEMBER 2, 2026';
  document.getElementById('requestType').options[0].textContent = language === 'hi' ? 'सहायता टीम चुनें' : 'Choose a support team';
  [...document.getElementById('requestType').options].forEach(option => { if (option.value === 'Safe Walk') option.textContent = language === 'hi' ? 'सेफ वॉक एस्कॉर्ट' : 'Safe Walk'; });
  [...document.getElementById('requestType').options].forEach(option => { if (option.value === 'Incident report') option.textContent = language === 'hi' ? 'कैंपस चिंता रिपोर्ट' : 'Incident report'; });
  document.getElementById('quickReportTitle').textContent = language === 'hi' ? 'चिंता रिपोर्ट करें' : 'Report a concern';
  document.getElementById('quickReportNote').textContent = language === 'hi' ? 'कैंपस समस्या बताएँ' : 'Tell us about a campus issue';
  document.querySelector('#reportFields label').textContent = language === 'hi' ? 'यह किस तरह की चिंता है?' : 'What kind of concern is this?';
  const incidentOptions = { 'Safety hazard': 'सुरक्षा जोखिम', 'Accessibility issue': 'पहुँच संबंधी समस्या', 'Facilities issue': 'सुविधा संबंधी समस्या', 'Other concern': 'अन्य चिंता' };
  [...document.getElementById('incidentCategory').options].forEach(option => { option.textContent = language === 'hi' ? incidentOptions[option.value] : option.value; });
  document.getElementById('reportNote').textContent = language === 'hi' ? 'डेमो रिपोर्ट इसी ब्राउज़र में रहेगी; कैंपस स्टाफ को नहीं भेजी जाएगी।' : 'Demo report only — it stays in this browser and is not sent to campus staff.';
  document.getElementById('escortDestination').placeholder = language === 'hi' ? 'गंतव्य भवन या कैंपस गेट' : 'Destination building or campus gate';
  document.getElementById('escortTime').options[0].textContent = language === 'hi' ? 'जितनी जल्दी हो सके' : 'As soon as possible';
  document.getElementById('escortTime').options[1].textContent = language === 'hi' ? 'लगभग 15 मिनट में' : 'In about 15 minutes';
  document.getElementById('escortTime').options[2].textContent = language === 'hi' ? 'बाद के लिए तय करें' : 'Schedule for later';
  document.querySelector('#escortFields label[for="escortDestination"]').textContent = language === 'hi' ? 'आप कहाँ जाना चाहते हैं?' : 'Where would you like to go?';
  document.querySelector('#escortFields label[for="escortTime"]').textContent = language === 'hi' ? 'आपको एस्कॉर्ट कब चाहिए?' : 'When do you need the escort?';
  document.querySelector('#scheduledTimeWrap label').textContent = language === 'hi' ? 'तारीख और समय चुनें' : 'Choose a date and time';
  document.querySelector('.escort-note').textContent = language === 'hi' ? 'डेमो अनुरोध है। कोई एस्कॉर्ट नहीं भेजा जाएगा।' : 'Demo request only. No escort will be dispatched.';
  document.getElementById('quickSafeWalkTitle').textContent = language === 'hi' ? 'सेफ वॉक' : 'Safe Walk';
  document.getElementById('quickSafeWalkNote').textContent = language === 'hi' ? 'कैंपस एस्कॉर्ट माँगें' : 'Request a campus escort';
  document.getElementById('requestLocation').placeholder = language === 'hi' ? 'भवन, कमरा या कैंपस क्षेत्र' : 'Building, room, or campus area';
  document.getElementById('requestDetails').placeholder = language === 'hi' ? 'जवाब देने में मददगार जानकारी लिखें' : 'Share anything that will help us respond';
  document.querySelector('#helpForm label[for="requestType"]').textContent = language === 'hi' ? 'किस विषय में मदद चाहिए?' : 'What do you need help with?';
  document.querySelector('#helpForm label[for="requestLocation"]').textContent = language === 'hi' ? 'आप कहाँ हैं?' : 'Where are you?';
  updateEscortFields();
  document.querySelector('#helpForm label[for="requestDetails"]').innerHTML = language === 'hi' ? 'एक छोटा संदेश लिखें <span>(वैकल्पिक)</span>' : 'Add a short note <span>(optional)</span>';
  document.querySelector('#helpForm .submit-button').innerHTML = language === 'hi' ? 'मदद का अनुरोध भेजें <span>→</span>' : 'Send help request <span>→</span>';
  document.querySelector('#helpForm .form-disclaimer').textContent = language === 'hi' ? 'डेमो: अनुरोध इसी ब्राउज़र में सेव होते हैं; कैंपस स्टाफ को नहीं भेजे जाते।' : 'Prototype only: requests are saved in this browser and are not sent to campus staff.';
  document.querySelector('#helpModal>.eyebrow').textContent = language === 'hi' ? 'कैंपस सहायता' : 'CAMPUS SUPPORT';
  document.querySelector('#helpModal .modal-close').setAttribute('aria-label', language === 'hi' ? 'बंद करें' : 'Close');
  updateEscortFields();
  document.getElementById('hubSearch').placeholder = language === 'hi' ? 'मदद, संपर्क, अलर्ट या स्थान खोजें…' : 'Search help, contacts, alerts or places…';
  document.getElementById('directorySearch').placeholder = language === 'hi' ? 'टीम या स्थान खोजें…' : 'Search teams or locations…';
  document.querySelector('.directory-panel .eyebrow').textContent = language === 'hi' ? 'सही टीम खोजें' : 'FIND THE RIGHT TEAM';
  document.querySelector('.directory-panel h2').textContent = language === 'hi' ? 'कैंपस सेवा निर्देशिका' : 'Campus service directory';
  document.querySelector('.directory-disclaimer').textContent = language === 'hi' ? 'डेमो निर्देशिका — लॉन्च से पहले कैंपस से सेवाओं का समय, स्थान और संपर्क सत्यापित करें।' : 'Demo directory — confirm service hours, locations, and contacts with your campus before launch.';
  const filterLabels = language === 'hi' ? { all: 'सभी', favorites: 'पसंदीदा', security: 'सुरक्षा', health: 'स्वास्थ्य', wellbeing: 'कल्याण', campus: 'कैंपस' } : { all: 'All', favorites: 'Favorites', security: 'Security', health: 'Health', wellbeing: 'Wellbeing', campus: 'Campus' };
  document.querySelectorAll('.filter-chip').forEach(chip => { chip.textContent = filterLabels[chip.dataset.filter]; });
  renderRequests();
  renderDirectory();
  renderCheckin();
  renderChecklist();
}

document.querySelectorAll('.quick-card').forEach(card => card.addEventListener('click', () => openModal(card.dataset.category)));
document.getElementById('requestType').addEventListener('change', updateEscortFields);
document.getElementById('escortTime').addEventListener('change', updateEscortFields);
document.getElementById('sosButton').addEventListener('click', () => openModal('Campus safety'));
document.getElementById('allHelpButton').addEventListener('click', () => openModal());
document.getElementById('closeModal').addEventListener('click', () => closeDialog(modal));
modal.addEventListener('click', event => { if (event.target === modal) closeDialog(modal); });
document.getElementById('profileButton').addEventListener('click', () => {
  loginModal.classList.add('open'); loginModal.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden';
});
document.getElementById('closeLogin').addEventListener('click', () => closeDialog(loginModal));
loginModal.addEventListener('click', event => { if (event.target === loginModal) closeDialog(loginModal); });
const cardModal = document.getElementById('cardModal');
document.getElementById('downloadCardButton').addEventListener('click', () => {
  cardModal.classList.add('open'); cardModal.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden';
});
document.getElementById('closeCardModal').addEventListener('click', () => closeDialog(cardModal));
cardModal.addEventListener('click', event => { if (event.target === cardModal) closeDialog(cardModal); });
document.getElementById('cardForm').addEventListener('submit', event => {
  event.preventDefault();
  buildEmergencyCard(document.getElementById('cardCampusPhone').value.trim(), document.getElementById('cardLocalPhone').value.trim(), document.getElementById('cardHealthPhone').value.trim());
  closeDialog(cardModal); event.currentTarget.reset();
  showToast(language === 'hi' ? 'ऑफलाइन सुरक्षा कार्ड डाउनलोड हो गया।' : 'Offline emergency card downloaded.');
});
document.getElementById('loginForm').addEventListener('submit', event => {
  event.preventDefault();
  user = { name: document.getElementById('loginName').value.trim(), role: document.getElementById('loginRole').value };
  localStorage.setItem('campuscare-user', JSON.stringify(user));
  updateProfile(); closeDialog(loginModal);
  showToast(user.role === 'admin' ? 'Demo admin profile active.' : 'Demo student profile active.');
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { if (modal.classList.contains('open')) closeDialog(modal); if (loginModal.classList.contains('open')) closeDialog(loginModal); if (cardModal.classList.contains('open')) closeDialog(cardModal); }
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const request = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: document.getElementById('requestType').value,
    incidentCategory: document.getElementById('reportFields').hidden ? '' : document.getElementById('incidentCategory').value,
    location: document.getElementById('requestLocation').value.trim(),
    destination: document.getElementById('escortFields').hidden ? '' : document.getElementById('escortDestination').value.trim(),
    requestedTime: document.getElementById('escortFields').hidden ? '' : document.getElementById('escortTime').value,
    scheduledAt: document.getElementById('scheduledTimeWrap').hidden ? '' : document.getElementById('scheduledTime').value,
    details: document.getElementById('requestDetails').value.trim(),
    user: user.name,
    status: 'New',
    createdAt: new Date().toISOString()
  };
  const usedBackend = await createRequest(request);
  closeDialog(modal); form.reset(); updateEscortFields(); renderRequests();
  showToast(usedBackend
    ? (language === 'hi' ? 'अनुरोध स्थानीय सर्वर में सेव हुआ।' : 'Request saved to the local server.')
    : (language === 'hi' ? `${request.type} सहायता अनुरोध इस ब्राउज़र में सेव हुआ।` : `Request saved for ${request.type}. This demo does not contact campus staff.`));
});

document.getElementById('menuToggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', () => document.getElementById('sidebar').classList.remove('open')));
document.getElementById('languageToggle').addEventListener('click', () => setLanguage(language === 'en' ? 'hi' : 'en'));
const accessibilityPopover = document.getElementById('accessibilityPopover');
document.getElementById('accessibilityToggle').addEventListener('click', event => {
  event.stopPropagation();
  notificationPopover.hidden = true;
  accessibilityPopover.hidden = !accessibilityPopover.hidden;
});
document.querySelectorAll('[data-text-size]').forEach(button => button.addEventListener('click', () => {
  const settings = getAccessibilitySettings();
  settings.textSize = button.dataset.textSize;
  localStorage.setItem('campuscare-accessibility', JSON.stringify(settings));
  applyAccessibilitySettings();
}));
document.getElementById('contrastToggle').addEventListener('change', event => {
  const settings = getAccessibilitySettings();
  settings.highContrast = event.target.checked;
  localStorage.setItem('campuscare-accessibility', JSON.stringify(settings));
  applyAccessibilitySettings();
});
applyAccessibilitySettings();
const themeToggle = document.getElementById('themeToggle');
function setTheme(dark) {
  document.body.classList.toggle('dark-mode', dark);
  themeToggle.textContent = dark ? '☀' : '☾';
  themeToggle.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
  themeToggle.setAttribute('aria-label', themeToggle.title);
  localStorage.setItem('campuscare-theme', dark ? 'dark' : 'light');
}
setTheme(localStorage.getItem('campuscare-theme') === 'dark');
themeToggle.addEventListener('click', () => setTheme(!document.body.classList.contains('dark-mode')));
const notificationPopover = document.getElementById('notificationPopover');
document.getElementById('notificationButton').addEventListener('click', event => {
  event.stopPropagation(); notificationPopover.hidden = !notificationPopover.hidden;
});
document.addEventListener('click', event => {
  if (!notificationPopover.contains(event.target) && event.target.id !== 'notificationButton') notificationPopover.hidden = true;
  if (!accessibilityPopover.contains(event.target) && event.target.id !== 'accessibilityToggle') accessibilityPopover.hidden = true;
  const searchResults = document.getElementById('searchResults');
  if (!searchResults.contains(event.target) && event.target.id !== 'hubSearch') searchResults.hidden = true;
});
notificationPopover.querySelector('a').addEventListener('click', () => { notificationPopover.hidden = true; });
document.getElementById('hubSearch').addEventListener('input', event => searchHelp(event.target.value));
document.getElementById('directorySearch').addEventListener('input', renderDirectory);
document.querySelectorAll('.filter-chip').forEach(chip => chip.addEventListener('click', () => {
  directoryFilter = chip.dataset.filter;
  document.querySelectorAll('.filter-chip').forEach(option => option.classList.toggle('selected', option === chip));
  renderDirectory();
}));
document.getElementById('hubSearch').addEventListener('keydown', event => {
  if (event.key === 'Enter') document.querySelector('#searchResults .search-result')?.click();
  if (event.key === 'Escape') { document.getElementById('searchResults').hidden = true; event.currentTarget.blur(); }
});
document.addEventListener('keydown', event => {
  const target = event.target;
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
    event.preventDefault(); document.getElementById('hubSearch').focus();
  }
  if (event.key === 'Escape') { notificationPopover.hidden = true; accessibilityPopover.hidden = true; }
});
document.getElementById('checkinButton').addEventListener('click', () => {
  localStorage.setItem('campuscare-checkin', new Date().toISOString());
  renderCheckin();
  showToast(language === 'hi' ? 'आपका निजी चेक-इन इसी डिवाइस पर सेव हुआ।' : 'Your private check-in was saved on this device.');
});
document.querySelectorAll('.checklist-item input').forEach(input => input.addEventListener('change', () => {
  const saved = {};
  document.querySelectorAll('.checklist-item input').forEach(item => { saved[item.dataset.check] = item.checked; });
  localStorage.setItem('campuscare-checklist', JSON.stringify(saved));
  renderChecklist();
}));

document.getElementById('locateButton').addEventListener('click', () => {
  if (!navigator.geolocation) { showToast('Location is not available in this browser.'); return; }
  navigator.geolocation.getCurrentPosition(() => {
    document.getElementById('mapYou').hidden = false;
    showToast('Location received. The illustrated campus map shows an approximate marker only.');
  }, () => showToast('Could not access location. Check browser permission and try again.'), { timeout: 8000, maximumAge: 60000 });
});
document.querySelectorAll('.map-pin').forEach(pin => pin.addEventListener('click', () => showToast(pin.dataset.place)));

document.getElementById('todayDate').textContent = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());
backendReady = initializeBackend();
updateProfile();
setLanguage(language);
