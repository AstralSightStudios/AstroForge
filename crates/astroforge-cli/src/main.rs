//! `astroforge` CLI 入口。
//!
//! 子命令对应 README.md 中描述的开发流程。仅 `inspect` 子命令在 Phase 1 落
//! 地了具体行为（IR 检视、Schema 导出），其余子命令保留参数解析骨架，待对
//! 应 Phase 实装。

use std::fs;
use std::process::{Command as ProcessCommand, Stdio};

use anyhow::{Context, Result};
use camino::Utf8PathBuf;
use clap::{Parser, Subcommand, ValueEnum};

#[derive(Parser, Debug)]
#[command(
    name = "astroforge",
    version,
    about = "AstroForge — React/TSX 智能手表快应用工具链",
    propagate_version = true
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// 在当前目录创建一个新的 AstroForge 项目骨架。
    Init {
        #[arg(default_value = ".")]
        path: Utf8PathBuf,
    },

    /// 启动开发服务器，监听源码变化并增量重建。
    ///
    /// 内部会同时启动 Rsbuild dev（驱动 TSX → IR）与 Rust 后端 watcher
    /// （IR → Vela JS → rpk）。可选地在每次 rpk 更新后执行设备安装钩子。
    Dev {
        #[arg(long, default_value = ".")]
        root: Utf8PathBuf,

        /// 每次 rpk 更新完成后自动调用 install 钩子（等价于
        /// `astroforge install <rpk>`）。
        #[arg(long)]
        install: bool,

        /// 不启动 Rsbuild（适用于上层流水线已自行重建 IR 的场景）。
        #[arg(long)]
        no_rsbuild: bool,
    },

    /// 一次性产出 debug 构建。
    Build {
        #[arg(long, default_value = "vela")]
        target: String,

        /// 项目根目录。
        #[arg(long, default_value = ".")]
        root: Utf8PathBuf,

        /// 直接使用已有 IR 文件，跳过 Rsbuild。
        #[arg(long)]
        ir: Option<Utf8PathBuf>,

        /// rpk 输出路径。
        #[arg(long)]
        out: Option<Utf8PathBuf>,

        /// 跳过 Rsbuild，使用默认 cache 中的 IR。
        #[arg(long)]
        skip_rsbuild: bool,
    },

    /// 产出 release 构建（含签名、压缩、清理 dev 工具）。
    Release {
        #[arg(long, default_value = "vela")]
        target: String,

        #[arg(long, default_value = ".")]
        root: Utf8PathBuf,

        #[arg(long)]
        out: Option<Utf8PathBuf>,
    },

    /// 运行兼容性对照测试：分级 diff aiot-toolkit 与 astroforge 产物。
    TestCompat {
        #[arg(long, default_value = "fixtures")]
        fixtures: Utf8PathBuf,

        /// 同时运行 official/aiot-toolkit 侧构建。
        #[arg(long)]
        official: bool,
    },

    /// 检视 IR 文件、Schema、或已构建的 rpk 包。
    #[command(subcommand)]
    Inspect(InspectCommand),

    /// 将 rpk 解压到指定目录。
    Unpack {
        rpk: Utf8PathBuf,
        #[arg(long, default_value = ".")]
        out: Utf8PathBuf,
    },

    /// 将 rpk 推送至已连接设备并安装。
    Install { rpk: Utf8PathBuf },

    /// 拉取目标设备日志流。
    Log,
}

#[derive(Subcommand, Debug)]
enum InspectCommand {
    /// 加载并校验一个 IR JSON 文件，打印摘要（IR 版本、页面 / 组件 / 资源数、路由表）。
    Ir {
        /// IR JSON 文件路径。
        path: Utf8PathBuf,

        /// 同时把完整文档以 pretty JSON 输出到 stdout。
        #[arg(long)]
        pretty: bool,
    },

    /// 输出 IR JSON Schema。
    Schema {
        #[arg(long, value_enum, default_value_t = SchemaTarget::IrDocument)]
        target: SchemaTarget,
    },

    /// 检视一个已构建的 rpk 包，输出资源 / 路由 / 模块清单。Phase 4 实装。
    Rpk { rpk: Utf8PathBuf },
}

