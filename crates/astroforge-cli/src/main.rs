//! `astroforge` CLI 入口。
//!
//! 子命令对应 README.md 中描述的开发流程。仅 `inspect` 子命令在 Phase 1 落
//! 地了具体行为（IR 检视、Schema 导出），其余子命令保留参数解析骨架，待对
//! 应 Phase 实装。

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
    Dev,

    /// 一次性产出 debug 构建。
    Build {
        #[arg(long, default_value = "vela")]
        target: String,
    },

    /// 产出 release 构建（含签名、压缩、清理 dev 工具）。
    Release {
        #[arg(long, default_value = "vela")]
        target: String,
    },

    /// 运行兼容性对照测试：分级 diff aiot-toolkit 与 astroforge 产物。
    TestCompat,

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
        Command::Init { path } => anyhow::bail!("`astroforge init` 尚未实现，目标：{path}"),
        Command::Dev => anyhow::bail!("`astroforge dev` 尚未实现"),
        Command::Build { target } => anyhow::bail!("`astroforge build --target {target}` 尚未实现"),
        Command::Release { target } => {
            anyhow::bail!("`astroforge release --target {target}` 尚未实现")
        }
        Command::TestCompat => anyhow::bail!("`astroforge test-compat` 尚未实现"),
        Command::Inspect(cmd) => run_inspect(cmd),
        Command::Unpack { rpk, out } => {
            anyhow::bail!("`astroforge unpack {rpk} --out {out}` 尚未实现")
        }
        Command::Install { rpk } => anyhow::bail!("`astroforge install {rpk}` 尚未实现"),
        Command::Log => anyhow::bail!("`astroforge log` 尚未实现"),
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
        InspectCommand::Rpk { rpk } => {
            anyhow::bail!("`astroforge inspect rpk {rpk}` 尚未实现（待 Phase 4）")
        }
    }
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
    println!(
        "  app lifecycle: {} 个 hook",
        doc.app.lifecycle.len(),
    );

    if pretty {
        println!("\n完整文档：");
        println!(
            "{}",
            serde_json::to_string_pretty(&doc).expect("IrDocument 序列化"),
        );
    }
    Ok(())
}
