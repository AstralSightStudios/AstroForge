//! Runtime IR → JS 文本打印器。
//!
//! 打印对象包括：模块外层包装函数、webpack 桩、`$app_style$`、`$app_template$`、
//! `$app_script$`、注册块（`$app_exports$['entry']` 或 `module.exports`）。
//!
//! 设计要点：输出文本以 AST 对照测试为目标，可读性次之；任何控制字节级 diff
//! 需求由 `astroforge-compat` 在规范化阶段消化。Phase 3 落地。
