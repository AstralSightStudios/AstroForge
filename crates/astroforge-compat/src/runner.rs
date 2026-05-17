//! Fixture 兼容性运行器。
//!
//! 运行器负责发现 `fixtures/<NN>-name/`，构建 AstroForge 侧产物，并将
//! unpacked rpk 与摘要写入 `golden/astroforge/`。官方 aiot-toolkit 侧构建可
//! 通过 `include_official` 打开；默认关闭以避免在未安装厂商依赖时阻断本地
//! Rust / JS 验证。

use std::env;
use std::ffi::OsString;
use std::fs;
use std::io::{Cursor, Read};
use std::process::{Command, Stdio};

use anyhow::{Context, Result};
use camino::{Utf8Path, Utf8PathBuf};
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;
use zip::ZipArchive;

use crate::ir_diff::diff_values;
use crate::normalize::{
    RuntimeCall, app_module_require_sequence, normalize_json, runtime_call_sequence,
};

const META_CERT: &str = "META-INF/CERT";
const RPK_SIG_MAGIC: &[u8; 16] = b"RPK Sig Block 42";

/// compat runner 输入参数。
#[derive(Debug, Clone)]
pub struct CompatOptions {
    pub fixtures_root: Utf8PathBuf,
    pub include_official: bool,
}

impl Default for CompatOptions {
    fn default() -> Self {
        Self {
            fixtures_root: Utf8PathBuf::from("fixtures"),
            include_official: false,
        }
    }
}

/// 全量运行结果。
#[derive(Debug, Clone, Serialize)]
pub struct CompatReport {
    pub fixtures: Vec<FixtureReport>,
}

/// 单个 fixture 运行结果。
#[derive(Debug, Clone, Serialize)]
pub struct FixtureReport {
    pub name: String,
    pub astroforge: BuildSideReport,
    pub official: Option<BuildSideReport>,
    pub comparison: Option<ComparisonReport>,
}

/// 单侧构建摘要。
#[derive(Debug, Clone, Serialize)]
pub struct BuildSideReport {
    pub project: Utf8PathBuf,
    pub rpk: Option<Utf8PathBuf>,
    pub rpk_structure: Option<RpkStructureSummary>,
    pub unpacked: Option<Utf8PathBuf>,
    pub summary: Option<Utf8PathBuf>,
    pub status: String,
}

/// RPK 容器层摘要。该结构记录 zip 元数据，不参与 JS 归一化。
#[derive(Debug, Clone, Serialize)]
pub struct RpkStructureSummary {
    pub path: Utf8PathBuf,
    pub archive_size: u64,
    pub comment: RpkCommentSummary,
    pub signature: RpkSignatureSummary,
    pub entries: Vec<RpkEntrySummary>,
}

/// Vela RPK 签名块摘要。外层 rpk 与内层 `META-INF/CERT` 使用同一格式。
#[derive(Debug, Clone, Serialize)]
pub struct RpkSignatureSummary {
    pub outer: ZipSignatureSummary,
    pub cert: Option<ZipSignatureSummary>,
}

/// 单个 zip buffer 内 `RPK Sig Block 42` 的结构摘要。
#[derive(Debug, Clone, Serialize)]
pub struct ZipSignatureSummary {
    pub present: bool,
    pub kv_ids: Vec<String>,
    pub size_fields_match: bool,
}

/// zip comment 摘要。官方工具链会在此写入 toolkit / node / platform 等信息。
#[derive(Debug, Clone, Serialize)]
pub struct RpkCommentSummary {
    pub present: bool,
    pub byte_len: usize,
    pub json_keys: Vec<String>,
}

/// RPK 中单个 zip entry 的容器元数据。
#[derive(Debug, Clone, Serialize)]
pub struct RpkEntrySummary {
    pub index: usize,
    pub path: String,
    pub is_dir: bool,
    pub compression: String,
    pub size: u64,
    pub compressed_size: u64,
    pub crc32: String,
}

