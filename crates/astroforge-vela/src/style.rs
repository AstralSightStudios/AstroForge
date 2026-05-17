use indexmap::IndexMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BorderShorthand {
    pub width: String,
    pub style: String,
    pub color: String,
}

pub(crate) fn expand_border_shorthand(value: &str) -> Option<BorderShorthand> {
    let value = strip_wrapping_quotes(value.trim());
    let tokens = tokenize_css_value(value);
    if tokens.len() < 3 {
        return None;
    }

    let mut width = None;
    let mut style = None;
    let mut color = Vec::new();

    for token in tokens {
        let lower = token.to_ascii_lowercase();
        if style.is_none() && is_border_style(&lower) {
            style = Some(token);
        } else if width.is_none() && is_border_width(&lower) {
            width = Some(token);
        } else {
            color.push(token);
        }
    }

    Some(BorderShorthand {
        width: width?,
        style: style?,
        color: (!color.is_empty()).then(|| color.join(" "))?,
    })
}

pub(crate) fn insert_border_declarations(
    out: &mut IndexMap<String, String>,
    border: &BorderShorthand,
) {
    out.insert("borderTopColor".into(), border.color.clone());
    out.insert("borderRightColor".into(), border.color.clone());
    out.insert("borderBottomColor".into(), border.color.clone());
    out.insert("borderLeftColor".into(), border.color.clone());
    out.insert("borderStyle".into(), border.style.clone());
    out.insert("borderTopWidth".into(), border.width.clone());
    out.insert("borderRightWidth".into(), border.width.clone());
    out.insert("borderBottomWidth".into(), border.width.clone());
    out.insert("borderLeftWidth".into(), border.width.clone());
}

fn strip_wrapping_quotes(value: &str) -> &str {
    if value.len() < 2 {
        return value;
    }
    let bytes = value.as_bytes();
    if (bytes[0] == b'"' && bytes[value.len() - 1] == b'"')
        || (bytes[0] == b'\'' && bytes[value.len() - 1] == b'\'')
    {
        &value[1..value.len() - 1]
    } else {
        value
    }
}

fn tokenize_css_value(value: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut depth = 0usize;
    let mut quote = None;

    for ch in value.chars() {
        if let Some(quote_ch) = quote {
            current.push(ch);
            if ch == quote_ch {
                quote = None;
            }
            continue;
        }

        match ch {
            '"' | '\'' => {
                quote = Some(ch);
                current.push(ch);
            }
            '(' => {
                depth += 1;
                current.push(ch);
            }
            ')' => {
                depth = depth.saturating_sub(1);
                current.push(ch);
            }
            ch if ch.is_whitespace() && depth == 0 => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(ch),
        }
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
}

fn is_border_style(value: &str) -> bool {
    matches!(
        value,
        "none"
            | "hidden"
            | "dotted"
            | "dashed"
            | "solid"
            | "double"
            | "groove"
            | "ridge"
            | "inset"
            | "outset"
    )
}

fn is_border_width(value: &str) -> bool {
    matches!(value, "thin" | "medium" | "thick")
        || value.ends_with("px")
        || value.ends_with("rpx")
        || value.ends_with("vp")
        || value.ends_with("rem")
        || value.ends_with("em")
        || value.ends_with('%')
        || value.parse::<f64>().is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expands_border_with_rgba_color() {
        let border = expand_border_shorthand("4px solid rgba(255, 255, 255, 0.06)").unwrap();
        assert_eq!(
            border,
            BorderShorthand {
                width: "4px".into(),
                style: "solid".into(),
                color: "rgba(255, 255, 255, 0.06)".into(),
            }
        );
    }
}
