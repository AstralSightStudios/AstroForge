use std::env;
use std::fs;
use std::ops::Range;
use std::path::PathBuf;

use anyhow::{Context, Result, ensure};
use base64::Engine;
use camino::Utf8Path;
use rsa::pkcs1::DecodeRsaPrivateKey;
use rsa::pkcs1v15::SigningKey;
use rsa::pkcs8::{DecodePrivateKey, EncodePublicKey};
use rsa::traits::PublicKeyParts;
use rsa::{RsaPrivateKey, RsaPublicKey};
use sha2::{Digest, Sha256};
use signature::{SignatureEncoding, Signer};

use crate::{PackageMode, SigningConfig};

const DEFAULT_DEBUG_PRIVATE_PEM: &str = include_str!("signing/default_debug_private.pem");
const DEFAULT_DEBUG_CERTIFICATE_PEM: &str = include_str!("signing/default_debug_certificate.pem");

#[cfg(test)]
pub(crate) const DEFAULT_DEBUG_PRIVATE_PEM_FOR_TEST: &str = DEFAULT_DEBUG_PRIVATE_PEM;
#[cfg(test)]
pub(crate) const DEFAULT_DEBUG_CERTIFICATE_PEM_FOR_TEST: &str = DEFAULT_DEBUG_CERTIFICATE_PEM;
const SIG_MAGIC: &[u8; 16] = b"RPK Sig Block 42";
const SIGNATURE_ALGORITHM_ID: u32 = 0x0103;
const SIGNATURE_KV_ID: u32 = 0x0100_0101;
const FILE_DIGEST_KV_ID: u32 = 0x0100_0201;

const ENV_PRIVATE_KEY: &str = "ASTROFORGE_VELA_PRIVATE_KEY";
const ENV_CERTIFICATE: &str = "ASTROFORGE_VELA_CERTIFICATE";

/// 描述本次签名材料的来源，用于诊断输出与对照测试。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SigningSource {
    /// 通过环境变量显式指定。
    EnvVars {
        private_key: PathBuf,
        certificate: PathBuf,
    },
    /// 在项目签名目录下命中。`label` 标记命中的子目录（如
    /// `"debug"`、`""`、`"release"`、`"oldRelease"`），便于日志区分。
    ProjectPath {
        label: &'static str,
        private_key: PathBuf,
        certificate: PathBuf,
    },
    /// 退化到 packager 内置的 debug 默认证书。仅 debug 模式允许。
    DefaultDebug,
}

#[derive(Debug, Clone)]
pub(crate) struct FileDigest {
    pub(crate) name: String,
    pub(crate) hash: Vec<u8>,
}

#[derive(Debug, Clone)]
pub(crate) struct PackageSigner {
    private_key: RsaPrivateKey,
    certificate_der: Vec<u8>,
    public_key_der: Vec<u8>,
    source: SigningSource,
}

#[derive(Debug, Clone)]
struct ZipSections {
    header: Range<usize>,
    central: Range<usize>,
    footer: Range<usize>,
}

