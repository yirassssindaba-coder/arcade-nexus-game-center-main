(() => {
  const itemForm = document.getElementById('itemForm');
  const itemsEl = document.getElementById('items');
  const usersEl = document.getElementById('users');
  const auditEl = document.getElementById('audit');
  const telemetryEl = document.getElementById('telemetry');
  const flagsEl = document.getElementById('flags');
  const refreshBtn = document.getElementById('refreshBtn');

  async function getJson(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderError(target, error) {
    target.innerHTML = `<div class="log-item">${escapeHtml(error.message || 'Unknown error')}</div>`;
  }

  async function loadItems() {
    try {
      const json = await getJson('/api/v1/items?sort=-updatedAt&size=20');
      const rows = json.data || [];
      itemsEl.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Title</th><th>Genre</th><th>Tier</th><th>Status</th><th>Fun</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(item => `
              <tr>
                <td>
                  <strong>${escapeHtml(item.name)}</strong>
                  <div class="muted">${escapeHtml((item.tags || []).join(', '))}</div>
                </td>
                <td>${escapeHtml(item.category)}</td>
                <td><span class="badge">${escapeHtml(item.rarity)}</span></td>
                <td>${escapeHtml(item.status)}</td>
                <td>${Number(item.power || 0)}</td>
                <td>
                  <div class="actions-row">
                    <button data-id="${escapeHtml(item.id)}" data-action="publish">Publish</button>
                    <button data-id="${escapeHtml(item.id)}" data-action="archive" class="secondary">Archive</button>
                    <button data-id="${escapeHtml(item.id)}" data-action="delete" class="danger">Delete</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;

      itemsEl.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const { id, action } = btn.dataset;
          try {
            if (action === 'delete') {
              await fetch(`/api/v1/items/${id}`, { method: 'DELETE' });
            } else {
              await fetch(`/api/v1/items/${id}/actions/${action}`, { method: 'POST' });
            }
            await refreshAll();
          } catch (error) {
            console.error(error);
          }
        });
      });
    } catch (error) {
      renderError(itemsEl, error);
    }
  }

  async function loadUsers() {
    try {
      const json = await getJson('/api/v1/users?size=8');
      const users = json.data || [];
      usersEl.innerHTML = users.map(user => `
        <div class="log-item">
          <strong>${escapeHtml(user.name)}</strong>
          <div class="muted">${escapeHtml(user.email)}</div>
          <div>${(user.roles || []).map(role => `<span class="badge">${escapeHtml(role)}</span>`).join(' ')}</div>
        </div>
      `).join('');
    } catch (error) {
      renderError(usersEl, error);
    }
  }

  async function loadAudit() {
    try {
      const json = await getJson('/api/v1/audit?size=12');
      const entries = json.data || [];
      auditEl.innerHTML = entries.map(entry => `
        <div class="log-item">
          <strong>${escapeHtml(entry.action || 'unknown')}</strong>
          <div class="muted">${escapeHtml(entry.entity || '')} ${escapeHtml(entry.entityId || '')}</div>
          <div class="muted">${escapeHtml(entry.createdAt || '')}</div>
        </div>
      `).join('');
    } catch (error) {
      renderError(auditEl, error);
    }
  }

  async function loadTelemetry() {
    try {
      const json = await getJson('/api/v1/telemetry/events?sort=-createdAt&size=12');
      const entries = json.data || [];
      telemetryEl.innerHTML = entries.map(entry => `
        <div class="log-item">
          <strong>${escapeHtml(entry.name || 'event')}</strong>
          <div class="muted">${escapeHtml(entry.createdAt || '')}</div>
          <div class="muted">${escapeHtml(JSON.stringify(entry.properties || {}))}</div>
        </div>
      `).join('');
    } catch (error) {
      renderError(telemetryEl, error);
    }
  }

  async function loadFlags() {
    try {
      const json = await getJson('/api/v1/feature-flags');
      const flags = json.data || [];
      flagsEl.innerHTML = flags.map(flag => `
        <label class="log-item" style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <span>
            <strong>${escapeHtml(flag.key)}</strong>
            <div class="muted">${escapeHtml(flag.description || '')}</div>
          </span>
          <input type="checkbox" data-key="${escapeHtml(flag.key)}" ${flag.enabled ? 'checked' : ''}>
        </label>
      `).join('');

      flagsEl.querySelectorAll('input[type="checkbox"]').forEach(input => {
        input.addEventListener('change', async () => {
          try {
            await fetch('/api/v1/feature-flags', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ flags: [{ key: input.dataset.key, enabled: input.checked }] })
            });
            await Promise.all([loadAudit(), loadTelemetry()]);
          } catch (error) {
            console.error(error);
          }
        });
      });
    } catch (error) {
      renderError(flagsEl, error);
    }
  }

  async function refreshAll() {
    await Promise.all([loadItems(), loadUsers(), loadAudit(), loadFlags(), loadTelemetry()]);
  }

  itemForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(itemForm).entries());
    body.power = Number(body.power || 0);
    body.value = Number(body.value || 0);
    body.tags = [body.category, body.rarity].filter(Boolean);

    try {
      await fetch('/api/v1/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      itemForm.reset();
      itemForm.querySelector('[name="category"]').value = 'arcade';
      itemForm.querySelector('[name="rarity"]').value = 'common';
      itemForm.querySelector('[name="power"]').value = '50';
      itemForm.querySelector('[name="value"]').value = '75';
      await refreshAll();
    } catch (error) {
      console.error(error);
    }
  });

  refreshBtn.addEventListener('click', () => {
    refreshAll().catch(error => console.error(error));
  });

  refreshAll().catch(error => {
    console.error(error);
  });
})();
