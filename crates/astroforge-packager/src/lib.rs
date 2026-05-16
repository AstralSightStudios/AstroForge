//! AstroForge rpk 打包器。
//!
//! 职责：将 [`astroforge_vela::VelaBuildOutput`] 与资源清单组装为符合
//! `docs/vela-runtime-abi.md` §9 描述的 rpk 包结构。容器布局与 aiot-toolkit
//! 的 `aiotpack` 二进制一致：固定 entry 排序、JSON 形式的 zip comment、按
//! `deviceTypeList` 生成的 `manifest-<device>.json`、`META-INF/CERT` 摘要
//! 包，以及 Vela runtime 期望的 RPK V2 签名块（含整体签名与逐文件 hash 段）。
//!
//! 关键不变式：
//! - `META-INF/CERT` 内层 zip 的 comment 必须为空字符串；其外层 zip 的
//!   comment 才是 `PackageMetadata::zip_comment` 形成的 JSON 元数据。
//! - 文件排序严格按 [`getSortedFiles`](aiotpack ZipUtil.getSortedFiles) 的
//!   优先级规则；位置错动会让 Vela 流式加载在 `manifest.json` 之前命中
//!   `*.json` 触发误判。
//! - `META-INF/build.txt` 与 zip comment 共享同一 [`PackageMetadata`] 来源，
//!   且 `build.txt` 不带尾随换行（与 `Object.entries().join('\n')` 等价）。

use std::collections::HashSet;
use std::env;
use std::fs::{self, File};
use std::io::{Cursor, Read, Seek, Write};

use anyhow::{Context, Result};
use camino::{Utf8Path, Utf8PathBuf};
use indexmap::IndexMap;
use regex::Regex;
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

mod signing;

use signing::{FileDigest, PackageSigner, sign_zip_package};

const META_CERT: &str = "META-INF/CERT";
const META_BUILD: &str = "META-INF/build.txt";

/// rpk 打包结果摘要。
#[derive(Debug, Clone, Serialize)]
pub struct PackReport {
    pub out: Utf8PathBuf,
    pub files: Vec<String>,
}

/// rpk inspect 摘要。
#[derive(Debug, Clone, Serialize)]
pub struct RpkInfo {
    pub path: Utf8PathBuf,
    pub files: Vec<RpkFile>,
    pub manifest: Option<serde_json::Value>,
}

/// rpk 内单个文件条目。
#[derive(Debug, Clone, Serialize)]
pub struct RpkFile {
    pub path: String,
    pub size: u64,
    pub compressed_size: u64,
}

/// 组装 Vela debug rpk。
pub fn pack(build: &astroforge_vela::VelaBuildOutput, out: &Utf8Path) -> Result<PackReport> {
    if let Some(parent) = out.parent() {
        fs::create_dir_all(parent).with_context(|| format!("创建输出目录失败：{parent}"))?;
    }

    let metadata = PackageMetadata::current();
    let signer = PackageSigner::from_env_or_default()?;
    let files = build_package_files(build, &metadata, &signer)?;
    let cursor = Cursor::new(Vec::new());
    let (cursor, written) = write_zip_package(cursor, &files, &metadata.zip_comment())?;
    let signed = sign_zip_package(&cursor.into_inner(), &file_digests(&files), &signer)?;
    fs::write(out, signed).with_context(|| format!("写入 rpk 失败：{out}"))?;

    Ok(PackReport {
        out: out.to_owned(),
        files: written,
    })
}

/// 写出未压缩目录，便于人工查看与 compat golden 对照。
pub fn write_unpacked(
    build: &astroforge_vela::VelaBuildOutput,
    out: &Utf8Path,
) -> Result<Vec<String>> {
    if out.exists() {
        fs::remove_dir_all(out).with_context(|| format!("清理旧输出目录失败：{out}"))?;
    }
    fs::create_dir_all(out).with_context(|| format!("创建输出目录失败：{out}"))?;

    let metadata = PackageMetadata::current();
    let signer = PackageSigner::from_env_or_default()?;
    let files = build_package_files(build, &metadata, &signer)?;
    let mut written = Vec::new();
    for file in files {
        write_disk_bytes(out, &file.path, &file.bytes, &mut written)?;
    }
    Ok(written)
}

