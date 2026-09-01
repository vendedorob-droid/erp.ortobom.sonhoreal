// ============================================================
// COLCHOEIRO ERP — Impressão (Recibo de Compra)
// ============================================================
// Usa o próprio diálogo de impressão do navegador (window.print()).
// Isso cobre "imprimir" E "salvar em PDF" ao mesmo tempo — no diálogo
// de impressão o usuário escolhe a impressora ou "Salvar como PDF".
// Não depende de nenhuma biblioteca paga/externa.

const PrintDoc = (() => {
  function open(html, title) {
    let area = document.getElementById('print-area');
    if (!area) {
      area = document.createElement('div');
      area.id = 'print-area';
      document.body.appendChild(area);
    }
    area.innerHTML = html;

    // Troca o título da aba durante a impressão: além de ficar mais limpo
    // caso o navegador ainda desenhe algum cabeçalho, também vira o nome
    // sugerido do arquivo ao usar "Salvar como PDF". Restaura sozinho
    // depois que o diálogo de impressão fecha.
    const prevTitle = document.title;
    if (title) {
      document.title = title;
      const restore = () => { document.title = prevTitle; window.removeEventListener('afterprint', restore); };
      window.addEventListener('afterprint', restore);
    }

    // Pequeno delay garante que o navegador termine de montar o conteúdo
    // antes de abrir o diálogo de impressão.
    setTimeout(() => window.print(), 60);
  }
  return { open };
})();

// ============================================================
// Recibo de Compra — exibido ao fechar a venda, e reimprimível a
// qualquer momento a partir da lista/detalhe de Vendas.
// ============================================================
const Receipt = (() => {
  let _cache = null; // { s, company } — usado pelo botão Imprimir do modal

  async function show(saleId, saleData = null) {
    UI.loading(true, 'Preparando recibo...');
    try {
      const companyId = Auth.getCompanyId();
      let s;
      if (saleData) {
        s = { id: saleId, ...saleData };
      } else {
        const doc = await db.collection('companies').doc(companyId).collection('sales').doc(saleId).get();
        if (!doc.exists) { UI.loading(false); UI.toast('Venda não encontrada.', 'error'); return; }
        s = { id: doc.id, ...doc.data() };
      }
      const setSnap = await db.collection('companies').doc(companyId).collection('settings').doc('general').get();
      const company = setSnap.exists ? setSnap.data() : {};
      UI.loading(false);
      _preview(s, company);
    } catch (err) {
      UI.loading(false);
      UI.toast('Erro ao carregar recibo: ' + err.message, 'error');
    }
  }

  function _preview(s, company) {
    _cache = { s, company };
    UI.modal({
      title: '🧾 Recibo de Compra',
      size: 'md',
      body: `
        <div style="max-height:60vh; overflow:auto; background:#fff; border-radius:8px">${_html(s, company)}</div>
        <div style="font-size:11px; color:var(--muted); text-align:center; margin-top:10px">
          Dica: se a impressão sair com link/data no topo, desmarque "Cabeçalhos e rodapés" em Mais configurações no diálogo de impressão.
        </div>
      `,
      actions: [
        { label: 'Fechar', cls: 'btn btn-secondary', action: 'UI.closeModal()' },
        { label: '🖨️ Imprimir', cls: 'btn btn-primary', action: 'Receipt._print()' }
      ]
    });
  }

  function _print() {
    if (!_cache) return;
    PrintDoc.open(_html(_cache.s, _cache.company), `Recibo-${(_cache.s.id || '').slice(-8).toUpperCase()}`);
  }

  function _html(s, company) {
    const created = s.createdAt?.toDate ? s.createdAt.toDate() : (s.createdAt ? new Date(s.createdAt) : new Date());
    const dateStr = created.toLocaleDateString('pt-BR');
    const timeStr = created.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const subtotal = s.subtotal ?? s.total ?? 0;
    const discount = subtotal - (s.total || 0);

    return `
    <style>
      .receipt-doc { font-family:'DM Sans', Arial, sans-serif; color:#111; background:#fff; max-width:480px; margin:0 auto; padding:24px; }
      .receipt-doc h1 { font-size:18px; margin:0 0 2px; }
      .receipt-doc .r-sub { font-size:11px; color:#555; margin-bottom:2px; }
      .receipt-doc .r-divider { border-top:1px dashed #999; margin:14px 0; }
      .receipt-doc table { width:100%; border-collapse:collapse; font-size:12px; }
      .receipt-doc th { text-align:left; font-size:10px; text-transform:uppercase; color:#555; border-bottom:1px solid #ccc; padding:4px 2px; }
      .receipt-doc td { padding:5px 2px; border-bottom:1px solid #eee; }
      .receipt-doc .r-label { font-size:11px; color:#555; margin-top:6px; }
      .receipt-doc .r-foot { text-align:center; font-size:11px; color:#555; margin-top:18px; }
      @media print { .receipt-doc { padding:0; } }
    </style>
    <div class="receipt-doc">
      <div style="text-align:center; margin-bottom:10px">
        ${company.logoUrl ? `<img src="${company.logoUrl}" style="max-height:50px;margin-bottom:6px">` : ''}
        <h1>${company.fantasyName || 'Colchoeiro ERP'}</h1>
        <div class="r-sub">Recibo de Compra · Venda #${(s.id || '').slice(-8).toUpperCase()}</div>
        <div class="r-sub">${dateStr} às ${timeStr}</div>
      </div>
      <div class="r-divider"></div>
      <div style="font-size:12px; margin-bottom:4px"><b>Cliente:</b> ${s.customerName || '—'}</div>
      <div style="font-size:12px; margin-bottom:4px"><b>Vendedor:</b> ${s.sellerName || '—'}</div>
      <div class="r-divider"></div>
      <table>
        <thead><tr><th>Produto</th><th>Qtd</th><th style="text-align:right">Preço</th><th style="text-align:right">Subtotal</th></tr></thead>
        <tbody>
          ${(s.items || []).map(i => `<tr>
            <td>${i.brand || ''} ${i.model || ''}</td>
            <td>${i.qty}</td>
            <td style="text-align:right">${UI.money(i.price)}</td>
            <td style="text-align:right">${UI.money((i.price || 0) * (i.qty || 1))}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="r-divider"></div>
      <div style="font-size:12px; display:flex; justify-content:space-between"><span>Subtotal</span><span>${UI.money(subtotal)}</span></div>
      ${discount > 0.004 ? `<div style="font-size:12px; display:flex; justify-content:space-between; color:#0a7"><span>Desconto</span><span>-${UI.money(discount)}</span></div>` : ''}
      <div style="display:flex; justify-content:space-between; margin-top:6px"><span style="font-weight:800; font-size:15px">Total</span><span style="font-weight:800; font-size:15px">${UI.money(s.total)}</span></div>
      <div class="r-label">
        Pagamento: <b>${(s.paymentMethodName || (s.paymentMethod || '').replace(/_/g, ' ')).toUpperCase()}</b>
        ${s.installments > 1 ? ` — ${s.installments}x de ${UI.money(s.installmentValue || s.total / s.installments)}` : ''}
      </div>
      <div class="r-foot">Obrigado pela preferência! 🛏️</div>
    </div>`;
  }

  return { show, _print };
})();
