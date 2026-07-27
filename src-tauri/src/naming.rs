use std::path::{Path, PathBuf};

pub fn sanitize_filename(value: &str) -> String {
    let sanitized: String = value
        .chars()
        .map(|character| {
            if character.is_control()
                || matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
            {
                '_'
            } else {
                character
            }
        })
        .collect();
    let sanitized = sanitized.trim_end_matches([' ', '.']);

    if sanitized.is_empty() {
        "image".to_owned()
    } else {
        sanitized.to_owned()
    }
}

pub fn default_output_directory(source_path: &Path) -> PathBuf {
    let parent = source_path.parent().unwrap_or_else(|| Path::new("."));
    let stem = source_path
        .file_stem()
        .map(|stem| stem.to_string_lossy())
        .unwrap_or_default();
    parent.join(format!("{}_切图", sanitize_filename(&stem)))
}

pub fn available_output_path(directory: &Path, base_name: &str, index: usize) -> PathBuf {
    let base_name = sanitize_filename(base_name);
    let initial = directory.join(format!("{base_name}_{index:02}.png"));
    if !initial.exists() {
        return initial;
    }

    let mut collision = 2_u64;
    loop {
        let candidate = directory.join(format!("{base_name}_{index:02}_{collision}.png"));
        if !candidate.exists() {
            return candidate;
        }
        collision = collision.saturating_add(1);
    }
}