/// 可被 diff 的单侧 golden 摘要。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SideSummary {
    pub files: Vec<String>,
    pub manifest: Option<serde_json::Value>,
    pub runtime_calls: Vec<RuntimeCallEntry>,
    #[serde(default)]
    pub system_requires: Vec<SystemRequireEntry>,
}

/// 单个 JS 文件中的运行时调用序列。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeCallEntry {
    pub file: String,
    pub calls: Vec<RuntimeCall>,
}

/// 单个 JS 文件中的系统桥接 require 序列。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemRequireEntry {
    pub file: String,
    pub modules: Vec<String>,
}

/// AstroForge 与官方产物的分级对照摘要。
#[derive(Debug, Clone, Serialize)]
pub struct ComparisonReport {
    pub files: DiffBucket,
    pub manifest: DiffBucket,
    pub runtime_calls: DiffBucket,
    pub system_requires: DiffBucket,
    pub rpk_structure: DiffBucket,
}

/// 单个层级的 diff 结果。
#[derive(Debug, Clone, Serialize)]
pub struct DiffBucket {
    pub diff_count: usize,
    pub samples: Vec<String>,
}

/// 运行 fixture 对照构建。
pub fn run(options: &CompatOptions) -> Result<CompatReport> {
    let fixtures = discover_fixtures(&options.fixtures_root)?;
    let mut reports = Vec::new();
    for fixture in fixtures {
        let name = fixture
            .file_name()
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| fixture.to_string());
        let astroforge = run_astroforge_side(&fixture)?;
        let official = if options.include_official {
            Some(run_official_side(&fixture)?)
        } else {
            None
        };
        let comparison = match &official {
            Some(official) if official.summary.is_some() => Some(compare_sides(&fixture)?),
            _ => None,
        };
        reports.push(FixtureReport {
            name,
            astroforge,
            official,
            comparison,
        });
    }
    Ok(CompatReport { fixtures: reports })
}

fn discover_fixtures(root: &Utf8Path) -> Result<Vec<Utf8PathBuf>> {
    let root = absolutize(root)?;
    if is_fixture_dir(&root) {
        return Ok(vec![root]);
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(&root).with_context(|| format!("读取 fixtures 目录失败：{root}"))?
    {
        let entry = entry.context("读取 fixtures 子项失败")?;
        if !entry
            .file_type()
            .context("读取 fixtures 子项类型失败")?
            .is_dir()
        {
            continue;
        }
        let path = Utf8PathBuf::from_path_buf(entry.path())
            .map_err(|p| anyhow::anyhow!("fixture 路径不是 UTF-8：{}", p.display()))?;
        if is_fixture_dir(&path) {
            out.push(path);
        }
    }
    out.sort();
    Ok(out)
}

fn is_fixture_dir(path: &Utf8Path) -> bool {
    path.join("astroforge/src/pages").exists()
}

fn absolutize(path: &Utf8Path) -> Result<Utf8PathBuf> {
    if path.is_absolute() {
        return Ok(path.to_owned());
    }
    let cwd = env::current_dir().context("读取当前工作目录失败")?;
    Utf8PathBuf::from_path_buf(cwd.join(path.as_std_path()))
        .map_err(|p| anyhow::anyhow!("路径不是 UTF-8：{}", p.display()))
}

fn run_astroforge_side(fixture: &Utf8Path) -> Result<BuildSideReport> {
    let project = fixture.join("astroforge");
    let rpk = fixture.join("golden/astroforge/app.rpk");
    let unpacked = fixture.join("golden/astroforge/unpacked");
    let status = Command::new(pnpm_bin())
        .arg("--dir")
        .arg(&project)
        .arg("exec")
        .arg("astroforge")
        .arg("build")
        .arg("--target")
        .arg("vela")
        .arg("--out")
        .arg(&rpk)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .with_context(|| format!("启动 AstroForge fixture 构建失败：{project}"))?;
    if !status.success() {
        anyhow::bail!("AstroForge fixture 构建失败：{project}，退出码：{status}");
    }
    let summary = write_side_summary(&unpacked, &fixture.join("golden/astroforge/summary.json"))?;
    let rpk_structure = inspect_rpk_structure(&rpk)?;
    Ok(BuildSideReport {
        project,
        rpk: Some(rpk),
        rpk_structure: Some(rpk_structure),
        unpacked: Some(unpacked),
        summary: Some(summary),
        status: "built".into(),
    })
}

fn pnpm_bin() -> &'static str {
    if cfg!(windows) { "pnpm.cmd" } else { "pnpm" }
}

