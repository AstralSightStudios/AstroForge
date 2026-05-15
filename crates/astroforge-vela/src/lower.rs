//! Page IR → Runtime IR 下沉规则。
//!
//! 主要变换：
//! - JSX 元素 → `RuntimeNode { creator, tag, opts, children }`；
//! - 静态/动态属性归类为 `OptValue::Static` / `OptValue::Dynamic`；
//! - 事件回调归类为 `OptValue::Events`；
//! - 内联 style 归类为 `OptValue::DynamicStyle`；
//! - CSS 规则归类为 `StyleEntry` 序列。
//!
//! Phase 3 落地。