impl PackageSigner {
    /// 解析签名材料。优先级与 aiot-toolkit `SignUtil.getProjectSignConfig`
    /// 一致：
    ///
    /// 1. 环境变量 `ASTROFORGE_VELA_PRIVATE_KEY` / `..._CERTIFICATE`
    ///    （两个必须同时存在；仅设其一报错）。
    /// 2. 项目签名目录扫描（`sign_root` 默认 `<project_root>/sign`）：
    ///    - debug 模式：`sign/debug/{private,certificate}.pem` →
    ///      `sign/{private,certificate}.pem` → 内置 debug 默认证书。
    ///    - release 模式：`sign/release/{private,certificate}.pem` →
    ///      `sign/{private,certificate}.pem`；都不存在直接报错（不可使用
    ///      内置 debug 证书签 release 包）。
    pub(crate) fn discover(config: &SigningConfig) -> Result<Self> {
        if let Some((private_path, certificate_path)) = env_signing_pair()? {
            let private_pem = fs::read_to_string(&private_path).with_context(|| {
                format!("读取 Vela 私钥失败：{}", private_path.display())
            })?;
            let certificate_pem = fs::read_to_string(&certificate_path).with_context(|| {
                format!("读取 Vela 证书失败：{}", certificate_path.display())
            })?;
            return Self::from_pem(
                &private_pem,
                &certificate_pem,
                SigningSource::EnvVars {
                    private_key: private_path,
                    certificate: certificate_path,
                },
            );
        }

        if let Some(sign_root) = config.sign_root() {
            for candidate in project_candidates(&sign_root, config.mode) {
                if candidate.private_key.exists() && candidate.certificate.exists() {
                    let private_pem = fs::read_to_string(&candidate.private_key)
                        .with_context(|| {
                            format!(
                                "读取项目签名私钥失败：{}",
                                candidate.private_key.display()
                            )
                        })?;
                    let certificate_pem = fs::read_to_string(&candidate.certificate)
                        .with_context(|| {
                            format!(
                                "读取项目签名证书失败：{}",
                                candidate.certificate.display()
                            )
                        })?;
                    return Self::from_pem(
                        &private_pem,
                        &certificate_pem,
                        SigningSource::ProjectPath {
                            label: candidate.label,
                            private_key: candidate.private_key,
                            certificate: candidate.certificate,
                        },
                    );
                }
            }
        }

        match config.mode {
            PackageMode::Debug => Self::from_pem(
                DEFAULT_DEBUG_PRIVATE_PEM,
                DEFAULT_DEBUG_CERTIFICATE_PEM,
                SigningSource::DefaultDebug,
            ),
            PackageMode::Release => anyhow::bail!(
                "未找到 release 签名材料：请设置 ASTROFORGE_VELA_PRIVATE_KEY/ASTROFORGE_VELA_CERTIFICATE，或在项目下放置 sign/release/private.pem 与 sign/release/certificate.pem（也可放在 sign/ 根目录）"
            ),
        }
    }

    /// 暴露给打包器：本次签名材料的来源描述，写入打包 report 供 CLI 显示。
    pub(crate) fn source(&self) -> &SigningSource {
        &self.source
    }

    /// 暴露给打包器：基于 SPKI DER 派生的公钥指纹（SHA-256 hex 截前 16 位），
    /// 用于 `astroforge inspect rpk` 输出与远程证书比对。
    pub(crate) fn public_key_fingerprint(&self) -> String {
        let mut hex = String::with_capacity(16);
        for byte in &Sha256::digest(&self.public_key_der)[..8] {
            hex.push_str(&format!("{byte:02x}"));
        }
        hex
    }

    /// 暴露给打包器：RSA 模数比特位长度。Vela 设备一般要求 ≥ 2048。
    pub(crate) fn modulus_bits(&self) -> usize {
        self.private_key.size() * 8
    }

    fn from_pem(
        private_pem: &str,
        certificate_pem: &str,
        source: SigningSource,
    ) -> Result<Self> {
        let private_key = match RsaPrivateKey::from_pkcs1_pem(private_pem) {
            Ok(private_key) => private_key,
            Err(_) => {
                RsaPrivateKey::from_pkcs8_pem(private_pem).context("解析 Vela 签名私钥失败")?
            }
        };
        let certificate_der = decode_pem_der(certificate_pem).context("解析 Vela 证书失败")?;
        let public_key_der = RsaPublicKey::from(&private_key)
            .to_public_key_der()
            .context("导出 Vela 公钥失败")?
            .as_bytes()
            .to_vec();

        Ok(Self {
            private_key,
            certificate_der,
            public_key_der,
            source,
        })
    }

    fn sign(&self, bytes: &[u8]) -> Vec<u8> {
        let signing_key = SigningKey::<Sha256>::new(self.private_key.clone());
        signing_key.sign(bytes).to_vec()
    }
}