fn run_official_side(fixture: &Utf8Path) -> Result<BuildSideReport> {
    let project = fixture.join("official");
    let golden = fixture.join("golden/aiot");
    let unpacked = golden.join("unpacked");
    let rpk = golden.join("app.rpk");
    let summary_path = golden.join("summary.json");
    if !project.exists() {
        return Ok(BuildSideReport {
            project,
            rpk: None,
            rpk_structure: None,
            unpacked: None,
            summary: None,
            status: "missing".into(),
        });
    }

    let _ = fs::remove_dir_all(project.join("build"));
    let _ = fs::remove_dir_all(project.join("dist"));

    let status = Command::new(find_aiot_bin())
        .current_dir(&project)
        .arg("build")
        .env("TERM_PROGRAM", "aiot-ide")
        .env("PATH", aiot_path_env())
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .with_context(|| format!("启动 aiot-toolkit fixture 构建失败：{project}"))?;
    if !status.success() {
        anyhow::bail!("aiot-toolkit fixture 构建失败：{project}，退出码：{status}");
    }
    let build_dir = project.join("build");
    if !build_dir.join("manifest.json").exists() {
        anyhow::bail!("aiot-toolkit 未生成 build/manifest.json：{project}");
    }
    copy_dir_clean(&build_dir, &unpacked)?;
    if let Some(source_rpk) = find_first_rpk(&project.join("dist"))? {
        if let Some(parent) = rpk.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("创建官方 rpk 目录失败：{parent}"))?;
        }
        fs::copy(&source_rpk, &rpk)
            .with_context(|| format!("拷贝官方 rpk 失败：{source_rpk} -> {rpk}"))?;
    }
    let summary = write_side_summary(&unpacked, &summary_path)?;
    Ok(BuildSideReport {
        project,
        rpk_structure: rpk
            .exists()
            .then(|| inspect_rpk_structure(&rpk))
            .transpose()?,
        rpk: rpk.exists().then_some(rpk),
        unpacked: Some(unpacked),
        summary: Some(summary),
        status: "built".into(),
    })
}

fn find_aiot_bin() -> OsString {
    env::var_os("ASTROFORGE_AIOT_BIN").unwrap_or_else(|| "aiot".into())
}

/// 为 aiot 子进程构造 PATH：若 `ASTROFORGE_AIOT_BIN` 指向一个具体文件，则把
/// 其所在目录前置到现有 PATH，确保 aiot CLI 内部 spawn 同目录辅助二进制时
/// 能命中。未设置该 env 时，沿用调用者的 PATH 不做改动。
fn aiot_path_env() -> OsString {
    let mut paths = Vec::new();
    if let Some(bin) = env::var_os("ASTROFORGE_AIOT_BIN")
        && let Some(dir) = std::path::Path::new(&bin).parent()
        && !dir.as_os_str().is_empty()
    {
        paths.push(dir.to_path_buf());
    }
    if let Some(current) = env::var_os("PATH") {
        paths.extend(env::split_paths(&current));
    }
    env::join_paths(paths).unwrap_or_else(|_| env::var_os("PATH").unwrap_or_default())
}

