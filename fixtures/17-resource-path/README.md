# fixture 17 — resource-path

资源图基线。验证指向项目内资源的静态 `Image.src` 会保留在 Component IR 中，
并通过 `IrDocument.assets` 输出稳定 digest。
