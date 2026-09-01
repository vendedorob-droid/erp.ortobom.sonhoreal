// ============================================================
// COLCHOEIRO ERP — Módulo Dashboard (Avançado)
// ============================================================

const Dashboard = (() => {
  let unsubscribe = null;
  let currentRange = 'month'; // 'day', 'week', 'month', 'custom'

  async function render(container) {
    const profile = Auth.getProfile();

    // Entregador tem uma "Início" própria: sem faturamento/ticket médio,
    // só a rota de entregas pendentes com destaque para cliente/endereço/produtos.
    if (Auth.getRole() === 'entregador') {
      return _renderCourier(container, profile);
    }

    container.innerHTML = `<div class="fade-in">
      <div class="page-header">
        <div>
          <div class="page-title" id="dash-welcome">Olá ${profile.name.split(' ')[0]}, vamos vender!!</div>
          <div class="page-sub" id="dash-motivation">Carregando meta...</div>
        </div>
        <div style="display:flex; gap:10px">
          <select class="form-input" style="width:150px" id="dash-range" onchange="Dashboard._changeRange(this.value)">
            <option value="day">Hoje</option>
            <option value="week">Esta Semana</option>
            <option value="month" selected>Este Mês</option>
          </select>
        </div>
      </div>

      <div id="dash-metrics" class="dash-metrics-grid">${UI.skeleton(4,['25%','25%','25%','25%'])}</div>

      <div class="dash-main-grid">
        <div class="card">
          <div class="card-title" style="font-size:16px; font-weight:800">📈 Desempenho de Vendas</div>
          <div id="dash-chart-container" class="dash-chart-box"></div>
          <div style="margin-top:14px; font-size:12px; font-weight:600; color:var(--muted); text-align:center">Evolução do faturamento nos últimos dias</div>
        </div>
        <div class="card">
          <div class="card-title">🏁 Meta Mensal</div>
          <div id="dash-goal-container" style="margin-top:20px"></div>
        </div>
      </div>

      <div class="card" style="margin-top:20px">
        <div class="card-title">🛍️ Última Venda</div>
        <div id="dash-last-sale" style="margin-top:15px"></div>
      </div>
    </div>`;

    _initRealtime();
  }

  function _changeRange(val) {
    currentRange = val;
    _initRealtime();
  }

  function _initRealtime() {
    if (unsubscribe) unsubscribe();
    const companyId = Auth.getCompanyId();
    const now = new Date();
    let startDate = new Date(now.getFullYear(), now.getMonth(), 1);

    if (currentRange === 'day') startDate = new Date(now.setHours(0,0,0,0));
    else if (currentRange === 'week') {
      const day = now.getDay();
      startDate = new Date(now.setDate(now.getDate() - day));
      startDate.setHours(0,0,0,0);
    }

    unsubscribe = db.collection('companies').doc(companyId).collection('sales')
      .where('createdAt', '>=', startDate)
      .orderBy('createdAt', 'desc')
      .onSnapshot(async (snap) => {
        let totalRevenue = 0;
        let totalSales = 0;
        let lastSale = null;
        const dailyData = {};

        snap.forEach(doc => {
          const d = doc.data();
          totalRevenue += d.total || 0;
          totalSales++;
          if (!lastSale) lastSale = { id: doc.id, ...d };

          // Dados para o gráfico
          const dateStr = d.createdAt ? d.createdAt.toDate().toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}) : '—';
          dailyData[dateStr] = (dailyData[dateStr] || 0) + (d.total || 0);
        });

        _renderMetrics(totalRevenue, totalSales, lastSale);
        _renderChart(dailyData);
        _renderGoal(totalRevenue);
        _renderLastSale(lastSale);
      });
  }

  function _renderMetrics(rev, count, last) {
    const el = document.getElementById('dash-metrics');
    el.innerHTML = `
      <div class="dash-metric-hero is-primary">
        <div class="dm-label">Faturamento Total</div>
        <div class="dm-value c-accent">${UI.money(rev)}</div>
        <div class="dm-sub">${currentRange === 'day' ? 'VENDAS DE HOJE' : 'NO PERÍODO SELECIONADO'}</div>
      </div>
      <div class="dash-metric-hero">
        <div class="dm-label">Qtd Vendas</div>
        <div class="dm-value">${count}</div>
        <div class="dm-sub">PEDIDOS FINALIZADOS</div>
      </div>
      <div class="dash-metric-hero">
        <div class="dm-label">Ticket Médio</div>
        <div class="dm-value">${UI.money(count > 0 ? rev/count : 0)}</div>
        <div class="dm-sub">POR VENDA</div>
      </div>
      <div class="dash-metric-hero">
        <div class="dm-label">Última Venda</div>
        <div class="dm-value c-green">${last ? UI.money(last.total) : '—'}</div>
        <div class="dm-sub">${last ? last.customerName.toUpperCase() : 'AGUARDANDO...'}</div>
      </div>
    `;
  }

  function _renderChart(data) {
    const container = document.getElementById('dash-chart-container');
    const entries = Object.entries(data).slice(-7); // Últimos 7 dias com venda
    if (entries.length === 0) {
      container.innerHTML = '<div style="width:100%; text-align:center; color:var(--muted); grid-column:1/-1; padding:20px 0">Sem dados para exibir no gráfico.</div>';
      return;
    }
    const max = Math.max(...Object.values(data));
    container.innerHTML = entries.map(([date, val]) => {
      const isTop = max > 0 && val === max;
      return `
        <div class="dash-day-card ${isTop ? 'is-top' : ''}" title="${UI.money(val)}">
          <div class="dash-day-date">${date}</div>
          <div class="dash-day-value">${_fmtBarVal(val)}</div>
          ${isTop ? '<div class="dash-day-badge">🏆 Melhor dia</div>' : ''}
        </div>
      `;
    }).join('');
  }

  // Evita rótulos enganosos tipo "0k" para vendas abaixo de R$1.000,
  // e usa uma casa decimal acima disso (ex: R$2.450 → "2,5k").
  function _fmtBarVal(v) {
    if (v >= 1000) {
      const k = v / 1000;
      return (Number.isInteger(k) ? k : k.toFixed(1).replace('.', ',')) + 'k';
    }
    return 'R$' + Math.round(v);
  }

  async function _renderGoal(current) {
    const companyId = Auth.getCompanyId();
    const sSnap = await db.collection('companies').doc(companyId).collection('settings').doc('general').get();
    const goal = sSnap.exists ? (sSnap.data().monthlyGoal || 50000) : 50000;
    const pct = Math.min(100, Math.round((current / goal) * 100));

    document.getElementById('dash-motivation').textContent = `Falta muito pouco para atingir sua meta de ${UI.money(goal)}!!`;

    document.getElementById('dash-goal-container').innerHTML = `
      <div style="text-align:center; margin-bottom:15px">
        <div class="dash-goal-pct">${pct}%</div>
        <div style="font-size:12px; color:var(--muted)">Meta de ${UI.money(goal)}</div>
      </div>
      <div style="background:var(--surface2); height:12px; border-radius:10px; overflow:hidden">
        <div style="width:${pct}%; background:linear-gradient(90deg, var(--accent), #10b981); height:100%; transition: width 1s ease"></div>
      </div>
      <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:11px; color:var(--muted2)">
        <span>R$ 0</span>
        <span>${UI.money(current)} alcançados</span>
      </div>
    `;
  }

  function _renderLastSale(sale) {
    const el = document.getElementById('dash-last-sale');
    if (!sale) { el.innerHTML = '<div style="color:var(--muted)">Nenhuma venda recente.</div>'; return; }
    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; background:var(--surface2); padding:15px; border-radius:12px">
        <div>
          <div style="font-weight:700; font-size:15px">${sale.customerName}</div>
          <div style="font-size:12px; color:var(--muted)">${UI.date(sale.createdAt)} · ${sale.sellerName} · ${sale.paymentMethod.toUpperCase()}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:800; font-size:18px; color:var(--green)">${UI.money(sale.total)}</div>
          <button class="btn btn-ghost btn-sm" onclick="Sales._detail('${sale.id}')">Ver Detalhes</button>
        </div>
      </div>
    `;
  }

  // ============================================================
  // Início do Entregador — SEM faturamento / ticket médio.
  // Foco: nome e endereço do cliente + produto(s) da entrega.
  // ============================================================
  async function _renderCourier(container, profile) {
    container.innerHTML = `<div class="fade-in">
      <div class="page-header">
        <div>
          <div class="page-title">Olá ${profile.name.split(' ')[0]}, boas entregas! 🚚</div>
          <div class="page-sub" id="dc-sub">Carregando sua rota...</div>
        </div>
      </div>

      <div class="dash-metrics-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
        <div class="dash-metric-hero is-primary">
          <div class="dm-label">Entregas Pendentes</div>
          <div class="dm-value c-accent" id="dc-pending">—</div>
          <div class="dm-sub">PARA HOJE</div>
        </div>
        <div class="dash-metric-hero">
          <div class="dm-label">Entregues Hoje</div>
          <div class="dm-value c-green" id="dc-done">—</div>
          <div class="dm-sub">CONCLUÍDAS</div>
        </div>
      </div>

      <div class="page-header" style="margin-bottom:12px">
        <div class="card-title">📦 Próximas entregas</div>
        <button class="btn btn-secondary btn-sm" onclick="loadModule('deliveries')">Ver todas →</button>
      </div>
      <div id="dc-list" style="display:flex; flex-direction:column; gap:12px">${UI.skeleton(3,['100%'])}</div>
    </div>`;

    const companyId = Auth.getCompanyId();
    const profileId = Auth.getProfileId();

    const [pendSnap, doneSnap] = await Promise.all([
      db.collection('companies').doc(companyId).collection('deliveries').where('status', '==', 'pendente').get(),
      db.collection('companies').doc(companyId).collection('deliveries').where('status', '==', 'entregue').get()
    ]);

    const pending = pendSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const todayStr = new Date().toDateString();
    const doneToday = doneSnap.docs
      .map(d => d.data())
      .filter(d => d.deliveredBy === profileId && d.deliveredAt?.toDate && d.deliveredAt.toDate().toDateString() === todayStr);

    document.getElementById('dc-sub').textContent = pending.length
      ? `Você tem ${pending.length} entrega${pending.length > 1 ? 's' : ''} para fazer`
      : 'Nenhuma entrega pendente no momento';
    document.getElementById('dc-pending').textContent = pending.length;
    document.getElementById('dc-done').textContent = doneToday.length;

    const list = document.getElementById('dc-list');
    if (pending.length === 0) {
      list.innerHTML = '<div class="card" style="text-align:center;padding:40px;color:var(--muted)">🎉 Nenhuma entrega pendente. Bom trabalho!</div>';
      return;
    }

    list.innerHTML = pending.slice(0, 5).map(d => `
      <div class="card" style="border-left:4px solid var(--accent)">
        <div style="font-weight:800; font-size:16px">${d.customerName}</div>
        <div style="font-size:13px; color:var(--muted); margin:4px 0 2px">📍 ${d.address || '—'}${d.building ? ' · ' + d.building : ''}${d.apartment ? ' · Apto ' + d.apartment : ''}</div>
        ${d.items && d.items.length ? `<div class="delivery-items">${d.items.map(i => `<span class="delivery-item-badge">📦 ${i.qty}× ${i.name}</span>`).join('')}</div>` : ''}
      </div>
    `).join('');
  }

  return { render, _changeRange };
})();