#[derive(Copy, Clone, Debug, ValueEnum)]
enum SchemaTarget {
    /// 跨进程 IR 文件契约（Component + Page IR）。
    IrDocument,
    /// 后端内部表示（Runtime IR）。
    RuntimeModule,
}

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let cli = Cli::parse();
    match cli.command {
        Command::Init { path } => run_init(&path),
        Command::Dev {
            root,
            install,
            no_rsbuild,
        } => run_dev(&root, install, no_rsbuild),
        Command::Build {
            target,
            root,
            ir,
            out,
            skip_rsbuild,
        } => run_build(
            &target,
            &root,
            ir.as_ref(),
            out.as_ref(),
            skip_rsbuild,
            "debug",
        ),
        Command::Release { target, root, out } => {
            run_build(&target, &root, None, out.as_ref(), false, "release")
        }
        Command::TestCompat { fixtures, official } => run_test_compat(&fixtures, official),
        Command::Inspect(cmd) => run_inspect(cmd),
        Command::Unpack { rpk, out } => run_unpack(&rpk, &out),
        Command::Install { rpk } => run_install(&rpk),
        Command::Log => run_log(),
    }
}

fn run_inspect(cmd: InspectCommand) -> Result<()> {
    match cmd {
        InspectCommand::Ir { path, pretty } => inspect_ir(&path, pretty),
        InspectCommand::Schema { target } => {
            let s = match target {
                SchemaTarget::IrDocument => astroforge_ir::schema::ir_document_schema_pretty(),
                SchemaTarget::RuntimeModule => {
                    astroforge_ir::schema::runtime_module_schema_pretty()
                }
            };
            println!("{s}");
            Ok(())
        }
        InspectCommand::Rpk { rpk } => inspect_rpk(&rpk),
    }
}

fn run_init(path: &camino::Utf8Path) -> Result<()> {
    fs::create_dir_all(path.join("src/pages/index"))
        .with_context(|| format!("创建项目目录失败：{path}"))?;
    fs::create_dir_all(path.join("src/common"))
        .with_context(|| format!("创建 common 目录失败：{path}"))?;

    let default_name = path
        .file_name()
        .filter(|s| !s.is_empty() && *s != "." && *s != "..")
        .unwrap_or("astroforge-app")
        .to_owned();
    let default_package = format!("com.example.{}", default_name.replace('-', ""));

    write_new_file(&path.join("src/app.tsx"), include_str!("templates/app.tsx"))?;
    write_new_file(
        &path.join("src/pages/index/index.tsx"),
        include_str!("templates/index.tsx"),
    )?;
    write_new_file(
        &path.join("src/common/logo.svg"),
        include_str!("templates/logo.svg"),
    )?;
    write_new_file(
        &path.join("astroforge.config.ts"),
        &include_str!("templates/astroforge.config.ts")
            .replace("{PACKAGE}", &default_package)
            .replace("{NAME}", &default_name),
    )?;
    write_new_file(
        &path.join("rsbuild.config.ts"),
        include_str!("templates/rsbuild.config.ts"),
    )?;
    upsert_package_json(
        &path.join("package.json"),
        &include_str!("templates/package.json")
            .replace("{NAME}", &default_name)
            .replace("{ASTROFORGE_VERSION}", env!("CARGO_PKG_VERSION")),
    )?;
    write_new_file(
        &path.join("tsconfig.json"),
        include_str!("templates/tsconfig.json"),
    )?;
    write_new_file(
        &path.join(".gitignore"),
        include_str!("templates/gitignore"),
    )?;
    write_new_file(&path.join("README.md"), include_str!("templates/README.md"))?;

    println!("AstroForge 项目已创建：{path}");
    println!("下一步：");
    println!("  cd {path}");
    println!("  pnpm install");
    println!("  pnpm exec astroforge build --target vela");
    println!("  pnpm exec astroforge dev   # 监听源码变更，增量打 rpk");
    Ok(())
}

