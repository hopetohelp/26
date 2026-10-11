#!/usr/bin/env bash
# בתחילת סשן: האם ההרצה האחרונה של כל תהליך פריסה ב-main נכשלה
api="https://api.github.com/repos/hopetohelp/26/actions/workflows"
bad=""
for wf in crowd-worker.yml feedback-worker.yml pages.yml; do
  json=$(curl -s -m 10 "$api/$wf/runs?branch=main&status=completed&per_page=1") || continue
  line=$(printf '%s' "$json" | python3 -c 'import json,sys
r=json.load(sys.stdin).get("workflow_runs") or []
if r and r[0]["conclusion"] not in ("success","skipped"): print(r[0]["name"]+" | "+r[0]["conclusion"]+" | "+r[0]["html_url"])' 2>/dev/null)
  [ -n "$line" ] && bad="$bad\n- $line"
done
if [ -n "$bad" ]; then
  printf '🔴 פריסה שנכשלה ב-main — לטפל ולדווח לבעלים לפני כל עבודה אחרת:%b\n' "$bad"
fi
exit 0