/// 打包阶段写入 `META-INF/build.txt`、外层 zip comment 与 `manifest.json.packageInfo`
/// 的元数据集合。三处共用同一份字段，确保官方校验逻辑能在任一渠道复算一致结果。
///
/// 字段顺序与 aiot-toolkit 的 [`ZipUtil.createComment`] 保持一致：`originType`
/// 排首，其后依次是 `toolkit`、`timeStamp`、`node`、`platform`、`arch`、
/// `component`。即便 `originType` 为 `None`，也以 `"undefined"` 占位以兼容
/// 官方旧版 reader（其使用 `${comment[key]}` 模板字符串拼接）。
#[derive(Debug, Clone)]
struct PackageMetadata {
    origin_type: Option<String>,
    toolkit: String,
    time_stamp: String,
    node: String,
    platform: String,
    arch: String,
    component: bool,
}

impl PackageMetadata {
    fn current() -> Self {
        Self {
            origin_type: env::var("ASTROFORGE_ORIGIN_TYPE").ok(),
            toolkit: env::var("ASTROFORGE_TOOLKIT_VERSION")
                .unwrap_or_else(|_| env!("CARGO_PKG_VERSION").to_owned()),
            time_stamp: OffsetDateTime::now_utc()
                .format(&Rfc3339)
                .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_owned()),
            node: env::var("ASTROFORGE_NODE_VERSION")
                .or_else(|_| env::var("NODE_VERSION"))
                .unwrap_or_else(|_| "unknown".to_owned()),
            platform: node_platform(),
            arch: node_arch(),
            component: true,
        }
    }

    /// 公共字段序列化，保证三处 metadata 出现一致顺序。
    ///
    /// `include_origin_type` 控制是否带 `originType`：zip comment、packageInfo
    /// 这两个 JSON 渠道不带（与 aiot-toolkit `createComment` 在 JSON 序列化时
    /// `undefined` 字段直接被丢弃的行为一致），`build.txt` 文本渠道带。
    fn fields(&self, include_origin_type: bool) -> Vec<(&'static str, Value)> {
        let mut out = Vec::with_capacity(7);
        if include_origin_type {
            let value = self
                .origin_type
                .clone()
                .unwrap_or_else(|| "undefined".to_owned());
            out.push(("originType", Value::String(value)));
        }
        out.push(("toolkit", Value::String(self.toolkit.clone())));
        out.push(("timeStamp", Value::String(self.time_stamp.clone())));
        out.push(("node", Value::String(self.node.clone())));
        out.push(("platform", Value::String(self.platform.clone())));
        out.push(("arch", Value::String(self.arch.clone())));
        out.push(("component", Value::Bool(self.component)));
        out
    }

    fn zip_comment(&self) -> String {
        let mut map = serde_json::Map::new();
        for (key, value) in self.fields(false) {
            map.insert(key.to_owned(), value);
        }
        Value::Object(map).to_string()
    }

    fn package_info(&self) -> Value {
        let mut map = serde_json::Map::new();
        for (key, value) in self.fields(false) {
            map.insert(key.to_owned(), value);
        }
        Value::Object(map)
    }

    /// 与 aiot-toolkit `Object.keys(comment).map(k => \`${k}=${comment[k]}\`).join('\n')`
    /// 等价：纯文本、字段间 `\n` 分隔、末尾不带换行。
    fn build_txt(&self) -> String {
        self.fields(true)
            .into_iter()
            .map(|(key, value)| format!("{key}={}", value_to_text(&value)))
            .collect::<Vec<_>>()
            .join("\n")
    }
}

/// 将 `serde_json::Value` 渲染为 JavaScript 模板字符串拼接结果。
///
/// 对应官方 `\`${value}\`` 的语义：字符串原样、布尔小写、数值标准、`null`
/// 与缺省值显式为 `"undefined"`（与 `String(undefined)` 一致）。
fn value_to_text(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::Null => "undefined".to_owned(),
        other => other.to_string(),
    }
}

#[derive(Debug, Clone)]
struct PackageFile {
    path: String,
    bytes: Vec<u8>,
}

#[derive(Serialize)]
struct CertHashJson {
    algorithm: &'static str,
    digests: IndexMap<String, String>,
}