/// 写入 package.json：不存在时写模板，已存在则做字段级 merge。
///
/// merge 策略（避免覆盖用户 / pnpm add 已写入的内容）：
/// - 顶层标量字段（name / version / private / type 等）：仅在缺失时填入模板默认值；
/// - `scripts` / `dependencies` / `devDependencies` 等 dep 表：逐 key 比对，
///   缺失的补上，已存在的保留原值（包括用户的 version 指定）；
/// - 其它已存在的顶层字段原样保留。
///
/// 设计动机见 README「常见安装路径」：用户可能先 `pnpm add -D
/// @astralsight/astroforge` 让 pnpm 写出一个仅含 astroforge 的 package.json，
/// 然后再 `astroforge init`——旧实现 `write_new_file` 见文件存在就静默跳过，
/// 导致后续 `pnpm install` 拉不到 core / rsbuild-plugin / @rsbuild/core 等
/// 必备依赖，整条链路失效。本函数确保两种顺序都能产出可用的 package.json。
fn upsert_package_json(path: &camino::Utf8Path, template: &str) -> Result<()> {
    use serde_json::Value;

    let template_value: Value = serde_json::from_str(template)
        .with_context(|| "内置 package.json 模板解析失败（编译期 bug）")?;

    if !path.exists() {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).with_context(|| format!("创建目录失败：{parent}"))?;
        }
        fs::write(path, template).with_context(|| format!("写入 package.json 失败：{path}"))?;
        println!("  + 创建 package.json");
        return Ok(());
    }

    let existing_source =
        fs::read_to_string(path).with_context(|| format!("读取已有 package.json 失败：{path}"))?;
    let mut existing: Value = serde_json::from_str(&existing_source)
        .with_context(|| format!("已有 package.json 不是合法 JSON：{path}"))?;

    let added = merge_package_json(&mut existing, &template_value);
    let serialized =
        serde_json::to_string_pretty(&existing).context("合并后的 package.json 序列化失败")?;
    let mut out = serialized;
    out.push('\n');
    fs::write(path, out).with_context(|| format!("写回 package.json 失败：{path}"))?;

    if added.is_empty() {
        println!("  · package.json 已具备所有必需字段，未改动");
    } else {
        println!("  ~ package.json 合并字段：{}", added.join(", "));
    }
    Ok(())
}

/// 把模板 package.json 的字段合并到已有 package.json，**不覆盖**用户已声明的值。
/// 返回新增的字段路径（如 `scripts.build`、`dependencies.@astralsight/astroforge-core`），
/// 调用方据此打印改动摘要。
fn merge_package_json(
    existing: &mut serde_json::Value,
    template: &serde_json::Value,
) -> Vec<String> {
    use serde_json::Value;

    const DEP_LIKE_KEYS: &[&str] = &[
        "scripts",
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
    ];

    let mut added: Vec<String> = Vec::new();
    let (Some(existing_obj), Some(template_obj)) = (existing.as_object_mut(), template.as_object())
    else {
        return added;
    };

    for (key, template_value) in template_obj {
        if DEP_LIKE_KEYS.contains(&key.as_str()) {
            let entry = existing_obj
                .entry(key.clone())
                .or_insert_with(|| Value::Object(serde_json::Map::new()));
            let Some(existing_map) = entry.as_object_mut() else {
                continue;
            };
            let Some(template_map) = template_value.as_object() else {
                continue;
            };
            for (sub_key, sub_value) in template_map {
                if !existing_map.contains_key(sub_key) {
                    existing_map.insert(sub_key.clone(), sub_value.clone());
                    added.push(format!("{key}.{sub_key}"));
                }
            }
        } else if !existing_obj.contains_key(key) {
            existing_obj.insert(key.clone(), template_value.clone());
            added.push(key.clone());
        }
    }

    added
}

