document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registrationForm');
  const status = document.getElementById('status');
  const upiInfoField = document.getElementById('upiInfoField');
  const adminToggle = document.getElementById('adminToggle');
  const adminPanel = document.getElementById('adminPanel');
  const adminUser = document.getElementById('adminUser');
  const adminPass = document.getElementById('adminPass');
  const adminLoad = document.getElementById('adminLoad');
  const adminStatus = document.getElementById('adminStatus');
  const adminList = document.getElementById('adminList');

  const paymentRadios = form.querySelectorAll('input[name="paymentOption"]');
  function updateUPIVisibility() {
    const selected = [...paymentRadios].find(r => r.checked)?.value || '';
    if (selected.toLowerCase() === 'upi') {
      upiInfoField.classList.remove('hidden');
    } else {
      upiInfoField.classList.add('hidden');
    }
  }
  paymentRadios.forEach(r => r.addEventListener('change', updateUPIVisibility));
  updateUPIVisibility();

  let adminToken = null;
  const BASE = (window.API_BASE_URL || '').replace(/\/+$/, '');

  function renderPlayers(players) {
    adminList.innerHTML = '';
    if (!players.length) {
      adminList.textContent = 'No registrations yet.';
      return;
    }
    players.forEach(p => {
      const roleClass =
        p.role === 'batsman' ? 'role-batsman' :
        p.role === 'bowler' ? 'role-bowler' : 'role-all-rounder';
      const payClass = p.payment_option === 'upi' ? 'pay-upi' : 'pay-cash';
      const card = document.createElement('div');
      card.className = 'card buttonish';
      card.innerHTML = `
        <div>
          <div><strong>${p.name}</strong> <small>Age ${p.age}</small></div>
          <div class="badges" style="margin:6px 0 10px;">
            <span class="badge ${roleClass}">${p.role.toUpperCase()}</span>
            <span class="badge ${payClass}">${p.payment_option.toUpperCase()}</span>
            ${p.collected ? '<span class="badge" style="background:#16a34a;">COLLECTED</span>' : ''}
          </div>
          <div>Contact: ${p.contact_number}</div>
          <div>Track: ${p.track_size} | Jersey: ${p.jersey_size} #${p.jersey_number}</div>
          ${p.upi_image_path ? `<div style="margin-top:8px;"><img class="thumb" src="${p.upi_image_path}" alt="UPI Image"></div>` : ''}
          <div style="margin-top:6px;"><small>Submitted: ${new Date(p.created_at).toLocaleString()}</small></div>
        </div>
        <div>
          <button type="button" class="btn-secondary" data-action="collect" data-id="${p.id}" data-collected="${p.collected ? '1' : '0'}">${p.collected ? 'Uncollect' : 'Collected'}</button>
          <button type="button" class="btn-danger" data-action="delete" data-id="${p.id}">Delete</button>
        </div>
      `;
      adminList.appendChild(card);
    });
  }

  async function loadAdmin() {
    const u = adminUser.value.trim();
    const p = adminPass.value;
    if (!u || !p) {
      adminStatus.textContent = 'Enter username and password.';
      adminStatus.className = 'status err';
      return;
    }
    adminStatus.textContent = 'Loading...';
    adminStatus.className = 'status';
    adminList.innerHTML = '';
    try {
      const token = btoa(`${u}:${p}`);
      adminToken = token;
      const res = await fetch(`${BASE}/api/players`, {
        headers: { 'Authorization': `Basic ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        adminStatus.textContent = data?.error || 'Unauthorized or failed to load.';
        adminStatus.className = 'status err';
        return;
      }
      adminStatus.textContent = '';
      renderPlayers(data.players);
    } catch (e) {
      adminStatus.textContent = 'Network error.';
      adminStatus.className = 'status err';
    }
  }

  if (adminToggle) adminToggle.addEventListener('click', () => {
    adminPanel.classList.toggle('hidden');
  });
  if (adminLoad) adminLoad.addEventListener('click', loadAdmin);

  if (adminList) {
    adminList.addEventListener('click', async (e) => {
      const target = e.target.closest('button');
      if (!target) return;
      const action = target.dataset.action;
      const id = target.dataset.id;
      if (!action || !id) return;
      if (!adminToken) {
        adminStatus.textContent = 'Please login first.';
        adminStatus.className = 'status err';
        return;
      }
      if (action === 'delete') {
        if (!confirm('Delete this player?')) return;
        try {
          const res = await fetch(`${BASE}/api/players/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Basic ${adminToken}` }
          });
          if (!res.ok) { alert('Failed to delete'); return; }
          loadAdmin();
        } catch { alert('Network error'); }
      } else if (action === 'collect') {
        const curr = target.dataset.collected === '1';
        try {
          const res = await fetch(`${BASE}/api/players/${id}/collected`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Basic ${adminToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ collected: !curr })
          });
          if (!res.ok) { alert('Failed to update'); return; }
          loadAdmin();
        } catch { alert('Network error'); }
      }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = 'Submitting...';
    status.className = 'status';

    try {
      const fd = new FormData(form);
      const res = await fetch(`${BASE}/api/register`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        const msg = data?.error || 'Submission failed';
        status.textContent = msg;
        status.classList.add('err');
        return;
      }
      status.textContent = 'Registration submitted successfully.';
      status.classList.add('ok');
      form.reset();
      updateUPIVisibility();
    } catch (err) {
      status.textContent = 'Network error. Please try again.';
      status.classList.add('err');
    }
  });
});
