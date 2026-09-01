// ============================================================
// COLCHOEIRO ERP — Upload de Imagens (Cloudinary)
// ============================================================
// Usa um "unsigned upload preset" do Cloudinary — o navegador
// envia a imagem direto para a Cloudinary, sem passar por nenhum
// backend nosso e sem expor chave secreta nenhuma (a chave secreta
// da Cloudinary NUNCA entra neste app; só o Cloud Name e o nome do
// preset, que são públicos por natureza).
//
// Como configurar (uma vez só, gratuito):
//   1. Crie uma conta em cloudinary.com
//   2. No painel: Settings → Upload → Upload presets → Add upload preset
//   3. Signing Mode: "Unsigned" → salvar
//   4. Cole o Cloud Name (aparece no topo do painel) e o nome do preset
//      em Configurações → Imagens, dentro do próprio ERP.

const Cloudinary = (() => {
  let cfg = null; // { cloudName, uploadPreset }

  async function getConfig(force = false) {
    if (cfg && !force) return cfg;
    try {
      const companyId = Auth.getCompanyId();
      const snap = await db.collection('companies').doc(companyId).collection('settings').doc('general').get();
      const d = snap.exists ? snap.data() : {};
      cfg = { cloudName: d.cloudinaryCloudName || '', uploadPreset: d.cloudinaryUploadPreset || '' };
    } catch (e) {
      cfg = { cloudName: '', uploadPreset: '' };
    }
    return cfg;
  }

  function isConfigured() {
    return !!(cfg && cfg.cloudName && cfg.uploadPreset);
  }

  // Envia um File e resolve com a URL segura (https) da imagem no Cloudinary.
  function upload(file, onProgress) {
    return new Promise((resolve, reject) => {
      getConfig().then(c => {
        if (!c.cloudName || !c.uploadPreset) {
          reject(new Error('Cloudinary não configurado. Peça ao admin para preencher isso em Configurações → Imagens.'));
          return;
        }
        const form = new FormData();
        form.append('file', file);
        form.append('upload_preset', c.uploadPreset);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `https://api.cloudinary.com/v1_1/${c.cloudName}/image/upload`);
        xhr.upload.onprogress = (e) => {
          if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          try {
            const res = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && res.secure_url) resolve(res.secure_url);
            else reject(new Error(res.error?.message || 'Falha no upload da imagem.'));
          } catch (e) { reject(new Error('Resposta inválida do Cloudinary.')); }
        };
        xhr.onerror = () => reject(new Error('Erro de rede ao enviar a imagem.'));
        xhr.send(form);
      });
    });
  }

  // ── Widget reutilizável: liga um <input type=file> escondido a um
  // botão, um preview <img> e o <input> de texto com a URL final —
  // que continua editável manualmente (colar link direto ainda funciona,
  // é só um caminho alternativo ao upload). ─────────────────────────
  function bindPicker({ fileInputId, previewId, urlInputId, progressId }) {
    const fileInput = document.getElementById(fileInputId);
    if (!fileInput) return;

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { UI.toast('Selecione um arquivo de imagem.', 'warn'); fileInput.value = ''; return; }
      if (file.size > 8 * 1024 * 1024) { UI.toast('Imagem muito grande (máx. 8MB).', 'warn'); fileInput.value = ''; return; }

      const progressEl = progressId ? document.getElementById(progressId) : null;
      if (progressEl) { progressEl.style.display = 'block'; progressEl.textContent = 'Enviando... 0%'; }

      try {
        const url = await upload(file, (pct) => { if (progressEl) progressEl.textContent = `Enviando... ${pct}%`; });
        const urlInput = document.getElementById(urlInputId);
        if (urlInput) urlInput.value = url;
        const preview = document.getElementById(previewId);
        if (preview) { preview.src = url; preview.style.display = 'block'; }
        if (progressEl) progressEl.style.display = 'none';
        UI.toast('Imagem enviada!', 'success');
      } catch (err) {
        if (progressEl) progressEl.style.display = 'none';
        UI.toast(err.message, 'error');
      } finally {
        fileInput.value = '';
      }
    });
  }

  return { getConfig, isConfigured, upload, bindPicker };
})();