fn build_package_files(
    build: &astroforge_vela::VelaBuildOutput,
    metadata: &PackageMetadata,
    signer: &PackageSigner,
) -> Result<Vec<PackageFile>> {
    let manifest = manifest_with_package_info(&build.manifest_json, metadata)?;
    let entry = manifest_entry_route(&build.manifest_json)?;

    let mut files_without_cert: Vec<PackageFile> = Vec::new();
    for (device, text) in &build.device_manifests {
        files_without_cert.push(PackageFile::text(
            format!("manifest-{device}.json"),
            text.clone(),
        ));
    }
    files_without_cert.push(PackageFile::text("manifest.json", manifest));
    files_without_cert.push(PackageFile::text("app.js", build.app_js.clone()));
    for (path, js) in &build.page_js {
        files_without_cert.push(PackageFile::text(path, js.clone()));
    }
    for asset in &build.assets {
        let zip_path = asset.path.trim_start_matches('/').to_owned();
        let bytes = fs::read(&asset.source_path)
            .with_context(|| format!("读取资源失败：{}", asset.source_path))?;
        files_without_cert.push(PackageFile {
            path: zip_path,
            bytes,
        });
    }
    files_without_cert.push(PackageFile::text(META_BUILD, metadata.build_txt()));

    sort_package_files(&mut files_without_cert, &entry);

    let cert = PackageFile {
        path: META_CERT.to_owned(),
        bytes: create_cert_buffer(&files_without_cert, metadata, signer)?,
    };
    let mut files = Vec::with_capacity(files_without_cert.len() + 1);
    files.push(cert);
    files.extend(files_without_cert);
    Ok(files)
}

/// 按 aiot-toolkit `ZipUtil.getPriorities` 的规则原地排序文件。
///
/// 当多个文件落在同一优先级时按路径字典序稳定排序，避免依赖 `sort` 的不
/// 稳定性。优先级表必须与官方版本逐项对齐，任何错位都会让 Vela 流式加载
/// 在错误时机命中 `manifest-*.json` / `manifest.json` / `*.js`。
fn sort_package_files(files: &mut [PackageFile], entry_route: &str) {
    let rules = priority_rules(entry_route);
    files.sort_by(|a, b| {
        let ia = priority_index(&rules, &a.path);
        let ib = priority_index(&rules, &b.path);
        ia.cmp(&ib).then_with(|| a.path.cmp(&b.path))
    });
}