/// `astroforge dev` 实现：把 TSX→IR（Rsbuild 插件）与 IR→rpk（Rust 后端）
/// 拉到同一进程下监听。
///
/// 设计：
/// 1. 默认 spawn `pnpm exec rsbuild dev` 作为子进程，由 `pluginAstroForge`
///    的 `onBeforeDevCompile` hook 把每次源码变更下沉到 `ir-document.json`。
/// 2. 主线程立即跑一次完整构建（即使 Rsbuild 还没启动也能产出第一份 rpk）。
/// 3. 使用 notify-debouncer 监听 IR 文件路径，每次变更后重新跑 Vela 后端 +
///    打包；500ms 去抖避免 Rsbuild 写文件时的多次触发被重复处理。
/// 4. `--install` 启用时，每次 rpk 重建完成后调用与 `astroforge install`
///    同款钩子（`astroforge_device::install`）。
/// 5. Ctrl-C / 子进程退出时统一清理。
fn run_dev(root: &camino::Utf8Path, install: bool, no_rsbuild: bool) -> Result<()> {
    use std::sync::mpsc::channel;
    use std::time::Duration;

    use notify::RecursiveMode;
    use notify_debouncer_full::new_debouncer;

    let ir_path = root.join("node_modules/.cache/astroforge/ir-document.json");
    fs::create_dir_all(ir_path.parent().unwrap()).ok();

    let mut rsbuild_child = if no_rsbuild {
        None
    } else {
        let child = ProcessCommand::new("pnpm")
            .arg("--dir")
            .arg(root)
            .arg("exec")
            .arg("rsbuild")
            .arg("dev")
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()
            .with_context(|| format!("启动 Rsbuild dev 失败：{root}"))?;
        Some(child)
    };

    // 初始构建：若 IR 已存在（Rsbuild 子进程会异步生成），打一份 rpk。否则等
    // 第一次 IR 文件出现后再触发，避免阻塞死锁。
    if ir_path.exists() {
        if let Err(err) = rebuild_once(root, &ir_path, install) {
            eprintln!("[dev] 初始构建失败：{err:?}");
        }
    } else {
        println!("[dev] 等待 Rsbuild 生成首个 IR：{ir_path}");
    }

    let (tx, rx) = channel();
    let mut debouncer = new_debouncer(Duration::from_millis(500), None, tx)
        .with_context(|| "启动 notify-debouncer 失败")?;
    let parent = ir_path
        .parent()
        .ok_or_else(|| anyhow::anyhow!("IR 缓存目录无父目录"))?
        .to_owned();
    debouncer
        .watch(parent.as_std_path(), RecursiveMode::NonRecursive)
        .with_context(|| format!("监听 IR 缓存失败：{parent}"))?;

    let result = (|| -> Result<()> {
        for events in rx {
            let events =
                events.map_err(|errors| anyhow::anyhow!("notify-debouncer 错误：{:?}", errors))?;
            if !events.iter().any(|evt| {
                evt.paths.iter().any(|p| {
                    p.file_name()
                        .and_then(|s| s.to_str())
                        .is_some_and(|name| name == "ir-document.json")
                })
            }) {
                continue;
            }
            if let Err(err) = rebuild_once(root, &ir_path, install) {
                eprintln!("[dev] 重建失败：{err:?}");
            }
            if let Some(child) = rsbuild_child.as_mut()
                && let Ok(Some(status)) = child.try_wait()
            {
                anyhow::bail!("Rsbuild 子进程退出，dev 终止：{status}");
            }
        }
        Ok(())
    })();

    if let Some(mut child) = rsbuild_child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    result
}

fn rebuild_once(root: &camino::Utf8Path, ir_path: &camino::Utf8Path, install: bool) -> Result<()> {
    let doc = astroforge_ir::io::load_ir_from_path(ir_path)
        .with_context(|| format!("加载 IR 失败：{ir_path}"))?;
    let build = astroforge_vela::build(doc).context("Vela backend 构建失败")?;
    let out_path = root
        .join("dist")
        .join(format!("{}.debug.rpk", build.package));
    let unpacked = out_path
        .parent()
        .unwrap_or_else(|| camino::Utf8Path::new("."))
        .join("unpacked");
    let pack_options = astroforge_packager::PackOptions {
        signing: signing_config_for("debug", root),
    };
    let unpacked_files = astroforge_packager::write_unpacked_with(&build, &unpacked, &pack_options)
        .with_context(|| format!("写出 unpacked 目录失败：{unpacked}"))?;
    let report = astroforge_packager::pack_with(&build, &out_path, &pack_options)
        .with_context(|| format!("打包 rpk 失败：{out_path}"))?;
    println!(
        "[dev] 已更新 {}  (rpk={} 文件, unpacked={} 文件, sig={})",
        report.out,
        report.files.len(),
        unpacked_files.len(),
        report.signing.source
    );
    if install {
        match astroforge_device::install(&out_path)? {
            astroforge_device::DeviceAction::Executed { command } => {
                println!("[dev] install 钩子执行：{command}");
            }
            astroforge_device::DeviceAction::Skipped { reason } => {
                println!("[dev] install 钩子跳过：{reason}");
            }
        }
    }
    Ok(())
}