fn env_signing_pair() -> Result<Option<(PathBuf, PathBuf)>> {
    match (env::var_os(ENV_PRIVATE_KEY), env::var_os(ENV_CERTIFICATE)) {
        (Some(private), Some(certificate)) => Ok(Some((private.into(), certificate.into()))),
        (None, None) => Ok(None),
        _ => anyhow::bail!(
            "{ENV_PRIVATE_KEY} 与 {ENV_CERTIFICATE} 必须同时设置",
        ),
    }
}

struct ProjectCandidate {
    label: &'static str,
    private_key: PathBuf,
    certificate: PathBuf,
}

fn project_candidates(sign_root: &Utf8Path, mode: PackageMode) -> Vec<ProjectCandidate> {
    let pair = |sub: &str, label: &'static str| {
        let dir = if sub.is_empty() {
            sign_root.to_path_buf()
        } else {
            sign_root.join(sub)
        };
        ProjectCandidate {
            label,
            private_key: dir.join("private.pem").into_std_path_buf(),
            certificate: dir.join("certificate.pem").into_std_path_buf(),
        }
    };
    match mode {
        PackageMode::Debug => vec![pair("debug", "debug"), pair("", "root")],
        // release 路径与 aiot `oldRelease`/`sign` 一致，覆盖两种工作流：
        // - 严格分目录（`sign/release/...`）：审计友好；
        // - 单一目录（`sign/...`）：CI 共用一组生产证书。
        PackageMode::Release => vec![pair("release", "release"), pair("", "root")],
    }
}

pub(crate) fn sign_zip_package(
    zip_buffer: &[u8],
    file_digests: &[FileDigest],
    signer: &PackageSigner,
) -> Result<Vec<u8>> {
    let sections = parse_zip_sections(zip_buffer)?;
    let header_hash = section_digest(&zip_buffer[sections.header.clone()])?;
    let central_hash = section_digest(&zip_buffer[sections.central.clone()])?;
    let footer_hash = section_digest(&zip_buffer[sections.footer.clone()])?;
    let whole_digest = whole_digest(&[&header_hash, &central_hash, &footer_hash]);
    let sign_chunk = make_sign_chunk(&whole_digest, file_digests, signer)?;

    let mut footer = zip_buffer[sections.footer.clone()].to_vec();
    let new_central_offset = checked_u32(sections.central.start + sign_chunk.len())?;
    footer[16..20].copy_from_slice(&new_central_offset.to_le_bytes());

    let mut signed = Vec::with_capacity(zip_buffer.len() + sign_chunk.len());
    signed.extend_from_slice(&zip_buffer[sections.header]);
    signed.extend_from_slice(&sign_chunk);
    signed.extend_from_slice(&zip_buffer[sections.central]);
    signed.extend_from_slice(&footer);
    Ok(signed)
}

/// 在任意 zip buffer（外层 rpk 或内层 META-INF/CERT）中扫描 `RPK Sig Block 42`
/// 魔法字符串，判断该 zip 是否携带 Vela V2 签名块。
pub(crate) fn has_rpk_signature_block(bytes: &[u8]) -> bool {
    bytes
        .windows(SIG_MAGIC.len())
        .any(|window| window == SIG_MAGIC)
}

#[cfg(test)]
pub(crate) fn has_signature_block(bytes: &[u8]) -> bool {
    has_rpk_signature_block(bytes)
}

