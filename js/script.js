// ---------- Scroll reveal ----------
const revealEls = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && revealEls.length) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  revealEls.forEach(el => revealObserver.observe(el));
} else {
  revealEls.forEach(el => el.classList.add('in-view'));
}

// ---------- Mobile nav toggle ----------
const navToggle = document.getElementById('nav-toggle');
const mainNav = document.getElementById('main-nav');

navToggle.addEventListener('click', () => {
  const isOpen = mainNav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

mainNav.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    mainNav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

// ---------- Upload + per-item tagging (multi-image) ----------
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const uploadPlaceholder = document.getElementById('upload-placeholder');
const editorsEl = document.getElementById('image-editors');
const resetBtn = document.getElementById('reset-btn');

// Each image: { id, file, dataUrl, boxes: [tag, ...] }
// The "whole image" search is itself just a tag with full:true, always present.
let uploadedImages = [];
let nextImageId = 1;
let nextTagId = 1;

function newFullTag() {
  return { id: `full-${nextTagId++}`, label: 'התמונה כולה', full: true, status: 'idle', products: null, error: null };
}

dropzone.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files && e.dataTransfer.files.length) {
    handleFiles(e.dataTransfer.files);
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files.length) {
    handleFiles(fileInput.files);
  }
  fileInput.value = '';
});

function handleFiles(fileList) {
  const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
  if (!files.length) return;

  files.forEach(file => {
    const id = nextImageId++;
    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedImages.push({ id, file, dataUrl: e.target.result, boxes: [], full: newFullTag() });
      renderEditors();
    };
    reader.readAsDataURL(file);
  });
}

resetBtn.addEventListener('click', () => {
  uploadedImages = [];
  renderEditors();
});

// ---------- Rendering ----------
function renderEditors() {
  const hasImages = uploadedImages.length > 0;
  resetBtn.hidden = !hasImages;
  uploadPlaceholder.querySelector('p').innerHTML = hasImages
    ? '<strong>הוסיפו עוד תמונות</strong> או לחצו לבחירת קבצים'
    : '<strong>גררו תמונות לכאן</strong> או לחצו לבחירת קבצים';

  editorsEl.innerHTML = uploadedImages.map((img, index) => editorTemplate(img, index)).join('');

  uploadedImages.forEach(img => {
    wireEditorFrame(img);
    wireChips(img);
    document.querySelector(`.image-editor[data-image-id="${img.id}"] .editor-remove`)
      .addEventListener('click', () => {
        uploadedImages = uploadedImages.filter(i => i.id !== img.id);
        renderEditors();
      });

    document.querySelectorAll(`.editor-frame[data-image-id="${img.id}"] .editor-box-remove`).forEach(btn => {
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tagId = btn.dataset.tagId;
        img.boxes = img.boxes.filter(b => b.id !== tagId);
        renderEditors();
      });
    });
  });
}

function editorTemplate(img, index) {
  const boxesHtml = img.boxes.map(box => `
    <div class="editor-box" data-tag-id="${box.id}"
         style="right:${100 - box.xPct - box.wPct}%; top:${box.yPct}%; width:${box.wPct}%; height:${box.hPct}%;">
      <span class="editor-box-label">${escapeHtml(box.label)}</span>
      <button type="button" class="editor-box-remove" data-tag-id="${box.id}" aria-label="הסרת תיוג">×</button>
    </div>
  `).join('');

  const chips = [img.full, ...img.boxes];
  const chipsHtml = chips.map(tag => `
    <button type="button" class="item-chip ${tag.status === 'done' ? 'has-results' : ''}" data-tag-id="${tag.id}">
      ${escapeHtml(tag.label)}
    </button>
  `).join('');

  return `
    <div class="image-editor" data-image-id="${img.id}">
      <div class="editor-header">
        <span class="editor-title">תמונה ${index + 1}</span>
        <button type="button" class="editor-remove" aria-label="הסרת תמונה ${index + 1}">הסרת התמונה ×</button>
      </div>

      <div class="editor-frame" data-image-id="${img.id}">
        <img src="${img.dataUrl}" class="editor-image" draggable="false" alt="תמונה ${index + 1} שהועלתה">
        ${boxesHtml}
      </div>
      <p class="editor-hint">גררו על התמונה כדי לסמן פריט (למשל: ג'קט, תיק, ג'ינס) ותנו לו שם</p>

      <div class="item-chips" data-image-id="${img.id}">${chipsHtml}</div>
      <div class="item-results" data-image-id="${img.id}"></div>
    </div>
  `;
}