fn run_build(
    target: &str,
    root: &camino::Utf8Path,
    ir: Option<&Utf8PathBuf>,
    out: Option<&Utf8PathBuf>,
    skip_rsbuild: bool,
    profile: &str,
) -> Result<()> {
    if target != "vela" {
        anyhow::bail!("当前仅支持 --target vela，收到：{target}");
    }

    if ir.is_none() && !skip_rsbuild {
        run_rsbuild_build(root)?;
    }

    let ir_path = ir
        .cloned()
        .unwrap_or_else(|| root.join("node_modules/.cache/astroforge/ir-document.json"));
    let doc = astroforge_ir::io::load_ir_from_path(&ir_path)
        .with_context(|| format!("加载 IR 失败：{ir_path}"))?;
    let build = astroforge_vela::build(doc).context("Vela backend 构建失败")?;

    let out_path = out.cloned().unwrap_or_else(|| {
        root.join("dist")
            .join(format!("{}.{}.rpk", build.package, profile))
    });
    let unpacked = out_path
        .parent()
        .unwrap_or_else(|| camino::Utf8Path::new("."))
        .join("unpacked");

    // 同一份 SigningConfig 复用到 unpacked 与 rpk，保证两侧来源一致。
    let pack_options = astroforge_packager::PackOptions {
        signing: signing_config_for(profile, root),
    };
    let unpacked_files = astroforge_packager::write_unpacked_with(&build, &unpacked, &pack_options)
        .with_context(|| format!("写出 unpacked 目录失败：{unpacked}"))?;
    let report = astroforge_packager::pack_with(&build, &out_path, &pack_options)
        .with_context(|| format!("打包 rpk 失败：{out_path}"))?;

    println!("构建完成：{}", report.out);
    println!("  unpacked: {unpacked}");
    println!("  files:    {}", report.files.len());
    println!("  unpacked files: {}", unpacked_files.len());
    println!(
        "  signing: {} (pubkey={}…, RSA-{})",
        report.signing.source, report.signing.public_key_fingerprint, report.signing.modulus_bits
    );
    Ok(())
}

fn signing_config_for(
    profile: &str,
    root: &camino::Utf8Path,
) -> astroforge_packager::SigningConfig {
    let mut config = match profile {
        "release" => astroforge_packager::SigningConfig::release(),
        _ => astroforge_packager::SigningConfig::debug(),
    };
    config.project_root = Some(root.to_owned());
    config
}

fn run_rsbuild_build(root: &camino::Utf8Path) -> Result<()> {
    let status = ProcessCommand::new("pnpm")
        .arg("--dir")
        .arg(root)
        .arg("exec")
        .arg("rsbuild")
        .arg("build")
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .with_context(|| format!("启动 Rsbuild build 失败：{root}"))?;
    if !status.success() {
        anyhow::bail!("Rsbuild build 退出码：{status}");
    }
    Ok(())
}

fn run_test_compat(fixtures: &camino::Utf8Path, official: bool) -> Result<()> {
    let report = astroforge_compat::runner::run(&astroforge_compat::runner::CompatOptions {
        fixtures_root: fixtures.to_owned(),
        include_official: official,
    })?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    if official && has_compat_diffs(&report) {
        anyhow::bail!("compat 对照存在差异，详见上方 JSON 报告");
    }
    Ok(())
}

