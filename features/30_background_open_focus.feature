# 2026-11-26 P0（口径确认）：打开网页后焦点留插件，不跳到浏览器网页
功能: 后台打开与焦点保持

  背景:
    假如 默认设置开启标签后台打开

  场景: 默认后台打开开关为真
    那么 默认设置开启标签后台打开

  场景: 后台打开新标签传 active false 且不聚焦窗口
    那么 后台打开新标签传 active false 且不聚焦窗口

  场景: 后台命中已开标签不激活不聚焦
    那么 后台命中已开标签不激活不聚焦

  场景: 显式聚焦动作仍激活标签并聚焦窗口
    那么 显式聚焦动作仍激活标签并聚焦窗口

  场景: 主页搜索与站点点击走后台且焦点留插件
    那么 主页搜索与站点点击走后台打开且焦点留插件

  场景: 左右键默认绑定焦点切换且输入控件不触发树快捷键
    那么 左右键默认绑定焦点切换且输入控件不触发树快捷键
EOF
cd /workspace/tabharbor && npx prettier --write tests/bdd.steps.mjs >/dev/null 2>&1; node tools/bdd-runner.mjs features >/tmp/bdd30.out 2>&1; echo "exit=$?"; grep -E '汇总|FAIL' /tmp/bdd30.out | head -20; tail -5 /tmp/bdd30.out