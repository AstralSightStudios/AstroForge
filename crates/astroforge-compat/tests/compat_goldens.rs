//! 端到端 fixture 兼容性回归测试。
//!
//! 对所有 `fixtures/<NN>-name/` 目录下提交的 `golden/aiot/summary.json` 与
//! `golden/astroforge/summary.json` 做三级 diff（files / manifest /
//! runtime_calls）。容器层 rpk_structure 留给 CLI `--official` 子命令在带
//! aiot-toolkit 的环境中执行，因为 RPK zip footer 字段（时间戳 / 压缩偏移）
//! 不适合作为离线 golden 写死。
//!
//! 若 fixture 缺失任一侧 summary，则测试跳过该 fixture 并显式 panic 报告，
//! 防止误删 golden 后 CI 静默通过。

use std::fs;

use camino::{Utf8Path, Utf8PathBuf};

use astroforge_compat::runner::{SummaryComparison, compare_summaries_only};

#[test]
fn all_fixtures_have_zero_summary_diffs() {
    let fixtures_root = workspace_root().join("fixtures");
    let fixtures = discover_fixtures(&fixtures_root);
    assert!(!fixtures.is_empty(), "未发现任何 fixture：{fixtures_root}");

    let mut failures = Vec::new();
    for fixture in &fixtures {
        let name = fixture
            .file_name()
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| fixture.to_string());
        let astroforge_summary = fixture.join("golden/astroforge/summary.json");
        let aiot_summary = fixture.join("golden/aiot/summary.json");

        if !astroforge_summary.exists() || !aiot_summary.exists() {
            failures.push(format!(
                "{name}: 双侧 golden summary 缺失 (astroforge={}, aiot={})",
                astroforge_summary.exists(),
                aiot_summary.exists()
            ));
            continue;
        }

        let comparison: SummaryComparison = compare_summaries_only(fixture)
            .unwrap_or_else(|err| panic!("{name}: compare_summaries_only 失败：{err:?}"));

        if comparison.files.diff_count > 0 {
            failures.push(format!(
                "{name}: files diff ({}): {:?}",
                comparison.files.diff_count, comparison.files.samples
            ));
        }
        if comparison.manifest.diff_count > 0 {
            failures.push(format!(
                "{name}: manifest diff ({}): {:?}",
                comparison.manifest.diff_count, comparison.manifest.samples
            ));
        }
        if comparison.runtime_calls.diff_count > 0 {
            failures.push(format!(
                "{name}: runtime_calls diff ({}): {:?}",
                comparison.runtime_calls.diff_count, comparison.runtime_calls.samples
            ));
        }
    }

    assert!(
        failures.is_empty(),
        "兼容性回归（共 {} 处差异）：\n  - {}",
        failures.len(),
        failures.join("\n  - ")
    );
}

fn workspace_root() -> Utf8PathBuf {
    let manifest_dir = Utf8PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .and_then(|p| p.parent())
        .map(ToOwned::to_owned)
        .unwrap_or(manifest_dir)
}

fn discover_fixtures(root: &Utf8Path) -> Vec<Utf8PathBuf> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(root) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = match Utf8PathBuf::from_path_buf(entry.path()) {
            Ok(path) => path,
            Err(_) => continue,
        };
        if path.is_dir() && path.join("astroforge/src/pages").exists() {
            out.push(path);
        }
    }
    out.sort();
    out
}