fn has_compat_diffs(report: &astroforge_compat::runner::CompatReport) -> bool {
    report.fixtures.iter().any(|fixture| {
        fixture.comparison.as_ref().is_some_and(|comparison| {
            comparison.files.diff_count > 0
                || comparison.manifest.diff_count > 0
                || comparison.runtime_calls.diff_count > 0
                || comparison.rpk_structure.diff_count > 0
        })
    })
}

fn run_unpack(rpk: &camino::Utf8Path, out: &camino::Utf8Path) -> Result<()> {
    let files = astroforge_packager::unpack(rpk, out)?;
    println!("解包完成：{rpk} -> {out}");
    println!("文件数：{}", files.len());
    for file in files {
        println!("  - {file}");
    }
    Ok(())
}

fn run_install(rpk: &camino::Utf8Path) -> Result<()> {
    match astroforge_device::install(rpk)? {
        astroforge_device::DeviceAction::Executed { command } => {
            println!("安装命令已执行：{command}");
        }
        astroforge_device::DeviceAction::Skipped { reason } => {
            println!("{reason}");
        }
    }
    Ok(())
}

fn run_log() -> Result<()> {
    match astroforge_device::log()? {
        astroforge_device::DeviceAction::Executed { command } => {
            println!("日志命令已结束：{command}");
        }
        astroforge_device::DeviceAction::Skipped { reason } => {
            println!("{reason}");
        }
    }
    Ok(())
}

fn inspect_ir(path: &camino::Utf8Path, pretty: bool) -> Result<()> {
    let doc = astroforge_ir::io::load_ir_from_path(path)
        .with_context(|| format!("加载 IR 失败：{path}"))?;

    println!("IR 文件: {path}");
    println!("  ir_version:   {}", doc.ir_version);
    println!(
        "  package:      {} (v{} / {})",
        doc.manifest.package, doc.manifest.version_name, doc.manifest.version_code,
    );
    println!("  device_types: {:?}", doc.manifest.device_type_list);
    println!("  entry route:  {}", doc.manifest.router.entry);
    println!();
    println!("路由表 ({} 个页面):", doc.manifest.router.pages.len());
    for (route, page) in &doc.manifest.router.pages {
        println!("  - {} → {}", route, page.component);
    }
    println!();
    println!("IR 内容统计:");
    println!("  pages:       {}", doc.pages.len());
    println!("  components:  {}", doc.components.len());
    println!("  assets:      {}", doc.assets.len());
    println!("  app lifecycle: {} 个 hook", doc.app.lifecycle.len(),);

    if pretty {
        println!("\n完整文档：");
        println!(
            "{}",
            serde_json::to_string_pretty(&doc).expect("IrDocument 序列化"),
        );
    }
    Ok(())
}

fn inspect_rpk(path: &camino::Utf8Path) -> Result<()> {
    let info = astroforge_packager::inspect(path)?;
    println!("RPK 文件: {} ({} bytes)", info.path, info.archive_size);
    if !info.comment_keys.is_empty() {
        println!("  zip comment keys: {}", info.comment_keys.join(", "));
    }
    if let Some(manifest) = &info.manifest {
        println!(
            "  package: {}",
            manifest
                .get("package")
                .and_then(|v| v.as_str())
                .unwrap_or("<unknown>")
        );
        println!(
            "  entry:   {}",
            manifest
                .pointer("/router/entry")
                .and_then(|v| v.as_str())
                .unwrap_or("<unknown>")
        );
    }

    println!("签名:");
    println!(
        "  outer sig block: {}",
        yes_no(info.signature.outer_present)
    );
    println!(
        "  META-INF/CERT:   {} (内层 sig block: {})",
        yes_no(info.signature.cert_present),
        yes_no(info.signature.cert_signature_present)
    );
    if let Some(algo) = &info.signature.cert_digest_algorithm {
        println!(
            "  hash.json:       {} 条摘要 ({})",
            info.signature.cert_digest_count, algo
        );
    } else if info.signature.cert_present {
        println!("  hash.json:       无法解析");
    }
    if let Some(build_txt) = &info.signature.build_txt {
        println!("  build.txt:");
        for line in build_txt.lines() {
            println!("    {line}");
        }
    }

    println!("文件清单 ({}):", info.files.len());
    for file in info.files {
        println!(
            "  - {} ({} bytes, compressed {})",
            file.path, file.size, file.compressed_size
        );
    }
    Ok(())
}