fn find_first_rpk(dist: &Utf8Path) -> Result<Option<Utf8PathBuf>> {
    if !dist.exists() {
        return Ok(None);
    }
    let mut rpks = Vec::new();
    for entry in fs::read_dir(dist).with_context(|| format!("读取官方 dist 目录失败：{dist}"))?
    {
        let entry = entry.context("读取官方 dist 子项失败")?;
        let path = Utf8PathBuf::from_path_buf(entry.path())
            .map_err(|p| anyhow::anyhow!("官方 dist 路径不是 UTF-8：{}", p.display()))?;
        if path.extension() == Some("rpk") {
            rpks.push(path);
        }
    }
    rpks.sort();
    Ok(rpks.into_iter().next())
}

fn copy_dir_clean(from: &Utf8Path, to: &Utf8Path) -> Result<()> {
    if to.exists() {
        fs::remove_dir_all(to).with_context(|| format!("清理目录失败：{to}"))?;
    }
    fs::create_dir_all(to).with_context(|| format!("创建目录失败：{to}"))?;
    for entry in WalkDir::new(from).sort_by_file_name() {
        let entry = entry.context("读取待拷贝目录失败")?;
        let rel = entry
            .path()
            .strip_prefix(from)
            .context("计算拷贝相对路径失败")?;
        if rel.as_os_str().is_empty() {
            continue;
        }
        let dest = to.as_std_path().join(rel);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&dest)
                .with_context(|| format!("创建拷贝子目录失败：{}", dest.display()))?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent)
                    .with_context(|| format!("创建拷贝父目录失败：{}", parent.display()))?;
            }
            fs::copy(entry.path(), &dest).with_context(|| {
                format!(
                    "拷贝文件失败：{} -> {}",
                    entry.path().display(),
                    dest.display()
                )
            })?;
        }
    }
    Ok(())
}

fn write_side_summary(unpacked: &Utf8Path, out: &Utf8Path) -> Result<Utf8PathBuf> {
    let summary = collect_side_summary(unpacked)?;
    if let Some(parent) = out.parent() {
        fs::create_dir_all(parent).with_context(|| format!("创建摘要目录失败：{parent}"))?;
    }
    let mut json = serde_json::to_string_pretty(&summary)?;
    json.push('\n');
    fs::write(out, json).with_context(|| format!("写入 compat 摘要失败：{out}"))?;
    Ok(out.to_owned())
}

fn collect_side_summary(unpacked: &Utf8Path) -> Result<SideSummary> {
    let mut files = Vec::new();
    let mut runtime_calls = Vec::new();
    let mut system_requires = Vec::new();
    for entry in WalkDir::new(unpacked).sort_by_file_name() {
        let entry = entry.context("读取 unpacked 文件失败")?;
        if !entry.file_type().is_file() {
            continue;
        }
        let rel = entry
            .path()
            .strip_prefix(unpacked)
            .context("计算 unpacked 相对路径失败")?;
        let rel = Utf8PathBuf::from_path_buf(rel.to_owned())
            .map_err(|p| anyhow::anyhow!("unpacked 文件路径不是 UTF-8：{}", p.display()))?;
        let rel = rel.to_string();
        files.push(rel.clone());
        if rel.ends_with(".js") {
            let source = fs::read_to_string(entry.path())
                .with_context(|| format!("读取 JS 文件失败：{}", entry.path().display()))?;
            runtime_calls.push(RuntimeCallEntry {
                file: rel.clone(),
                calls: runtime_call_sequence(&source),
            });
            system_requires.push(SystemRequireEntry {
                file: rel,
                modules: app_module_require_sequence(&source),
            });
        }
    }
    files.sort();
    runtime_calls.sort_by(|a, b| a.file.cmp(&b.file));
    system_requires.sort_by(|a, b| a.file.cmp(&b.file));

    let manifest = fs::read_to_string(unpacked.join("manifest.json"))
        .ok()
        .and_then(|source| normalize_json(&source).ok())
        .map(strip_nondeterministic_manifest_fields);

    Ok(SideSummary {
        files,
        manifest,
        runtime_calls,
        system_requires,
    })
}

