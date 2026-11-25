# 2026-11-25：主页壁纸（schema / 规范化 / 本地图片 / 零出站 / 导入导出）
功能: 主页壁纸

  场景: 默认壁纸为 none 且含五套渐变预设
    那么 默认壁纸为 none 且有五套渐变预设

  场景: 壁纸规范化非法模式回退 none
    当 规范化壁纸配置 mode 为 flash preset 为 bad scrim 为 9
    那么 规范化壁纸 mode 为 none preset 为 deep-blue scrim 为 0.85

  场景: 壁纸规范化 image 模式无合法图片回退 gradient
    当 规范化壁纸配置 mode 为 image imageData 为 javascript 伪协议
    那么 规范化壁纸 mode 为 gradient 且 imageData 为空

  场景: 合法本地图片 data URL 被保留
    当 保留合法 png data URL 壁纸配置
    那么 规范化壁纸 mode 为 image 且 imageData 以 data image png 开头

  场景: 主页配置导出导入包含壁纸
    当 导出含自定义壁纸的主页配置并重新导入
    那么 导入配置壁纸 mode 为 gradient preset 为 warm-sand

  场景: 主页配置规范化包含 wallpaper 字段
    当 规范化一份空主页配置
    那么 规范化配置含合法 wallpaper 字段

  场景: 壁纸仅作用内部主页且远程图片仅接受用户主动输入的 https 链接
    那么 壁纸仅作用内部主页且远程图片仅接受用户输入的 https 链接

  场景: 网络图片链接仅允许 https 且拒绝伪协议与注入字符
    那么 网络壁纸链接仅允许 https 并拒绝伪协议与注入字符

  场景: 网络图片与本地图片二选一且缺来源回退渐变
    那么 网络图片与本地图片二选一且缺来源回退渐变
