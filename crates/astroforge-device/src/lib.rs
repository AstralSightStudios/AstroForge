//! AstroForge 设备工具集。
//!
//! 封装 adb / `@miwt/adb` 等设备交互能力：列举设备、推送 rpk、安装、卸载、
//! 启动应用、日志拉取。

use std::env;
use std::process::{Command, Stdio};

use anyhow::{Context, Result};
use camino::Utf8Path;

/// 安装命令执行结果。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeviceAction {
    /// 已通过外部适配器执行。
    Executed { command: String },
    /// 未配置适配器，仅完成本地输入校验。
    Skipped { reason: String },
}

/// 安装 rpk。
///
/// 当前阶段不内置厂商私有安装协议。若环境变量 `ASTROFORGE_INSTALL_CMD`
/// 存在，则按 shell 命令执行，并将其中的 `{rpk}` 替换为实际路径；否则仅校验
/// 文件存在并返回跳过结果。这样 CLI 能稳定接入 CI 与本地构建流程，而设备侧
/// 适配器可在后续独立演进。
pub fn install(rpk: &Utf8Path) -> Result<DeviceAction> {
    ensure_file(rpk)?;
    let Some(template) = env::var("ASTROFORGE_INSTALL_CMD").ok() else {
        return Ok(DeviceAction::Skipped {
            reason: "未配置 ASTROFORGE_INSTALL_CMD，跳过设备安装".into(),
        });
    };

    let command = template.replace("{rpk}", rpk.as_str());
    run_shell_command(&command).with_context(|| format!("执行安装命令失败：{command}"))?;
    Ok(DeviceAction::Executed { command })
}

/// 启动日志流。
///
/// 优先使用 `ASTROFORGE_LOG_CMD`；未配置时尝试 `adb logcat`。若 adb 不在 PATH
/// 中则返回跳过结果。
pub fn log() -> Result<DeviceAction> {
    if let Ok(command) = env::var("ASTROFORGE_LOG_CMD") {
        run_shell_command(&command).with_context(|| format!("执行日志命令失败：{command}"))?;
        return Ok(DeviceAction::Executed { command });
    }

    if command_exists("adb") {
        let status = Command::new("adb")
            .arg("logcat")
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .status()
            .context("执行 adb logcat 失败")?;
        if !status.success() {
            anyhow::bail!("adb logcat 退出码：{status}");
        }
        return Ok(DeviceAction::Executed {
            command: "adb logcat".into(),
        });
    }

    Ok(DeviceAction::Skipped {
        reason: "未配置 ASTROFORGE_LOG_CMD，且未在 PATH 中找到 adb".into(),
    })
}

fn ensure_file(path: &Utf8Path) -> Result<()> {
    if !path.exists() {
        anyhow::bail!("文件不存在：{path}");
    }
    if !path.is_file() {
        anyhow::bail!("路径不是文件：{path}");
    }
    Ok(())
}

fn command_exists(name: &str) -> bool {
    let Some(path_var) = env::var_os("PATH") else {
        return false;
    };
    env::split_paths(&path_var).any(|dir| dir.join(name).is_file())
}

fn run_shell_command(command: &str) -> Result<()> {
    let status = Command::new("sh")
        .arg("-c")
        .arg(command)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .context("启动 shell 命令失败")?;
    if !status.success() {
        anyhow::bail!("命令退出码：{status}");
    }
    Ok(())
}