/// 抹除 `manifest.packageInfo`：该字段写入时间戳 / Node 版本 / arch / platform
/// 等环境派生值，每次构建都不同；保留在落盘 summary 中会让 fixture goldens
/// 每跑必 diff。比较函数 [`normalized_manifest`] 本就剔除该字段，写盘时一并
/// 抹除让 git 历史保持稳定。
fn strip_nondeterministic_manifest_fields(mut manifest: serde_json::Value) -> serde_json::Value {
    if let Some(object) = manifest.as_object_mut() {
        object.remove("packageInfo");
    }
    manifest
}

fn compare_sides(fixture: &Utf8Path) -> Result<ComparisonReport> {
    let astroforge = read_summary(&fixture.join("golden/astroforge/summary.json"))?;
    let official = read_summary(&fixture.join("golden/aiot/summary.json"))?;
    Ok(ComparisonReport {
        files: compare_json(&normalized_files(&astroforge), &normalized_files(&official))?,
        manifest: compare_json(
            &normalized_manifest(astroforge.manifest.clone()),
            &normalized_manifest(official.manifest.clone()),
        )?,
        runtime_calls: compare_json(
            &runtime_callee_sequence(&astroforge),
            &runtime_callee_sequence(&official),
        )?,
        system_requires: compare_json(
            &system_require_sequence(&astroforge),
            &system_require_sequence(&official),
        )?,
        rpk_structure: compare_json(
            &normalized_rpk_structure(&inspect_rpk_structure(
                &fixture.join("golden/astroforge/app.rpk"),
            )?),
            &normalized_rpk_structure(&inspect_rpk_structure(
                &fixture.join("golden/aiot/app.rpk"),
            )?),
        )?,
    })
}

/// 仅对照两侧已落地的 `summary.json`，跳过容器层与 rpk 重建。
///
/// 设计用于 `cargo test` 静态校验：CI 上没有 pnpm / aiot-toolkit 也能跑通
/// files / manifest / runtime_calls 三级 diff。容器层 rpk_structure 留给
/// `astroforge test-compat --official` 在带工具链的环境中执行。
pub fn compare_summaries_only(fixture: &Utf8Path) -> Result<SummaryComparison> {
    let astroforge = read_summary(&fixture.join("golden/astroforge/summary.json"))?;
    let official = read_summary(&fixture.join("golden/aiot/summary.json"))?;
    Ok(SummaryComparison {
        files: compare_json(&normalized_files(&astroforge), &normalized_files(&official))?,
        manifest: compare_json(
            &normalized_manifest(astroforge.manifest.clone()),
            &normalized_manifest(official.manifest.clone()),
        )?,
        runtime_calls: compare_json(
            &runtime_callee_sequence(&astroforge),
            &runtime_callee_sequence(&official),
        )?,
        system_requires: compare_json(
            &system_require_sequence(&astroforge),
            &system_require_sequence(&official),
        )?,
    })
}

/// `compare_summaries_only` 的输出。`rpk_structure` 缺席是设计行为，详见函数文档。
#[derive(Debug, Clone, Serialize)]
pub struct SummaryComparison {
    pub files: DiffBucket,
    pub manifest: DiffBucket,
    pub runtime_calls: DiffBucket,
    pub system_requires: DiffBucket,
}

