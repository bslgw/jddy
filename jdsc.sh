#!/bin/bash
# 与worker里填写的一样
TOKEN="888"
WORKER_URL="https://xxxx.xxx.workers.dev"   #换上你自己的worker链接

# =========================
# 机器唯一ID
# =========================
SERVER_ID=$(cat /etc/machine-id | cut -c1-4 | tr 'a-z' 'A-Z')

# =========================
# 架构
# =========================
ARCH_RAW=$(uname -m)
if [[ "$ARCH_RAW" == "aarch64" ]];
then
    ARCH="ARM"
else
    ARCH="AMD"
fi

# =========================
# 公网IP
# =========================
PUBLIC_IP=$(curl -4 -s --max-time 5 https://api.ipify.org)
[ -z "$PUBLIC_IP" ] && exit 1

# =========================
# 中文城市（只取一次，不重复请求）
# =========================
CITY_JSON=$(curl -s --max-time 8 "http://ip-api.com/json/${PUBLIC_IP}?lang=zh-CN")

CITY=$(echo "$CITY_JSON" | jq -r '.city')
if [[ -z "$CITY" || "$CITY" == "null" ]]; then
    CITY=$(echo "$CITY_JSON" | jq -r '.regionName')
fi

# 清理城市后缀
CITY=$(echo "$CITY" | sed 's/特别市//g;s/广域市//g;s/自治市//g;s/市$//g;s/州$//g;s/都$//g;s/府$//g')

SERVER_NAME="${CITY}-${ARCH}-${SERVER_ID}"

# =========================
# ⭐关键修复：只取“最新订阅文件”并智能筛选端口跳跃 hysteria2
# =========================
# =========================
# ⭐关键修复：只取“最新订阅文件”并智能筛选
# =========================
SUB_DIR="/etc/v2ray-agent/subscribe_local/default"

if [ ! -d "$SUB_DIR" ]; then
    echo "no subscribe dir"
    exit 1
fi

LATEST_FILE=$(ls -t "$SUB_DIR" 2>/dev/null | head -n 1)

TMP=$(mktemp)

if [ -n "$LATEST_FILE" ]; then
    # 1. 提取基础节点并【保持原顺序】去重（用 awk 代替 sort -u）
    cat "$SUB_DIR/$LATEST_FILE" | grep -E '://' | sed 's/\r//g' | awk '!x[$0]++' > "${TMP}.raw"
    
    # 2. 通过 awk 进行智能筛选：
    #    - 只保留物理顺序上最后一条（最新）的 vless 节点。
    #    - 非 hysteria2/vless 协议正常保留。
    #    - hysteria2 协议如果存在多条，优先保留带有端口范围(如 32000-33000)或跳跃参数(mport/hop)的节点。
    awk '
    /^vless:\/\// {
        # 遇到 vless 节点时不断覆盖变量，由于保持了原顺序，最终留下的就是最底部的那一条
        last_vless = $0
        next
    }
    !/^hysteria2:\/\// { 
        # 其他协议（如 vmess、ss 等）直接打印
        print; next 
    }
    /^hysteria2:\/\// {
        # 匹配 hysteria2 端口跳跃特征
        if ($0 ~ /:[0-9]+-[0-9]+/ || $0 ~ /:[0-9]+,[0-9]+/ || $0 ~ /mport=/ || $0 ~ /hop=/) {
            hop_nodes[++hop_cnt] = $0
        } else {
            def_nodes[++def_cnt] = $0
        }
    }
    END {
        # 1. 首先输出那条最新、排在最底部的 vless 节点
        if (last_vless != "") print last_vless

        # 2. 接着输出符合筛选条件的 hysteria2 节点
        if (hop_cnt > 0) {
            for (i=1; i<=hop_cnt; i++) print hop_nodes[i]
        } else if (def_cnt > 0) {
            for (i=1; i<=def_cnt; i++) print def_nodes[i]
        }
    }' "${TMP}.raw" > "$TMP"

    rm -f "${TMP}.raw"
fi

# =========================
# JSON 打包
# =========================
JSON_LINKS=$(jq -R . < "$TMP" | jq -s .)

jq -n \
  --arg sid "$SERVER_ID" \
  --arg sname "$SERVER_NAME" \
  --argjson links "$JSON_LINKS" \
'{
  server_id:$sid,
  server_name:$sname,
  links:$links
}' > /tmp/upload.json

# =========================
# 输出调试
# =========================
echo "上传内容："
cat /tmp/upload.json
echo

# =========================
# 上传至 Worker
# =========================
curl -s -X POST \
"${WORKER_URL}/api/report?token=${TOKEN}" \
-H "Content-Type: application/json" \
-d @/tmp/upload.json

rm -f "$TMP"
rm -f /tmp/upload.json