enum PriorityRule {
    Exact(&'static str),
    Pattern(Regex),
    Owned(String),
}

fn priority_rules(entry_route: &str) -> Vec<PriorityRule> {
    vec![
        PriorityRule::Exact(META_CERT),
        PriorityRule::Pattern(Regex::new(r"(?i)^i18n/.+\.json$").unwrap()),
        PriorityRule::Pattern(Regex::new(r"^manifest-\w+\.json$").unwrap()),
        PriorityRule::Exact("manifest.json"),
        PriorityRule::Exact("app.js"),
        PriorityRule::Pattern(Regex::new(r"page-chunks\.json$").unwrap()),
        PriorityRule::Pattern(Regex::new(r"skeleton/config\.json$").unwrap()),
        PriorityRule::Owned(format!("^{}/$", regex::escape(entry_route))),
        PriorityRule::Owned(format!("^{}/.+", regex::escape(entry_route))),
        PriorityRule::Pattern(Regex::new(r"(?i)^common/").unwrap()),
        PriorityRule::Pattern(Regex::new(r".+\.js").unwrap()),
        PriorityRule::Exact(META_BUILD),
    ]
}

fn priority_index(rules: &[PriorityRule], path: &str) -> usize {
    for (idx, rule) in rules.iter().enumerate() {
        let matched = match rule {
            PriorityRule::Exact(target) => *target == path,
            PriorityRule::Pattern(re) => re.is_match(path),
            PriorityRule::Owned(pattern) => Regex::new(pattern)
                .map(|re| re.is_match(path))
                .unwrap_or(false),
        };
        if matched {
            return idx;
        }
    }
    usize::MAX
}

impl PackageFile {
    fn text(path: impl Into<String>, text: String) -> Self {
        Self {
            path: path.into(),
            bytes: text.into_bytes(),
        }
    }
}

/// 注入 `packageInfo`，仅当源 manifest 未自带该字段。
///
/// 与 aiot-toolkit 的 `updateManifest` 行为一致：用户/上层流水线已提供
/// `packageInfo` 时不应覆盖，便于离线签名场景固定时间戳。
fn manifest_with_package_info(source: &str, metadata: &PackageMetadata) -> Result<String> {
    let mut manifest = serde_json::from_str::<Value>(source).context("解析 manifest.json 失败")?;
    let Some(object) = manifest.as_object_mut() else {
        anyhow::bail!("manifest.json 根节点必须是对象");
    };
    if !object.contains_key("packageInfo") {
        object.insert("packageInfo".to_owned(), metadata.package_info());
    }
    Ok(format!("{}\n", serde_json::to_string_pretty(&manifest)?))
}

fn manifest_entry_route(source: &str) -> Result<String> {
    let manifest = serde_json::from_str::<Value>(source).context("解析 manifest 路由失败")?;
    manifest
        .pointer("/router/entry")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .context("manifest.router.entry 缺失或不是字符串")
}

/// 生成 `META-INF/CERT` 的最终字节。
///
/// 流程（与 aiot-toolkit `SignUtil.signPackage` 第 1 步保持一致）：
/// 1. 以 `algorithm` + 全部非 CERT 文件的 SHA-256 摘要构造 `hash.json`。
/// 2. 将 `hash.json` 打包为零 comment 的内层 zip。aiot-toolkit 在
///    `ZipUtil.createPackagesDefinition` 中通过 `JSZip.loadAsync` →
///    `generateAsync({ comment: null })` 显式抹掉内层 zip 的 comment，因此
///    AstroForge 必须以空字符串构建，否则两侧字节流位偏移立即不等。
/// 3. 对内层 zip 整体签名，将签名块按 V2 规范拼接到 zip footer 之前。
///
/// 注意：传入的 `files` 应当不含 `META-INF/CERT` 自身——它正是本函数的产物。
fn create_cert_buffer(
    files: &[PackageFile],
    _metadata: &PackageMetadata,
    signer: &PackageSigner,
) -> Result<Vec<u8>> {
    let mut digests = IndexMap::new();
    for file in files {
        digests.insert(file.path.clone(), sha256_hex(&file.bytes));
    }
    let hash_json = CertHashJson {
        algorithm: "SHA-256",
        digests,
    };
    let hash_json = serde_json::to_vec(&hash_json)?;
    let cursor = Cursor::new(Vec::new());
    let files = [PackageFile {
        path: "hash.json".to_owned(),
        bytes: hash_json,
    }];
    let (cursor, _) = write_zip_package(cursor, &files, "")?;
    let unsigned_cert = cursor.into_inner();
    let cert_digest = [FileDigest {
        name: "hash.json".to_owned(),
        hash: sha256_bytes(&unsigned_cert),
    }];
    sign_zip_package(&unsigned_cert, &cert_digest, signer)
}

fn node_platform() -> String {
    match env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        other => other,
    }
    .to_owned()
}

fn node_arch() -> String {
    match env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        other => other,
    }
    .to_owned()
}

fn sha256_hex(bytes: &[u8]) -> String {
    sha256_bytes(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>()
}

fn sha256_bytes(bytes: &[u8]) -> Vec<u8> {
    Sha256::digest(bytes).to_vec()
}

fn file_digests(files: &[PackageFile]) -> Vec<FileDigest> {
    files
        .iter()
        .map(|file| FileDigest {
            name: file.path.clone(),
            hash: sha256_bytes(&file.bytes),
        })
        .collect()
}

/// 解压 rpk 至目录。
pub fn unpack(rpk: &Utf8Path, out: &Utf8Path) -> Result<Vec<String>> {
    let file = File::open(rpk).with_context(|| format!("打开 rpk 失败：{rpk}"))?;
    let mut archive = ZipArchive::new(file).with_context(|| format!("读取 rpk 失败：{rpk}"))?;
    fs::create_dir_all(out).with_context(|| format!("创建解包目录失败：{out}"))?;

    let mut files = Vec::new();
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).context("读取 zip 条目失败")?;
        if entry.is_dir() {
            continue;
        }
        let Some(path) = entry.enclosed_name().map(|p| p.to_owned()) else {
            continue;
        };
        let path = Utf8PathBuf::from_path_buf(path)
            .map_err(|p| anyhow::anyhow!("rpk 条目路径不是 UTF-8：{}", p.display()))?;
        let dest = out.join(&path);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).with_context(|| format!("创建解包子目录失败：{parent}"))?;
        }
        let mut bytes = Vec::new();
        entry
            .read_to_end(&mut bytes)
            .context("读取 zip 条目内容失败")?;
        fs::write(&dest, bytes).with_context(|| format!("写入解包文件失败：{dest}"))?;
        files.push(path.to_string());
    }
    files.sort();
    Ok(files)
}