fn yes_no(value: bool) -> &'static str {
    if value { "yes" } else { "no" }
}

fn write_new_file(path: &camino::Utf8Path, content: &str) -> Result<()> {
    if path.exists() {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("创建目录失败：{parent}"))?;
    }
    fs::write(path, content).with_context(|| format!("写入文件失败：{path}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn merge_package_json_preserves_existing_and_fills_missing() {
        // 模拟 `pnpm add -D @astralsight/astroforge` 写出的最小 package.json，
        // 然后 `astroforge init` 在其上合并模板必备字段。
        let mut existing = json!({
            "name": "user-watch-app",
            "devDependencies": {
                "@astralsight/astroforge": "^0.0.2",
                "some-other-dev-tool": "^1.0.0"
            }
        });

        let template = json!({
            "name": "astroforge-app",
            "version": "0.1.0",
            "private": true,
            "type": "module",
            "scripts": {
                "build": "astroforge build --target vela",
                "dev": "astroforge dev"
            },
            "dependencies": {
                "@astralsight/astroforge-core": "^0.0.2",
                "@astralsight/astroforge-rsbuild-plugin": "^0.0.2"
            },
            "devDependencies": {
                "@rsbuild/core": "^2.0.0",
                "@astralsight/astroforge": "^0.0.2",
                "typescript": "^5.0.0"
            }
        });

        let added = merge_package_json(&mut existing, &template);

        // 用户已写的 name 不被覆盖。
        assert_eq!(existing["name"], "user-watch-app");
        // 顶层缺失字段被补齐。
        assert_eq!(existing["version"], "0.1.0");
        assert_eq!(existing["private"], true);
        assert_eq!(existing["type"], "module");
        // dependencies 子表整段被加入（原 existing 没有 dependencies 键）。
        assert_eq!(
            existing["dependencies"]["@astralsight/astroforge-core"],
            "^0.0.2"
        );
        // devDependencies 增量合并，用户的 astroforge / some-other-dev-tool 原样保留。
        assert_eq!(
            existing["devDependencies"]["@astralsight/astroforge"],
            "^0.0.2"
        );
        assert_eq!(existing["devDependencies"]["some-other-dev-tool"], "^1.0.0");
        assert_eq!(existing["devDependencies"]["typescript"], "^5.0.0");
        assert_eq!(existing["devDependencies"]["@rsbuild/core"], "^2.0.0");
        // scripts 整段加入。
        assert_eq!(
            existing["scripts"]["build"],
            "astroforge build --target vela"
        );

        // 摘要里至少要包含新增的几个关键字段。
        let added_set: std::collections::HashSet<_> = added.iter().map(String::as_str).collect();
        assert!(added_set.contains("version"));
        assert!(added_set.contains("scripts.build"));
        assert!(added_set.contains("dependencies.@astralsight/astroforge-core"));
        assert!(added_set.contains("devDependencies.typescript"));
        // 用户已存在的 key 不应出现在改动摘要里。
        assert!(!added_set.contains("name"));
        assert!(!added_set.contains("devDependencies.@astralsight/astroforge"));
    }

    #[test]
    fn merge_package_json_no_op_when_existing_has_everything() {
        let mut existing = json!({
            "name": "x",
            "scripts": { "build": "echo done" },
            "dependencies": { "a": "^1" }
        });
        let template = json!({
            "name": "y",
            "scripts": { "build": "should-not-overwrite" },
            "dependencies": { "a": "^99" }
        });
        let added = merge_package_json(&mut existing, &template);
        assert!(added.is_empty(), "expected no-op, got: {added:?}");
        assert_eq!(existing["name"], "x");
        assert_eq!(existing["scripts"]["build"], "echo done");
        assert_eq!(existing["dependencies"]["a"], "^1");
    }
}
