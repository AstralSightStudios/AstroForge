//! AstroForge rpk 打包器。
//!
//! 职责：将 [`astroforge_vela::VelaBuildOutput`] 与资源清单组装为符合
//! `docs/vela-runtime-abi.md` §9 描述的 rpk 包结构。Vela target 使用接近
//! aiot-toolkit 的容器布局：固定 entry 顺序、zip comment、`manifest-watch`
//!、`META-INF/CERT` 摘要包，以及 Vela runtime 期望的 RPK 签名块。

use std::collections::HashSet;
use std::env;
use std::fs::{self, File};
use std::io::{Cursor, Read, Seek, Write};

use anyhow::{Context, Result};
use camino::{Utf8Path, Utf8PathBuf};
use indexmap::IndexMap;
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
const MANIFEST_WATCH: &str = "manifest-watch.json";

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

#[derive(Debug, Clone)]
struct PackageMetadata {
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
            toolkit: env!("CARGO_PKG_VERSION").to_owned(),
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

    fn zip_comment(&self) -> String {
        serde_json::json!({
            "toolkit": self.toolkit,
            "timeStamp": self.time_stamp,
            "node": self.node,
            "platform": self.platform,
            "arch": self.arch,
            "component": self.component,
        })
        .to_string()
    }

    fn package_info(&self) -> Value {
        serde_json::json!({
            "toolkit": self.toolkit,
            "timeStamp": self.time_stamp,
            "node": self.node,
            "platform": self.platform,
            "arch": self.arch,
            "component": self.component,
        })
    }

    fn build_txt(&self) -> String {
        format!(
            "originType=undefined\ntoolkit={}\ntimeStamp={}\nnode={}\nplatform={}\narch={}\ncomponent={}\n",
            self.toolkit, self.time_stamp, self.node, self.platform, self.arch, self.component
        )
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
    let manifest_watch = manifest_watch_json(&build.manifest_json)?;
    let mut files_without_cert = Vec::new();
    files_without_cert.push(PackageFile::text(MANIFEST_WATCH, manifest_watch));
    files_without_cert.push(PackageFile::text("manifest.json", manifest));
    files_without_cert.push(PackageFile::text("app.js", build.app_js.clone()));

    let entry = manifest_entry_route(&build.manifest_json)?;
    let mut entry_pages = Vec::new();
    let mut remaining_pages = Vec::new();
    for (path, js) in &build.page_js {
        let file = PackageFile::text(path, js.clone());
        if path.starts_with(&format!("{entry}/")) {
            entry_pages.push(file);
        } else {
            remaining_pages.push(file);
        }
    }
    entry_pages.sort_by(|a, b| a.path.cmp(&b.path));
    remaining_pages.sort_by(|a, b| a.path.cmp(&b.path));
    files_without_cert.extend(entry_pages);

    let mut assets = Vec::new();
    for asset in &build.assets {
        let zip_path = asset.path.trim_start_matches('/').to_owned();
        let bytes = fs::read(&asset.source_path)
            .with_context(|| format!("读取资源失败：{}", asset.source_path))?;
        assets.push(PackageFile {
            path: zip_path,
            bytes,
        });
    }
    assets.sort_by(|a, b| a.path.cmp(&b.path));
    files_without_cert.extend(assets);
    files_without_cert.extend(remaining_pages);
    files_without_cert.push(PackageFile::text(META_BUILD, metadata.build_txt()));

    let cert = PackageFile {
        path: META_CERT.to_owned(),
        bytes: create_cert_buffer(&files_without_cert, metadata, signer)?,
    };
    let mut files = Vec::with_capacity(files_without_cert.len() + 1);
    files.push(cert);
    files.extend(files_without_cert);
    Ok(files)
}

impl PackageFile {
    fn text(path: impl Into<String>, text: String) -> Self {
        Self {
            path: path.into(),
            bytes: text.into_bytes(),
        }
    }
}

fn manifest_with_package_info(source: &str, metadata: &PackageMetadata) -> Result<String> {
    let mut manifest = serde_json::from_str::<Value>(source).context("解析 manifest.json 失败")?;
    let Some(object) = manifest.as_object_mut() else {
        anyhow::bail!("manifest.json 根节点必须是对象");
    };
    object.insert("packageInfo".to_owned(), metadata.package_info());
    Ok(format!("{}\n", serde_json::to_string_pretty(&manifest)?))
}

fn manifest_watch_json(source: &str) -> Result<String> {
    let mut manifest =
        serde_json::from_str::<Value>(source).context("解析 manifest-watch.json 失败")?;
    if let Some(object) = manifest.as_object_mut() {
        object.remove("minAPILevel");
        object.remove("packageInfo");
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

fn create_cert_buffer(
    files: &[PackageFile],
    metadata: &PackageMetadata,
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
    let (cursor, _) = write_zip_package(cursor, &files, &metadata.zip_comment())?;
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
            package: "com.example".into(),
            assets: Vec::new(),
        };

        let report = pack(&build, &out).unwrap();
        assert!(report.files.contains(&"manifest.json".to_owned()));
        assert!(report.files.contains(&"pages/index/index.js".to_owned()));
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
        assert!(!archive.comment().is_empty());
        assert!(archive.by_name("manifest-watch.json").is_ok());
        let mut cert = archive.by_name(META_CERT).unwrap();
        let mut cert_bytes = Vec::new();
        cert.read_to_end(&mut cert_bytes).unwrap();
        drop(cert);
        assert!(signing::has_signature_block(&cert_bytes));

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
}