// ---------- Draw-to-tag interaction ----------
function wireEditorFrame(img) {
  const frame = document.querySelector(`.editor-frame[data-image-id="${img.id}"]`);
  const imageEl = frame.querySelector('.editor-image');

  frame.addEventListener('pointerdown', (e) => {
    if (e.target !== frame && e.target !== imageEl) return; // ignore clicks on existing boxes
    e.preventDefault();

    const rect = frame.getBoundingClientRect();
    const startX = clampPct(((e.clientX - rect.left) / rect.width) * 100);
    const startY = clampPct(((e.clientY - rect.top) / rect.height) * 100);

    const draftEl = document.createElement('div');
    draftEl.className = 'editor-box editor-box-draft';
    frame.appendChild(draftEl);

    const updateDraft = (xPct, yPct, wPct, hPct) => {
      draftEl.style.right = `${100 - xPct - wPct}%`;
      draftEl.style.top = `${yPct}%`;
      draftEl.style.width = `${wPct}%`;
      draftEl.style.height = `${hPct}%`;
    };

    function onMove(moveEvt) {
      const curX = clampPct(((moveEvt.clientX - rect.left) / rect.width) * 100);
      const curY = clampPct(((moveEvt.clientY - rect.top) / rect.height) * 100);
      const xPct = Math.min(startX, curX);
      const yPct = Math.min(startY, curY);
      const wPct = Math.abs(curX - startX);
      const hPct = Math.abs(curY - startY);
      updateDraft(xPct, yPct, wPct, hPct);
    }

    function onUp(upEvt) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      const curX = clampPct(((upEvt.clientX - rect.left) / rect.width) * 100);
      const curY = clampPct(((upEvt.clientY - rect.top) / rect.height) * 100);
      const xPct = Math.min(startX, curX);
      const yPct = Math.min(startY, curY);
      const wPct = Math.abs(curX - startX);
      const hPct = Math.abs(curY - startY);

      if (wPct < 4 || hPct < 4) {
        draftEl.remove();
        return;
      }
      promptForLabel(frame, draftEl, img, { xPct, yPct, wPct, hPct });
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

function clampPct(v) {
  return Math.max(0, Math.min(100, v));
}

function promptForLabel(frame, draftEl, img, geometry) {
  const form = document.createElement('form');
  form.className = 'editor-label-form';
  form.style.right = `${100 - geometry.xPct - geometry.wPct}%`;
  form.style.top = `${geometry.yPct + geometry.hPct}%`;
  form.innerHTML = `<input type="text" maxlength="30" placeholder="שם הפריט, למשל ג'קט" autocomplete="off">`;
  frame.appendChild(form);
  const input = form.querySelector('input');
  input.focus();

  function commit() {
    const label = input.value.trim() || `פריט ${img.boxes.length + 1}`;
    form.remove();
    draftEl.remove();
    img.boxes.push({
      id: `tag-${nextTagId++}`,
      label,
      ...geometry,
      status: 'idle',
      products: null,
      error: null,
    });
    renderEditors();
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); commit(); });
  input.addEventListener('blur', () => { if (document.body.contains(form)) commit(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      form.removeEventListener('blur', commit);
      form.remove();
      draftEl.remove();
    }
  });
}

// ---------- Chip clicks -> search ----------
function wireChips(img) {
  const chipsWrap = document.querySelector(`.item-chips[data-image-id="${img.id}"]`);
  const resultsWrap = document.querySelector(`.item-results[data-image-id="${img.id}"]`);

  chipsWrap.querySelectorAll('.item-chip').forEach(btn => {
    btn.addEventListener('click', async () => {
      chipsWrap.querySelectorAll('.item-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const tagId = btn.dataset.tagId;
      const tag = [img.full, ...img.boxes].find(t => t.id === tagId);
      if (!tag) return;

      if (tag.status === 'done') {
        renderResultsPanel(resultsWrap, tag);
        return;
      }

      resultsWrap.innerHTML = `<div class="result-body"><span class="spinner"></span></div>`;
      tag.status = 'loading';

      try {
        const blob = tag.full
          ? img.file
          : await cropToBlob(document.querySelector(`.editor-frame[data-image-id="${img.id}"] .editor-image`), tag);

        const formData = new FormData();
        formData.append('image', blob, 'query.jpg');

        const res = await fetch('/api/search', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'החיפוש נכשל');

        tag.products = data.products || [];
        tag.status = 'done';
        btn.classList.add('has-results');
        renderResultsPanel(resultsWrap, tag);
      } catch (err) {
        tag.status = 'error';
        tag.error = err.message;
        resultsWrap.innerHTML = `
          <p class="result-error">
            לא הצלחנו לחפש עבור "${escapeHtml(tag.label)}": ${escapeHtml(err.message)}.
            ודאו ששרת ה-Node (StyleLens/server) פועל בכתובת שממנה נטען האתר.
          </p>
        `;
      }
    });
  });
}

async function cropToBlob(imageEl, box) {
  const naturalW = imageEl.naturalWidth;
  const naturalH = imageEl.naturalHeight;
  const sx = (box.xPct / 100) * naturalW;
  const sy = (box.yPct / 100) * naturalH;
  const sw = (box.wPct / 100) * naturalW;
  const sh = (box.hPct / 100) * naturalH;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageEl, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}

// ---------- Results panel (with price sort) ----------
function renderResultsPanel(container, tag) {
  const products = tag.products || [];
  if (!products.length) {
    container.innerHTML = `<p class="result-error">לא נמצאו פריטים דומים ל"${escapeHtml(tag.label)}".</p>`;
    return;
  }

  container.innerHTML = `
    <div class="result-toolbar">
      <p class="result-subheading">פריטים דומים ל"${escapeHtml(tag.label)}" - לחיצה פותחת את האתר האמיתי</p>
      <select class="sort-select" aria-label="מיון תוצאות">
        <option value="none">מיון: רלוונטיות</option>
        <option value="asc">מהזול ליקר</option>
        <option value="desc">מהיקר לזול</option>
      </select>
    </div>
    <div class="products-grid"></div>
  `;

  const grid = container.querySelector('.products-grid');
  const select = container.querySelector('.sort-select');
  renderProductGrid(grid, products);
  select.addEventListener('change', () => {
    renderProductGrid(grid, sortProducts(products, select.value));
  });
}

function sortProducts(products, mode) {
  if (mode === 'none') return products;
  const withPrice = products.filter(p => typeof p.priceValue === 'number');
  const withoutPrice = products.filter(p => typeof p.priceValue !== 'number');
  withPrice.sort((a, b) => mode === 'asc' ? a.priceValue - b.priceValue : b.priceValue - a.priceValue);
  return [...withPrice, ...withoutPrice];
}

function renderProductGrid(grid, products) {
  grid.innerHTML = products.map(p => `
    <a class="product-card" href="${p.link}" target="_blank" rel="noopener noreferrer">
      <div class="product-thumb">
        <img src="${p.thumbnail}" alt="${escapeHtml(p.title)}" loading="lazy">
      </div>
      <div class="product-info">
        <div class="p-name">${escapeHtml(p.title)}</div>
        <div class="p-store">${escapeHtml(p.source || '')} <span class="external-hint">פתיחה באתר ↗</span></div>
        ${p.price ? `<div class="p-price">${escapeHtml(p.price)}</div>` : ''}
      </div>
    </a>
  `).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
