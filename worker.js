const SECRETPASSWORD = "bbsok828"; 

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!env.NODES_STORE) return new Response("錯誤：未綁定 KV", { status: 500 });
    const userToken = url.searchParams.get('token');
    if (userToken !== SECRETPASSWORD) return new Response("404 Not Found", { status: 404 });

    const getProtocol = (link) => {
      try { return link.split('://')[0].toLowerCase(); } catch (e) { return 'unknown'; }
    };

    if (url.pathname === '/api/check') {
      const host = url.searchParams.get('host');
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);
        await fetch(`http://${host}`, { mode: 'no-cors', signal: controller.signal });
        clearTimeout(timeout);
        return new Response(JSON.stringify({ online: true }));
      } catch (e) { return new Response(JSON.stringify({ online: false })); }
    }

    if (url.pathname === '/sub') {
      const rawData = await env.NODES_STORE.get('nodes_list');
      let nodes = rawData ? JSON.parse(rawData) : [];
      nodes.sort((a, b) => getProtocol(a.link).localeCompare(getProtocol(b.link)));
      const subText = nodes.map(n => {
        const proto = getProtocol(n.link).toUpperCase();
        return `${n.link.split('#')[0]}#[${proto}] ${n.originalName || '未命名'}`;
      }).join('\n');
      return new Response(subText, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    if (request.method === 'POST' && url.pathname === '/api/save') {
      const { id, link, customName, isBatch } = await request.json();
      const rawData = await env.NODES_STORE.get('nodes_list');
      let nodes = rawData ? JSON.parse(rawData) : [];
      if (isBatch) {
        link.split('\n').filter(l => l.trim().includes('://')).forEach(l => {
          nodes.push({ id: Math.random().toString(36).substr(2, 9), originalName: '批量導入', link: l.trim().split('#')[0] });
        });
      } else if (id) {
        const i = nodes.findIndex(n => n.id === id);
        if (i !== -1) nodes[i] = { id, originalName: customName, link: link.trim().split('#')[0] };
      } else {
        nodes.push({ id: Date.now().toString(), originalName: customName, link: link.trim().split('#')[0] });
      }
      await env.NODES_STORE.put('nodes_list', JSON.stringify(nodes));
      return new Response(JSON.stringify({ success: true }));
    }

    if (request.method === 'POST' && url.pathname === '/api/delete') {
      const { id } = await request.json();
      const rawData = await env.NODES_STORE.get('nodes_list');
      let nodes = (rawData ? JSON.parse(rawData) : []).filter(n => n.id !== id);
      await env.NODES_STORE.put('nodes_list', JSON.stringify(nodes));
      return new Response(JSON.stringify({ success: true }));
    }

    const rawData = await env.NODES_STORE.get('nodes_list');
    const currentNodes = rawData ? JSON.parse(rawData) : [];
    const groupedNodes = currentNodes.reduce((acc, node) => {
      const p = getProtocol(node.link);
      if (!acc[p]) acc[p] = [];
      acc[p].push(node);
      return acc;
    }, {});

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Dae 訂閱管理</title><style>:root { --primary: #1a73e8; --success: #34a853; --danger: #ea4335; --bg: #f8f9fa; } body { font-family: system-ui, sans-serif; background: var(--bg); max-width: 750px; margin: 20px auto; padding: 0 15px; color: #333; } .header { text-align: center; margin-bottom: 25px; } .card { background: white; padding: 20px; border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-bottom: 20px; } .sub-box { background: #fffbe6; padding: 12px; border-radius: 8px; border: 1px dashed #ffe58f; display: flex; align-items: center; justify-content: space-between; gap: 10px; } .sub-box code { font-size: 12px; word-break: break-all; color: #856404; flex: 1; } .group-tag { background: #e8f0fe; color: var(--primary); padding: 4px 12px; font-size: 11px; font-weight: bold; border-radius: 20px; margin: 15px 0 10px; display: inline-block; text-transform: uppercase; } input, textarea { width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; font-size: 14px; } .btn { border: none; border-radius: 8px; padding: 10px 16px; font-weight: bold; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; } .btn-main { background: var(--primary); color: white; width: 100%; justify-content: center; } .btn-ghost { background: #f1f3f4; color: #5f6368; font-size: 12px; } .node-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f3f4; } .status-dot { width: 22px; text-align: center; display: inline-block; } .online { color: var(--success); } .offline { color: var(--danger); } .toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: white; padding: 8px 20px; border-radius: 25px; font-size: 13px; opacity: 0; transition: 0.4s; z-index: 999; pointer-events: none; }</style></head><body><div id="toast" class="toast">操作成功</div><div class="header"><h1>🔒 訂閱管理系統</h1></div><div class="card"><h3 style="margin:0 0 12px; font-size:15px;">🔗 訂閱連結</h3><div class="sub-box"><code id="subUrl">${url.origin}/sub?token=${SECRETPASSWORD}</code><button class="btn btn-ghost" onclick="copyText('subUrl')">複製連結</button></div></div><div class="card"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;"><h3 id="formTitle" style="margin:0; font-size:15px;">➕ 節點操作</h3><button class="btn btn-ghost" onclick="toggleBatch()" id="batchBtn">切換批量模式</button></div><input type="hidden" id="nodeId"><input type="text" id="nodeName" placeholder="節點顯示名稱"><textarea id="nodeLink" rows="3" placeholder="貼入原始連結..."></textarea><button class="btn btn-main" onclick="saveNode()" id="saveBtn">保存數據</button><button id="cancelBtn" class="btn btn-ghost" style="display:none; width:100%; margin-top:8px;" onclick="resetForm()">取消修改</button></div><div class="card"><div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0; font-size:15px;">📋 節點列表 (${currentNodes.length})</h3><button class="btn btn-ghost" onclick="checkAllNodes()">🔄 重新檢測</button></div>${Object.entries(groupedNodes).map(([proto, items]) => `<div class="group-tag">${proto}</div>${items.map(n => `<div class="node-item"><div style="flex:1; min-width:0; margin-right:15px;"><div style="font-size:14px; font-weight:600;"><span id="status-${n.id}" class="status-dot">⏳</span> ${n.originalName}</div><div style="font-size:11px; color:#999; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${n.link}</div></div><div style="display:flex; gap:8px;"><button class="btn btn-ghost" onclick='editNode(${JSON.stringify(n)})'>📝</button><button class="btn btn-ghost" style="color:var(--danger)" onclick="deleteNode('${n.id}')">🗑️</button></div></div>`).join('')}`).join('')}</div><script>const token = new URLSearchParams(window.location.search).get('token'); const nodesList = ${JSON.stringify(currentNodes)}; let isBatchMode = false; function showToast(msg) { const t = document.getElementById('toast'); t.innerText = msg; t.style.opacity = 1; setTimeout(() => t.style.opacity = 0, 2000); } function copyText(id) { navigator.clipboard.writeText(document.getElementById(id).innerText); showToast('✅ 連結已複製'); } function toggleBatch() { isBatchMode = !isBatchMode; document.getElementById('nodeName').style.display = isBatchMode ? 'none' : 'block'; document.getElementById('batchBtn').innerText = isBatchMode ? '單個模式' : '批量模式'; } function getHost(link) { try { const match = link.match(/@([^/:?#]+)/); return match ? match[1] : null; } catch(e) { return null; } } async function checkAllNodes() { nodesList.forEach(async (n) => { const host = getHost(n.link); const el = document.getElementById('status-' + n.id); if(!host) { el.innerText = '❓'; return; } el.innerText = '⏳'; el.className = 'status-dot'; try { const res = await fetch('/api/check?token=' + token + '&host=' + host); const data = await res.json(); el.innerText = data.online ? '✅' : '❌'; el.className = 'status-dot ' + (data.online ? 'online' : 'offline'); } catch { el.innerText = '❌'; el.className = 'status-dot offline'; } }); } async function saveNode() { const res = await fetch('/api/save?token=' + token, { method: 'POST', body: JSON.stringify({ id: document.getElementById('nodeId').value, link: document.getElementById('nodeLink').value, customName: document.getElementById('nodeName').value, isBatch: isBatchMode }) }); if(res.ok) location.reload(); } function editNode(node) { isBatchMode = false; document.getElementById('nodeName').style.display = 'block'; document.getElementById('nodeId').value = node.id; document.getElementById('nodeLink').value = node.link; document.getElementById('nodeName').value = node.originalName; document.getElementById('formTitle').innerText = "📝 修改節點"; document.getElementById('cancelBtn').style.display = "block"; window.scrollTo({top: 0, behavior: 'smooth'}); } function resetForm() { location.reload(); } async function deleteNode(id) { if(confirm('確定刪除？')) { await fetch('/api/delete?token=' + token, { method: 'POST', body: JSON.stringify({ id }) }); location.reload(); } } window.onload = checkAllNodes;</script></body></html>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
};