fn make_sign_chunk(
    whole_digest: &[u8],
    file_digests: &[FileDigest],
    signer: &PackageSigner,
) -> Result<Vec<u8>> {
    let digest_block = make_digest_block(whole_digest)?;
    let cert_block = make_sized_block(&signer.certificate_der)?;
    let signdata = make_signdata_buffer(&digest_block, &cert_block)?;
    let signature = signer.sign(&signdata);
    let signature_block = make_signature_block(&signature)?;
    let sign_block = make_sign_block(&signdata, &signature_block, &signer.public_key_der)?;
    let signature_kv = make_kv_block(SIGNATURE_KV_ID, &sign_block)?;

    let mut kv_blocks = vec![signature_kv];
    if !file_digests.is_empty() {
        kv_blocks.push(make_kv_block(
            FILE_DIGEST_KV_ID,
            &make_file_digest_chunk(file_digests, signer)?,
        )?);
    }

    let body_len = kv_blocks.iter().map(Vec::len).sum::<usize>();
    let size = checked_u32(24 + body_len)?;
    let mut buffer = Vec::with_capacity(32 + body_len);
    push_u32(&mut buffer, size);
    push_u32(&mut buffer, 0);
    for block in kv_blocks {
        buffer.extend_from_slice(&block);
    }
    push_u32(&mut buffer, size);
    push_u32(&mut buffer, 0);
    buffer.extend_from_slice(SIG_MAGIC);
    Ok(buffer)
}

fn make_digest_block(digest: &[u8]) -> Result<Vec<u8>> {
    let mut buffer = Vec::with_capacity(digest.len() + 12);
    push_u32(&mut buffer, checked_u32(digest.len() + 8)?);
    push_u32(&mut buffer, SIGNATURE_ALGORITHM_ID);
    push_u32(&mut buffer, checked_u32(digest.len())?);
    buffer.extend_from_slice(digest);
    Ok(buffer)
}

fn make_signdata_buffer(digest_block: &[u8], cert_block: &[u8]) -> Result<Vec<u8>> {
    let mut buffer = Vec::with_capacity(12 + digest_block.len() + cert_block.len());
    push_u32(&mut buffer, checked_u32(digest_block.len())?);
    buffer.extend_from_slice(digest_block);
    push_u32(&mut buffer, checked_u32(cert_block.len())?);
    buffer.extend_from_slice(cert_block);
    push_u32(&mut buffer, 0);
    Ok(buffer)
}

fn make_signature_block(signature: &[u8]) -> Result<Vec<u8>> {
    let mut buffer = Vec::with_capacity(signature.len() + 12);
    push_u32(&mut buffer, checked_u32(signature.len() + 8)?);
    push_u32(&mut buffer, SIGNATURE_ALGORITHM_ID);
    push_u32(&mut buffer, checked_u32(signature.len())?);
    buffer.extend_from_slice(signature);
    Ok(buffer)
}

fn make_sign_block(signdata: &[u8], signature_block: &[u8], public_key: &[u8]) -> Result<Vec<u8>> {
    let body_len = 12 + signdata.len() + signature_block.len() + public_key.len();
    let mut buffer = Vec::with_capacity(body_len + 4);
    push_u32(&mut buffer, checked_u32(body_len)?);
    push_u32(&mut buffer, checked_u32(signdata.len())?);
    buffer.extend_from_slice(signdata);
    push_u32(&mut buffer, checked_u32(signature_block.len())?);
    buffer.extend_from_slice(signature_block);
    push_u32(&mut buffer, checked_u32(public_key.len())?);
    buffer.extend_from_slice(public_key);
    Ok(buffer)
}

fn make_file_digest_chunk(file_digests: &[FileDigest], signer: &PackageSigner) -> Result<Vec<u8>> {
    let mut digest_payload = Vec::new();
    push_u32(&mut digest_payload, SIGNATURE_ALGORITHM_ID);
    for file in file_digests {
        push_u32(&mut digest_payload, crc32fast::hash(file.name.as_bytes()));
        push_u16(&mut digest_payload, checked_u16(file.hash.len())?);
        digest_payload.extend_from_slice(&file.hash);
    }

    let signature = signer.sign(&digest_payload);
    let signature_block = make_signature_block(&signature)?;
    let mut buffer = Vec::with_capacity(4 + digest_payload.len() + signature_block.len());
    push_u32(&mut buffer, checked_u32(digest_payload.len())?);
    buffer.extend_from_slice(&digest_payload);
    buffer.extend_from_slice(&signature_block);
    Ok(buffer)
}

