// ============================================================
// COLCHOEIRO ERP — Impressão (Comprovante do Pedido)
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
// Comprovante do Pedido — exibido ao fechar a venda, e reimprimível a
// qualquer momento a partir da lista/detalhe de Vendas.
// ============================================================
const Receipt = (() => {
  let _cache = null; // { s, company } — usado pelo botão Imprimir do modal

  async function show(saleId, saleData = null) {
    UI.loading(true, 'Preparando comprovante...');
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
      title: '🧾 Comprovante do Pedido',
      size: 'lg',
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
    const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const created = s.createdAt?.toDate ? s.createdAt.toDate() : (s.createdAt ? new Date(s.createdAt) : new Date());
    const dateTime = created.toLocaleDateString('pt-BR') + ' ' + created.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const items = s.items || [];
    const subtotal = s.subtotal ?? s.total ?? 0;
    const discount = Math.max(0, subtotal - (s.total || 0));
    const num = s.orderNumber ? String(s.orderNumber).padStart(5, '0') : (s.id || '').slice(-6).toUpperCase();
    const qtyTotal = items.reduce((a, i) => a + (Number(i.qty) || 0), 0);
    const m = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const d = s.delivery || {};
    const complement = [d.building, d.block && 'Quadra ' + d.block, d.floor && 'Andar ' + d.floor, d.apartment && 'Apto ' + d.apartment].filter(Boolean).join(' · ');
    const payName = (s.paymentMethodName || (s.paymentMethod || '').replace(/_/g, ' ')).toUpperCase();
    const payDetail = s.installments > 1 ? `${s.installments}x de ${m(s.installmentValue || s.total / s.installments)}` : 'À VISTA';
    const legal = company.legalName || company.fantasyName || 'Colchoeiro ERP';
    const terms = company.receiptTerms || '';
    const cell = (label, value, extra = '') => `<td class="rc-c" ${extra}><div class="rc-l">${label}</div><div class="rc-v">${esc(value) || '&nbsp;'}</div></td>`;

    return `
    <style>
      .rc { font-family: Arial, Helvetica, sans-serif; color:#111; background:#fff; width:100%; max-width:780px; margin:0 auto; padding:16px; box-sizing:border-box; font-size:11px; }
      .rc table { width:100%; border-collapse:collapse; table-layout:fixed; }
      .rc-c { border:1px solid #333; padding:3px 6px; vertical-align:top; }
      .rc-l { font-size:8px; text-transform:uppercase; color:#444; }
      .rc-v { font-size:11px; font-weight:700; min-height:13px; word-break:break-word; }
      .rc-sec { font-size:9px; font-weight:800; text-transform:uppercase; padding:6px 0 2px; }
      .rc-pi { font-size:20px; font-weight:800; text-align:center; letter-spacing:1px; }
      .rc-items th { border:1px solid #333; font-size:9px; padding:3px 4px; background:#f2f2f2; text-transform:uppercase; }
      .rc-items td { border-left:1px solid #333; border-right:1px solid #333; padding:3px 5px; font-size:11px; }
      .rc-items tr:last-child td { border-bottom:1px solid #333; }
      .rc-cut { border-top:1px dashed #666; margin:8px 0; }
      .rc-r { text-align:right; }
      @media print { .rc { padding:10mm 10mm; max-width:none; } .rc table, .rc tr { page-break-inside:avoid; } }
    </style>
    <div class="rc">
      <!-- Canhoto de recebimento -->
      <table><tr>
        <td class="rc-c" style="width:78%">
          <div class="rc-l" style="font-size:8px">Recebemos da empresa ${esc(legal)} os produtos constantes neste documento.</div>
          <table style="margin-top:2px"><tr>
            <td style="width:30%; border-right:1px solid #333; padding:2px 4px; height:30px"><div class="rc-l">Data do recebimento</div></td>
            <td style="padding:2px 4px"><div class="rc-l">Identificação e assinatura do recebedor</div></td>
          </tr></table>
        </td>
        <td class="rc-c" style="vertical-align:middle"><div class="rc-pi">PI &nbsp; ${num}</div></td>
      </tr></table>
      <div class="rc-cut"></div>

      <!-- Cabeçalho da empresa -->
      <table><tr>
        <td class="rc-c" style="width:78%; text-align:center; padding:8px">
          ${company.logoUrl ? `<img src="${esc(company.logoUrl)}" style="max-height:44px; margin-bottom:4px"><br>` : ''}
          <div style="font-size:14px; font-weight:800; text-transform:uppercase">${esc(legal)}</div>
          ${company.address ? `<div style="font-size:11px; margin-top:2px">${esc(company.address)}</div>` : ''}
          ${company.phone ? `<div style="font-size:11px">Fone/WhatsApp: ${esc(company.phone)}</div>` : ''}
          ${company.email ? `<div style="font-size:10px">${esc(company.email)}</div>` : ''}
        </td>
        <td class="rc-c" style="vertical-align:middle; text-align:center">
          <div class="rc-pi">PI &nbsp; ${num}</div>
          <div style="font-size:8px; text-align:left; margin-top:10px; line-height:1.5">1 - ENTREGA<br>2 - ARQUIVO<br>3 - CLIENTE</div>
        </td>
      </tr></table>

      <table style="margin-top:4px"><tr>
        ${cell('Natureza da operação', 'VENDA', 'style="width:30%"')}
        ${cell('Loja', s.storeName || '', 'style="width:30%"')}
        ${cell('Data/hora da emissão', dateTime)}
      </tr></table>
      <table><tr>
        ${cell('Inscrição estadual', company.ie || '', 'style="width:30%"')}
        ${cell('CNPJ', company.cnpj || '', 'style="width:30%"')}
        ${cell('Vendedor', s.sellerName || '')}
      </tr></table>

      <div class="rc-sec">Destinatário</div>
      <table>
        <tr>${cell('Nome / Razão social', s.customerName || '', 'style="width:68%"')}${cell('CNPJ / CPF', s.customerDocument || '')}</tr>
      </table>
      <table>
        <tr>${cell('Endereço', s.customerAddress || '', 'style="width:45%"')}${cell('Bairro / Distrito', s.customerNeighborhood || '', 'style="width:30%"')}${cell('CEP', s.customerCep || '')}</tr>
      </table>
      <table>
        <tr>${cell('Município / UF', s.customerCity || '', 'style="width:45%"')}${cell('Fone', s.customerPhone || '', 'style="width:30%"')}${cell('Complemento da entrega', complement)}</tr>
      </table>

      <div class="rc-sec">Forma de pagamento</div>
      <table>
        <tr>
          ${cell('Forma', payName, 'style="width:34%"')}
          ${cell('Condição', payDetail, 'style="width:22%"')}
          ${cell('Valor total dos produtos', m(subtotal), 'class="rc-c rc-r"')}
        </tr>
        <tr>
          <td class="rc-c" colspan="2"></td>
          ${cell('Desconto', m(discount), 'class="rc-c rc-r"')}
        </tr>
        <tr>
          <td class="rc-c" colspan="2"></td>
          <td class="rc-c rc-r"><div class="rc-l">Valor total do documento</div><div class="rc-v" style="font-size:15px">${m(s.total)}</div></td>
        </tr>
      </table>

      <div class="rc-sec">Dados do produto / serviço &nbsp;·&nbsp; Qtd de itens: ${String(qtyTotal).padStart(5, '0')}</div>
      <table class="rc-items">
        <thead><tr>
          <th style="width:14%">Código</th><th>Discriminação do produto / serviço</th>
          <th style="width:6%">Unid.</th><th style="width:8%">Qtd</th>
          <th style="width:14%">Valor unitário</th><th style="width:14%">Valor total</th>
        </tr></thead>
        <tbody>
          ${items.map(i => `<tr>
            <td>${esc(i.barcode || (i.id || '').slice(-5).toUpperCase())}</td>
            <td>${esc(`${i.brand || ''} ${i.model || ''} ${i.technology || ''} ${i.measures || ''}`.replace(/\s+/g, ' ').trim())}</td>
            <td style="text-align:center">UN</td>
            <td style="text-align:center">${String(i.qty || 1).padStart(5, '0')}</td>
            <td class="rc-r">${m(i.price)}</td>
            <td class="rc-r">${m((i.price || 0) * (i.qty || 1))}</td>
          </tr>`).join('')}
        </tbody>
      </table>

      <div class="rc-sec">Dados adicionais</div>
      <table><tr>
        <td class="rc-c" style="width:45%; height:90px"><div class="rc-l">Observação do cliente:</div><div class="rc-v" style="font-weight:400">${esc(s.obs || '')}</div></td>
        <td class="rc-c"><div class="rc-l">Observação do produto:</div><div style="font-size:9px; font-weight:700; line-height:1.35">${esc(terms)}</div></td>
      </tr></table>
    </div>`;
  }

  return { show, _print };
})();