fn inspect_rpk_structure(path: &Utf8Path) -> Result<RpkStructureSummary> {
    let bytes = fs::read(path).with_context(|| format!("打开 rpk 失败：{path}"))?;
    let archive_size = bytes.len() as u64;
    let mut archive =
        ZipArchive::new(Cursor::new(&bytes)).with_context(|| format!("读取 rpk 失败：{path}"))?;
    let comment = summarize_zip_comment(archive.comment());
    let mut entries = Vec::new();

    for index in 0..archive.len() {
        let entry = archive.by_index(index).context("读取 zip 条目失败")?;
        entries.push(RpkEntrySummary {
            index,
            path: entry.name().to_owned(),
            is_dir: entry.is_dir(),
            compression: format!("{:?}", entry.compression()),
            size: entry.size(),
            compressed_size: entry.compressed_size(),
            crc32: format!("{:08x}", entry.crc32()),
        });
    }
    let cert_signature = match archive.by_name(META_CERT) {
        Ok(mut cert) => {
            let mut cert_bytes = Vec::new();
            cert.read_to_end(&mut cert_bytes)
                .context("读取 META-INF/CERT 失败")?;
            Some(summarize_signature_block(&cert_bytes))
        }
        Err(_) => None,
    };

    Ok(RpkStructureSummary {
        path: path.to_owned(),
        archive_size,
        comment,
        signature: RpkSignatureSummary {
            outer: summarize_signature_block(&bytes),
            cert: cert_signature,
        },
        entries,
    })
}

fn summarize_signature_block(bytes: &[u8]) -> ZipSignatureSummary {
    let Some(magic_offset) = find_bytes(bytes, RPK_SIG_MAGIC) else {
        return ZipSignatureSummary {
            present: false,
            kv_ids: Vec::new(),
            size_fields_match: false,
        };
    };
    if magic_offset < 8 {
        return ZipSignatureSummary {
            present: true,
            kv_ids: Vec::new(),
            size_fields_match: false,
        };
    }

    let Some(size) = read_u32(bytes, magic_offset - 8).map(|value| value as usize) else {
        return ZipSignatureSummary {
            present: true,
            kv_ids: Vec::new(),
            size_fields_match: false,
        };
    };
    let Some(block_start) = magic_offset
        .checked_sub(size)
        .and_then(|value| value.checked_add(8))
    else {
        return ZipSignatureSummary {
            present: true,
            kv_ids: Vec::new(),
            size_fields_match: false,
        };
    };
    if block_start + 8 > magic_offset || magic_offset + RPK_SIG_MAGIC.len() > bytes.len() {
        return ZipSignatureSummary {
            present: true,
            kv_ids: Vec::new(),
            size_fields_match: false,
        };
    }

    let leading_size = read_u32(bytes, block_start);
    let trailing_size = read_u32(bytes, magic_offset - 8);
    let size_fields_match = leading_size == trailing_size
        && leading_size == Some(size as u32)
        && read_u32(bytes, block_start + 4) == Some(0)
        && read_u32(bytes, magic_offset - 4) == Some(0);

    let mut kv_ids = Vec::new();
    let mut cursor = block_start + 8;
    let kv_end = magic_offset - 8;
    while cursor + 12 <= kv_end {
        let Some(kv_size) = read_u32(bytes, cursor).map(|value| value as usize) else {
            break;
        };
        let Some(id) = read_u32(bytes, cursor + 8) else {
            break;
        };
        kv_ids.push(format!("0x{id:08x}"));
        let Some(next) = cursor
            .checked_add(kv_size)
            .and_then(|value| value.checked_add(8))
        else {
            break;
        };
        if next <= cursor || next > kv_end {
            break;
        }
        cursor = next;
    }

    ZipSignatureSummary {
        present: true,
        kv_ids,
        size_fields_match,
    }
}

fn summarize_zip_comment(comment: &[u8]) -> RpkCommentSummary {
    let mut json_keys = Vec::new();
    if let Ok(value) = serde_json::from_slice::<serde_json::Value>(comment)
        && let Some(object) = value.as_object()
    {
        json_keys.extend(object.keys().cloned());
    }
    json_keys.sort();

    RpkCommentSummary {
        present: !comment.is_empty(),
        byte_len: comment.len(),
        json_keys,
    }
}

