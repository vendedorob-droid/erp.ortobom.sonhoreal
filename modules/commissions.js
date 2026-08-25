// ============================================================
// COLCHOEIRO ERP — Módulo Comissões
// ============================================================
const Commissions = (() => {
  let range = 'month';

  async function render(container) {
    container.innerHTML = `<div class="fade-in">
      <div class="page-header">
        <div><div class="page-title">Comissões</div><div class="page-sub" id="cm-sub">Carregando...</div></div>
        <select class="form-input" style="width:160px" id="cm-range" onchange="Commissions._changeRange(this.value)">
          <option value="month" selected>Este Mês</option>
          <option value="all">Tudo</option>
        </select>
      </div>
      <div id="cm-ranking">${UI.skeleton(4,['40%','20%','20%','20%'])}</div>
    </div>`;
    await _load();
  }

  function _changeRange(v) { range = v; _load(); }

  async function _load() {
    const companyId = Auth.getCompanyId();
    let query = db.collection('companies').doc(companyId).collection('sales').where('status', '==', 'concluido');

    if (range === 'month') {
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      query = query.where('createdAt', '>=', startDate);
    }

    const snap = await query.get();
    const bySeller = {};
    let totalCommission = 0;

    snap.forEach(doc => {
      const s = doc.data();
      const key = s.sellerId || 'sem-vendedor';
      if (!bySeller[key]) bySeller[key] = { name: s.sellerName || 'Sem vendedor', total: 0, commission: 0, count: 0 };
      bySeller[key].total += s.total || 0;
      bySeller[key].commission += s.commissionVal || 0;
      bySeller[key].count++;
      totalCommission += s.commissionVal || 0;
    });

    const ranking = Object.values(bySeller).sort((a, b) => b.commission - a.commission);
    document.getElementById('cm-sub').textContent = `${UI.money(totalCommission)} em comissões · ${range === 'month' ? 'este mês' : 'todo o período'}`;
    _renderRanking(ranking);
  }

  function _renderRanking(ranking) {
    const el = document.getElementById('cm-ranking');
    if (ranking.length === 0) {
      el.innerHTML = '<div class="card" style="text-align:center;padding:40px;color:var(--muted)">Nenhuma venda no período selecionado.</div>';
      return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px">
      ${ranking.map((r, i) => `
        <div class="card" style="display:flex;align-items:center;gap:16px">
          <div style="font-size:24px;width:36px;text-align:center">${medals[i] || (i+1) + 'º'}</div>
          <div style="flex:1">
            <div style="font-weight:800;font-size:16px">${r.name}</div>
            <div style="font-size:12px;color:var(--muted)">${r.count} venda(s) · ${UI.money(r.total)} em vendas</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:800;font-size:20px;color:var(--green)">${UI.money(r.commission)}</div>
            <div style="font-size:11px;color:var(--muted)">comissão</div>
          </div>
        </div>
      `).join('')}
    </div>`;
  }

  return { render, _changeRange };
})();
