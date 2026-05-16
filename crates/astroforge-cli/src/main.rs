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
    Dev {
        #[arg(long, default_value = ".")]
        root: Utf8PathBuf,
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
        Command::Dev { root } => run_dev(&root),
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
    write_new_file(&path.join("src/app.tsx"), "export default {};\n")?;
    write_new_file(
        &path.join("src/pages/index/index.tsx"),
        r#"import { Text, View } from "@astroforge/core";

export default function IndexPage() {
  return (
    <View>
      <Text>Hello, Vela!</Text>
    </View>
  );
}
"#,
    )?;
    write_new_file(
        &path.join("astroforge.config.ts"),
        r#"export default {
  manifest: {
    package: "com.example.astroforge",
    name: "astroforge-app",
    versionName: "1.0.0",
    versionCode: 1,
    minPlatformVersion: 1200,
    icon: "/common/logo.png",
    deviceTypeList: ["watch"],
    config: { logLevel: "log", designWidth: "device-width" },
  },
  plugin: { target: "vela" },
};
"#,
    )?;
    write_new_file(
        &path.join("rsbuild.config.ts"),
        r#"import { defineConfig } from "@rsbuild/core";
import { pluginAstroForge } from "@astroforge/rsbuild-plugin";

export default defineConfig({
  plugins: [pluginAstroForge()],
});
"#,
    )?;
    println!("AstroForge 项目已创建：{path}");
    Ok(())
}

fn run_dev(root: &camino::Utf8Path) -> Result<()> {
    let status = ProcessCommand::new("pnpm")
        .arg("--dir")
        .arg(root)
        .arg("exec")
        .arg("rsbuild")
        .arg("dev")
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .with_context(|| format!("启动 Rsbuild dev 失败：{root}"))?;
    if !status.success() {
        anyhow::bail!("Rsbuild dev 退出码：{status}");
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
    let unpacked_files = astroforge_packager::write_unpacked(&build, &unpacked)
        .with_context(|| format!("写出 unpacked 目录失败：{unpacked}"))?;
    let report = astroforge_packager::pack(&build, &out_path)
        .with_context(|| format!("打包 rpk 失败：{out_path}"))?;

    println!("构建完成：{}", report.out);
    println!("  unpacked: {unpacked}");
    println!("  files:    {}", report.files.len());
    println!("  unpacked files: {}", unpacked_files.len());
    Ok(())
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
    println!("RPK 文件: {}", info.path);
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
    println!("文件清单 ({}):", info.files.len());
    for file in info.files {
        println!(
            "  - {} ({} bytes, compressed {})",
            file.path, file.size, file.compressed_size
        );
    }
    Ok(())
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