#[derive(Debug, Serialize)]
struct NormalizedRpkStructure {
    comment: NormalizedRpkComment,
    signature: NormalizedRpkSignature,
    entries: Vec<NormalizedRpkEntry>,
}

#[derive(Debug, Serialize)]
struct NormalizedRpkComment {
    present: bool,
    json_keys: Vec<String>,
}

#[derive(Debug, Serialize)]
struct NormalizedRpkSignature {
    outer: NormalizedZipSignature,
    cert: Option<NormalizedZipSignature>,
}

#[derive(Debug, Serialize)]
struct NormalizedZipSignature {
    present: bool,
    kv_ids: Vec<String>,
    size_fields_match: bool,
}

#[derive(Debug, Serialize)]
struct NormalizedRpkEntry {
    path: String,
    is_dir: bool,
    compression: String,
}

fn normalized_rpk_structure(summary: &RpkStructureSummary) -> NormalizedRpkStructure {
    NormalizedRpkStructure {
        comment: NormalizedRpkComment {
            present: summary.comment.present,
            json_keys: summary.comment.json_keys.clone(),
        },
        signature: NormalizedRpkSignature {
            outer: normalized_zip_signature(&summary.signature.outer),
            cert: summary
                .signature
                .cert
                .as_ref()
                .map(normalized_zip_signature),
        },
        entries: summary
            .entries
            .iter()
            .map(|entry| NormalizedRpkEntry {
                path: entry.path.clone(),
                is_dir: entry.is_dir,
                compression: entry.compression.clone(),
            })
            .collect(),
    }
}

fn normalized_zip_signature(signature: &ZipSignatureSummary) -> NormalizedZipSignature {
    NormalizedZipSignature {
        present: signature.present,
        kv_ids: signature.kv_ids.clone(),
        size_fields_match: signature.size_fields_match,
    }
}

fn find_bytes(bytes: &[u8], needle: &[u8]) -> Option<usize> {
    bytes
        .windows(needle.len())
        .position(|window| window == needle)
}

fn read_u32(bytes: &[u8], offset: usize) -> Option<u32> {
    bytes
        .get(offset..offset + 4)
        .and_then(|slice| slice.try_into().ok())
        .map(u32::from_le_bytes)
}

fn read_summary(path: &Utf8Path) -> Result<SideSummary> {
    let source = fs::read_to_string(path).with_context(|| format!("读取 summary 失败：{path}"))?;
    serde_json::from_str(&source).with_context(|| format!("解析 summary 失败：{path}"))
}

fn compare_json<L: Serialize, R: Serialize>(left: &L, right: &R) -> Result<DiffBucket> {
    let left = serde_json::to_value(left)?;
    let right = serde_json::to_value(right)?;
    let diffs = diff_values(&left, &right);
    Ok(DiffBucket {
        diff_count: diffs.len(),
        samples: diffs.iter().take(10).map(ToString::to_string).collect(),
    })
}

fn runtime_callee_sequence(summary: &SideSummary) -> Vec<String> {
    summary
        .runtime_calls
        .iter()
        .flat_map(|entry| {
            entry
                .calls
                .iter()
                .map(|call| format!("{}:{}", entry.file, call.callee))
        })
        .collect()
}

fn system_require_sequence(summary: &SideSummary) -> Vec<String> {
    summary
        .system_requires
        .iter()
        .flat_map(|entry| {
            entry
                .modules
                .iter()
                .map(|module| format!("{}:{module}", entry.file))
        })
        .collect()
}

fn normalized_files(summary: &SideSummary) -> Vec<String> {
    summary
        .files
        .iter()
        .filter(|file| !matches!(file.as_str(), "META-INF/CERT" | "manifest-watch.json"))
        .cloned()
        .collect()
}

fn normalized_manifest(manifest: Option<serde_json::Value>) -> Option<serde_json::Value> {
    let mut manifest = manifest?;
    if let Some(object) = manifest.as_object_mut() {
        object.remove("packageInfo");
    }
    Some(manifest)
}