/// 读取 rpk 文件清单与 manifest。
pub fn inspect(rpk: &Utf8Path) -> Result<RpkInfo> {
    let file = File::open(rpk).with_context(|| format!("打开 rpk 失败：{rpk}"))?;
    let mut archive = ZipArchive::new(file).with_context(|| format!("读取 rpk 失败：{rpk}"))?;
    let mut files = Vec::new();
    let mut manifest = None;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).context("读取 zip 条目失败")?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_owned();
        if name == "manifest.json" {
            let mut s = String::new();
            entry
                .read_to_string(&mut s)
                .context("读取 manifest.json 失败")?;
            manifest = Some(serde_json::from_str(&s).context("解析 manifest.json 失败")?);
        }
        files.push(RpkFile {
            path: name,
            size: entry.size(),
            compressed_size: entry.compressed_size(),
        });
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(RpkInfo {
        path: rpk.to_owned(),
        files,
        manifest,
    })
}

fn write_zip_package<W: Write + Seek>(
    writer: W,
    files: &[PackageFile],
    comment: &str,
) -> Result<(W, Vec<String>)> {
    let mut zip = ZipWriter::new(writer);
    zip.set_comment(comment);
    let mut written_dirs = HashSet::new();
    let mut written = Vec::new();

    for file in files {
        write_zip_file_with_dirs(
            &mut zip,
            &mut written_dirs,
            &file.path,
            &file.bytes,
            &mut written,
        )?;
    }

    let writer = zip.finish().context("写入 zip 结束记录失败")?;
    Ok((writer, written))
}

fn write_zip_file_with_dirs<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    written_dirs: &mut HashSet<String>,
    path: &str,
    bytes: &[u8],
    written: &mut Vec<String>,
) -> Result<()> {
    for dir in parent_dirs(path) {
        if written_dirs.insert(dir.clone()) {
            zip.add_directory(&dir, dir_options())
                .with_context(|| format!("创建 zip 目录条目失败：{dir}"))?;
            written.push(dir);
        }
    }

    zip.start_file(path, file_options())
        .with_context(|| format!("创建 zip 条目失败：{path}"))?;
    zip.write_all(bytes)
        .with_context(|| format!("写入 zip 条目失败：{path}"))?;
    written.push(path.to_owned());
    Ok(())
}

fn parent_dirs(path: &str) -> Vec<String> {
    path.match_indices('/')
        .map(|(index, _)| path[..=index].to_owned())
        .collect()
}

fn file_options() -> SimpleFileOptions {
    SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .compression_level(Some(9))
}

fn dir_options() -> SimpleFileOptions {
    SimpleFileOptions::default().compression_method(CompressionMethod::Stored)
}