fn make_kv_block(id: u32, value: &[u8]) -> Result<Vec<u8>> {
    let mut buffer = Vec::with_capacity(value.len() + 16);
    push_u32(&mut buffer, checked_u32(value.len() + 8)?);
    push_u32(&mut buffer, 0);
    push_u32(&mut buffer, id);
    push_u32(&mut buffer, checked_u32(value.len())?);
    buffer.extend_from_slice(value);
    Ok(buffer)
}

fn make_sized_block(bytes: &[u8]) -> Result<Vec<u8>> {
    let mut buffer = Vec::with_capacity(bytes.len() + 4);
    push_u32(&mut buffer, checked_u32(bytes.len())?);
    buffer.extend_from_slice(bytes);
    Ok(buffer)
}

fn parse_zip_sections(buffer: &[u8]) -> Result<ZipSections> {
    ensure!(buffer.len() >= 22, "zip 数据长度不足");
    ensure!(
        read_u32(buffer, 0)? == 0x0403_4b50,
        "zip local header magic 不匹配"
    );

    let footer_start = find_eocd(buffer).context("未找到 zip EOCD")?;
    let central_start = read_u32(buffer, footer_start + 16)? as usize;
    ensure!(
        central_start < footer_start,
        "zip central directory offset 无效"
    );
    ensure!(
        read_u32(buffer, central_start)? == 0x0201_4b50,
        "zip central directory magic 不匹配"
    );

    let header_start = read_u32(buffer, central_start + 42)? as usize;
    ensure!(header_start < central_start, "zip local header offset 无效");
    ensure!(
        read_u32(buffer, header_start)? == 0x0403_4b50,
        "zip local file header magic 不匹配"
    );

    Ok(ZipSections {
        header: header_start..central_start,
        central: central_start..footer_start,
        footer: footer_start..buffer.len(),
    })
}

fn find_eocd(buffer: &[u8]) -> Option<usize> {
    (0..=buffer.len().saturating_sub(22))
        .rev()
        .find(|&offset| buffer.get(offset..offset + 4) == Some(&[0x50, 0x4b, 0x05, 0x06]))
}

fn section_digest(bytes: &[u8]) -> Result<Vec<u8>> {
    let len = checked_u32(bytes.len())?;
    let mut hasher = Sha256::new();
    hasher.update([0xa5]);
    hasher.update(len.to_le_bytes());
    hasher.update(bytes);
    Ok(hasher.finalize().to_vec())
}

fn whole_digest(chunks: &[&[u8]]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update([0x5a]);
    hasher.update(3_u32.to_le_bytes());
    for chunk in chunks {
        hasher.update(chunk);
    }
    hasher.finalize().to_vec()
}

fn decode_pem_der(pem: &str) -> Result<Vec<u8>> {
    let body = pem
        .lines()
        .filter(|line| !line.starts_with("-----"))
        .collect::<String>();
    base64::engine::general_purpose::STANDARD
        .decode(body)
        .context("PEM base64 解码失败")
}

fn read_u32(buffer: &[u8], offset: usize) -> Result<u32> {
    let bytes = buffer
        .get(offset..offset + 4)
        .with_context(|| format!("读取 u32 越界：offset={offset}"))?;
    Ok(u32::from_le_bytes(bytes.try_into()?))
}

fn push_u32(buffer: &mut Vec<u8>, value: u32) {
    buffer.extend_from_slice(&value.to_le_bytes());
}

fn push_u16(buffer: &mut Vec<u8>, value: u16) {
    buffer.extend_from_slice(&value.to_le_bytes());
}

fn checked_u32(value: usize) -> Result<u32> {
    u32::try_from(value).context("签名块字段超过 u32 范围")
}

fn checked_u16(value: usize) -> Result<u16> {
    u16::try_from(value).context("签名块字段超过 u16 范围")
}
