// ==========================================
// 🔒 安全配置：请将下面的暗号改成你自己独有的密码（建议只用英文和数字）
// ==========================================
const SECRETPASSWORD = "bbsok828"; 

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // 检查 KV 数据库是否成功绑定
    if (!env.NODES_STORE) {
      return new Response("错误：请先在 Worker 设置里绑定名为 NODES_STORE 的 KV 命名空间！", { status: 500 });
    }

    // 从 URL 的参数中获取用户输入的暗号 (例如 ?token=xxxx)
    const userToken = url.searchParams.get('token');

    // 安全核心：如果暗号不对，一律返回 404 伪装成不存在的网页，让扫描器直接放弃
    if (userToken !== SECRETPASSWORD) {
      return new Response("404 Not Found", { status: 404, headers: { 'Content-Type': 'text/plain' } });
    }

    // ==========================================
    // 路由 1：Dae/Daed 订阅拉取接口 (URL 后面加 /sub)
    // ==========================================
    if (url.pathname === '/sub') {
      const rawData = await env.NODES_STORE.get('nodes_list');
      const nodes = rawData ? JSON.parse(rawData) : [];
      const subText = nodes.map(n => n.link).join('\n');
      
      return new Response(subText, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // ==========================================
    // 路由 2：保存节点数据的 API (POST 请求)
    // ==========================================
    if (request.method === 'POST' && url.pathname === '/api/save') {
      try {
        const { link, customName } = await request.json();
        if (!link) return new Response("链接不能为空", { status: 400 });

        let processedLink = link.trim();
        const nameToUse = customName ? customName.trim() : '';

        if (processedLink.includes('#')) {
          processedLink = processedLink.split('#')[0];
        }
        if (nameToUse) {
          processedLink = `${processedLink}#${nameToUse}`;
        }

        const rawData = await env.NODES_STORE.get('nodes_list');
        let nodes = rawData ? JSON.parse(rawData) : [];

        nodes.push({
          id: Date.now().toString(),
          originalName: customName || '未命名',
          link: processedLink
        });

        await env.NODES_STORE.put('nodes_list', JSON.stringify(nodes));
        return new Response(JSON.stringify({ success: true, nodes }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(e.message, { status: 500 });
      }
    }

    // ==========================================
    // 路由 3：删除节点的 API
    // ==========================================
    if (request.method === 'POST' && url.pathname === '/api/delete') {
      const { id } = await request.json();
      const rawData = await env.NODES_STORE.get('nodes_list');
      let nodes = rawData ? JSON.parse(rawData) : [];
      nodes = nodes.filter(n => n.id !== id);
      await env.NODES_STORE.put('nodes_list', JSON.stringify(nodes));
      return new Response(JSON.stringify({ success: true, nodes }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ==========================================
    // 路由 4：显示管理网页 (HTML)
    // ==========================================
    const rawData = await env.NODES_STORE.get('nodes_list');
    const currentNodes = rawData ? JSON.parse(rawData) : [];

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>🔒 Dae 节点安全管理器</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f7fa; color: #333; max-width: 700px; margin: 40px auto; padding: 0 20px; }
        .card { background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 24px; }
        h2 { margin-top: 0; color: #1a73e8; }
        .form-group { margin-bottom: 16px; }
        label { display: block; margin-bottom: 6px; font-weight: bold; font-size: 14px; }
        input[type="text"], textarea { width: 100%; padding: 10px; border: 1px solid #dadce0; border-radius: 6px; box-sizing: border-box; font-size: 14px; }
        textarea { height: 80px; resize: vertical; }
        button { background: #1a73e8; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold; }
        button:hover { background: #1557b0; }
        .sub-url { background: #e8f0fe; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; word-break: break-all; border: 1px dashed #1a73e8; color: #111; font-weight: bold;}
        .node-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #f1f3f4; }
        .node-item:last-child { border-bottom: none; }
        .node-info { flex: 1; margin-right: 16px; overflow: hidden; }
        .node-name { font-weight: bold; font-size: 15px; }
        .node-link { font-family: monospace; font-size: 11px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .btn-del { background: #d93025; padding: 6px 12px; font-size: 12px; }
        .btn-del:hover { background: #b31412; }
      </style>
    </head>
    <body>

      <div class="card">
        <h2>🔒 你的 Daed 专属【安全】订阅链接</h2>
        <p style="font-size: 14px; color: #5f6368;">已经自动为您附加安全令牌，请将下方完整链接复制到 daed 中：</p>
        <div class="sub-url">${url.origin}/sub?token=${SECRETPASSWORD}</div>
      </div>

      <div class="card">
        <h2>➕ 添加/修改新节点</h2>
        <div class="form-group">
          <label>1. 粘贴原始节点链接</label>
          <textarea id="nodeLink" placeholder="支持 vless://, ss://, trojan:// 等原始链接"></textarea>
        </div>
        <div class="form-group">
          <label>2. 赋予新名字（留空则不改名）</label>
          <input type="text" id="nodeName" placeholder="例如：香港 01 专线">
        </div>
        <button onclick="saveNode()">保存到订阅</button>
      </div>

      <div class="card">
        <h2>📋 已存节点列表 (${currentNodes.length})</h2>
        <div id="nodeList">
          ${currentNodes.map(n => `
            <div class="node-item">
              <div class="node-info">
                <div class="node-name">${n.originalName}</div>
                <div class="node-link">${n.link}</div>
              </div>
              <button class="btn-del" onclick="deleteNode('${n.id}')">删除</button>
            </div>
          `).join('')}
          ${currentNodes.length === 0 ? '<p style="color:#999;text-align:center;">暂无节点，请在上方添加</p>' : ''}
        </div>
      </div>

      <script>
        // 获取当前 URL 里的 token 参数，确保增删操作通过校验
        const urlParams = new URLSearchParams(window.location.search);
        const currentToken = urlParams.get('token');

        async function saveNode() {
          const link = document.getElementById('nodeLink').value;
          const customName = document.getElementById('nodeName').value;
          if(!link) return alert('请填写节点链接');
          
          const res = await fetch('/api/save?token=' + currentToken, {
            method: 'POST',
            body: JSON.stringify({ link, customName })
          });
          if(res.ok) {
            window.location.reload();
          }
        }

        async function deleteNode(id) {
          if(!confirm('确定要删除这个节点吗？')) return;
          const res = await fetch('/api/delete?token=' + currentToken, {
            method: 'POST',
            body: JSON.stringify({ id })
          });
          if(res.ok) {
            window.location.reload();
          }
        }
      </script>
    </body>
    </html>
    `;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  },
};