fn write_disk_bytes(
    root: &Utf8Path,
    path: &str,
    bytes: &[u8],
    written: &mut Vec<String>,
) -> Result<()> {
    let dest = root.join(path);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).with_context(|| format!("创建目录失败：{parent}"))?;
    }
    fs::write(&dest, bytes).with_context(|| format!("写入文件失败：{dest}"))?;
    written.push(path.to_owned());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use indexmap::IndexMap;

    #[test]
    fn packs_and_inspects_minimal_rpk() {
        let tmp = tempfile::tempdir().unwrap();
        let out = Utf8Path::from_path(tmp.path()).unwrap().join("app.rpk");
        let build = astroforge_vela::VelaBuildOutput {
            app_js: "export default function() {}".into(),
            page_js: [("pages/index/index.js".into(), "page".into())]
                .into_iter()
                .collect::<IndexMap<_, _>>(),
            manifest_json: r#"{"package":"com.example","router":{"entry":"pages/index","pages":{"pages/index":{"component":"index"}}}}"#.into(),
            device_manifests: [("watch".to_owned(), "{\"package\":\"com.example\"}\n".to_owned())]
                .into_iter()
                .collect(),
            package: "com.example".into(),
            assets: Vec::new(),
        };

        let report = pack(&build, &out).unwrap();
        assert!(report.files.contains(&"manifest.json".to_owned()));
        assert!(report.files.contains(&"pages/index/index.js".to_owned()));
        // 顺序与 aiot-toolkit ZipUtil.getPriorities 一致：
        // META-INF/CERT → manifest-* → manifest.json → app.js → {entry}/ →
        // {entry}/* → common/* → 其它 .js → META-INF/build.txt。
        assert_eq!(
            report.files,
            vec![
                "META-INF/",
                "META-INF/CERT",
                "manifest-watch.json",
                "manifest.json",
                "app.js",
                "pages/",
                "pages/index/",
                "pages/index/index.js",
                "META-INF/build.txt",
            ]
        );

        let info = inspect(&out).unwrap();
        assert!(info.files.iter().any(|file| file.path == "app.js"));
        assert_eq!(
            info.manifest.unwrap()["package"].as_str(),
            Some("com.example")
        );

        let file = File::open(&out).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        let rpk_bytes = fs::read(&out).unwrap();
        assert!(signing::has_signature_block(&rpk_bytes));
        // 外层 zip comment 必须是 JSON 序列化的打包元数据。
        let outer_comment = std::str::from_utf8(archive.comment()).unwrap().to_owned();
        assert!(outer_comment.starts_with('{') && outer_comment.contains("\"toolkit\""));
        assert!(archive.by_name("manifest-watch.json").is_ok());
        let mut cert = archive.by_name(META_CERT).unwrap();
        let mut cert_bytes = Vec::new();
        cert.read_to_end(&mut cert_bytes).unwrap();
        drop(cert);
        assert!(signing::has_signature_block(&cert_bytes));

        let cert_archive = ZipArchive::new(Cursor::new(cert_bytes.clone())).unwrap();
        // 内层 CERT zip 的 comment 必须为空，与 aiot-toolkit JSZip.loadAsync
        // → generateAsync({ comment: null }) 的二次序列化语义一致。
        assert!(cert_archive.comment().is_empty());

        let mut cert_archive = ZipArchive::new(Cursor::new(cert_bytes)).unwrap();
        let mut hash_json = String::new();
        cert_archive
            .by_name("hash.json")
            .unwrap()
            .read_to_string(&mut hash_json)
            .unwrap();
        assert!(hash_json.contains("\"algorithm\":\"SHA-256\""));
        assert!(hash_json.contains("META-INF/build.txt"));
    }

    #[test]
    fn build_txt_format_matches_aiot_toolkit() {
        let metadata = PackageMetadata {
            origin_type: None,
            toolkit: "0.0.1".into(),
            time_stamp: "2026-05-16T00:00:00Z".into(),
            node: "v25.0.0".into(),
            platform: "darwin".into(),
            arch: "arm64".into(),
            component: true,
        };
        let text = metadata.build_txt();
        // 与 Object.keys(comment).map(k => `${k}=${comment[k]}`).join('\n') 等价：
        // 字段顺序固定、无尾随换行、布尔小写。
        assert_eq!(
            text,
            "originType=undefined\ntoolkit=0.0.1\ntimeStamp=2026-05-16T00:00:00Z\nnode=v25.0.0\nplatform=darwin\narch=arm64\ncomponent=true"
        );

        let comment = metadata.zip_comment();
        // zip comment 是 JSON 字符串且不包含 originType（与 JSON.stringify({...,
        // originType: undefined}) 的省略行为一致）。
        assert!(comment.starts_with('{'));
        assert!(comment.contains("\"toolkit\":\"0.0.1\""));
        assert!(!comment.contains("originType"));
    }

    #[test]
    fn priority_sort_matches_aiot_toolkit() {
        let mut files = vec![
            PackageFile::text("common/util.js", String::new()),
            PackageFile::text("META-INF/build.txt", String::new()),
            PackageFile::text("pages/index/index.js", String::new()),
            PackageFile::text("manifest.json", String::new()),
            PackageFile::text("manifest-watch.json", String::new()),
            PackageFile::text("app.js", String::new()),
            PackageFile::text("pages/other/other.js", String::new()),
            PackageFile::text("common/logo.png", String::new()),
            PackageFile::text("i18n/en.json", String::new()),
        ];
        sort_package_files(&mut files, "pages/index");
        let order: Vec<&str> = files.iter().map(|file| file.path.as_str()).collect();
        assert_eq!(
            order,
            vec![
                "i18n/en.json",
                "manifest-watch.json",
                "manifest.json",
                "app.js",
                "pages/index/index.js",
                "common/logo.png",
                "common/util.js",
                "pages/other/other.js",
                "META-INF/build.txt",
            ]
        );
    }
}
