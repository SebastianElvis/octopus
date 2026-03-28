use std::fs;
use std::path::Path;

use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

// ---------------------------------------------------------------------------
// Slash command discovery
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredCommand {
    /// e.g. "/my-command" or "/skill:code-review" or "/mcp__server__prompt"
    pub command: String,
    /// Human-readable description (from frontmatter or first line)
    pub description: String,
    /// "custom" | "personal" | "skill" | "personal_skill"
    pub source: String,
}

/// Extract `description:` from YAML frontmatter between `---` delimiters.
/// Falls back to the first non-empty line of content after frontmatter.
fn extract_frontmatter_description(content: &str) -> Option<String> {
    let content = content.trim_start_matches('\u{feff}'); // strip BOM
    if !content.starts_with("---") {
        // No frontmatter — use first non-empty line
        return content
            .lines()
            .find(|l| !l.trim().is_empty())
            .map(|l| l.trim().trim_start_matches('#').trim().to_string());
    }
    let after_first = &content[3..];
    let end = after_first.find("\n---")?;
    let frontmatter = &after_first[..end];
    for line in frontmatter.lines() {
        let line = line.trim();
        if let Some(rest) = line
            .strip_prefix("description:")
            .or_else(|| line.strip_prefix("Description:"))
        {
            let desc = rest.trim().trim_matches('"').trim_matches('\'').trim();
            if !desc.is_empty() {
                return Some(desc.to_string());
            }
        }
    }
    // Frontmatter exists but no description field — use first content line after frontmatter
    let after_fm = &after_first[end + 4..]; // skip past "\n---"
    after_fm
        .lines()
        .find(|l| !l.trim().is_empty())
        .map(|l| l.trim().trim_start_matches('#').trim().to_string())
}

/// Scan a commands directory for `.md` files and return discovered commands.
/// `prefix` is prepended to the command name (e.g. "slack:" for plugin commands).
fn scan_commands_dir(dir: &Path, source: &str, prefix: &str) -> Vec<DiscoveredCommand> {
    let mut commands = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return commands,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path.extension().and_then(|e| e.to_str());
        if ext != Some("md") {
            continue;
        }
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown");
        let command_name = format!("/{}{}", prefix, stem);
        let description = fs::read_to_string(&path)
            .ok()
            .and_then(|c| extract_frontmatter_description(&c))
            .unwrap_or_else(|| format!("Custom command: {}", stem));
        commands.push(DiscoveredCommand {
            command: command_name,
            description,
            source: source.to_string(),
        });
    }
    commands
}

/// Scan a skills directory (e.g. `.claude/skills/`) for `SKILL.md` inside each subdirectory.
/// `prefix` is prepended to the command name (e.g. "slack:" for plugin skills).
fn scan_skills_dir(dir: &Path, source: &str, prefix: &str) -> Vec<DiscoveredCommand> {
    let mut commands = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return commands,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let skill_md = path.join("SKILL.md");
        if !skill_md.is_file() {
            continue;
        }
        let skill_name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown");
        let description = fs::read_to_string(&skill_md)
            .ok()
            .and_then(|c| extract_frontmatter_description(&c))
            .unwrap_or_else(|| format!("Skill: {}", skill_name));
        commands.push(DiscoveredCommand {
            command: format!("/{}{}", prefix, skill_name),
            description,
            source: source.to_string(),
        });
    }
    commands
}

/// Scan marketplace skill directories for available skills.
/// Marketplaces live at `~/.claude/plugins/marketplaces/{marketplace}/skills/*/SKILL.md`.
fn scan_marketplace_skills(home: &Path) -> Vec<DiscoveredCommand> {
    let mut commands = Vec::new();
    let marketplaces_dir = home.join(".claude").join("plugins").join("marketplaces");
    let entries = match fs::read_dir(&marketplaces_dir) {
        Ok(e) => e,
        Err(_) => return commands,
    };
    for mkt_entry in entries.flatten() {
        let mkt_path = mkt_entry.path();
        if !mkt_path.is_dir() {
            continue;
        }
        let skills_dir = mkt_path.join("skills");
        if !skills_dir.is_dir() {
            continue;
        }
        // Scan each skill subdirectory
        let skill_entries = match fs::read_dir(&skills_dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for skill_entry in skill_entries.flatten() {
            let skill_path = skill_entry.path();
            if !skill_path.is_dir() {
                continue;
            }
            let skill_md = skill_path.join("SKILL.md");
            if !skill_md.is_file() {
                continue;
            }
            let skill_name = skill_path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown");
            let description = fs::read_to_string(&skill_md)
                .ok()
                .and_then(|c| extract_frontmatter_description(&c))
                .unwrap_or_else(|| format!("Skill: {}", skill_name));
            commands.push(DiscoveredCommand {
                command: format!("/{}", skill_name),
                description,
                source: "marketplace_skill".to_string(),
            });
        }
    }
    commands
}

/// Read `.mcp.json` files from project, home, and installed plugins to discover
/// MCP server names.
fn scan_mcp_servers(home: &Path, worktree_path: Option<&str>) -> Vec<DiscoveredCommand> {
    let mut commands = Vec::new();
    let mut seen = std::collections::HashSet::new();

    let mut mcp_files: Vec<std::path::PathBuf> = Vec::new();

    // Project-level .mcp.json
    if let Some(wt) = worktree_path {
        mcp_files.push(Path::new(wt).join(".mcp.json"));
    }

    // Global ~/.claude/.mcp.json
    mcp_files.push(home.join(".claude").join(".mcp.json"));

    // Installed plugin .mcp.json files
    let settings_path = home.join(".claude").join("settings.json");
    if let Ok(content) = fs::read_to_string(&settings_path) {
        if let Ok(settings) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(enabled) = settings.get("enabledPlugins").and_then(|v| v.as_object()) {
                let installed_path = home
                    .join(".claude")
                    .join("plugins")
                    .join("installed_plugins.json");
                if let Ok(inst_content) = fs::read_to_string(&installed_path) {
                    if let Ok(installed) = serde_json::from_str::<serde_json::Value>(&inst_content)
                    {
                        if let Some(plugins) = installed.get("plugins").and_then(|v| v.as_object())
                        {
                            for (key, is_enabled) in enabled {
                                if !is_enabled.as_bool().unwrap_or(false) || !key.contains('@') {
                                    continue;
                                }
                                if let Some(path_str) = plugins
                                    .get(key)
                                    .and_then(|v| v.as_array())
                                    .and_then(|arr| arr.first())
                                    .and_then(|entry| entry.get("installPath"))
                                    .and_then(|v| v.as_str())
                                {
                                    mcp_files.push(Path::new(path_str).join(".mcp.json"));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Parse each .mcp.json and extract server names
    for mcp_file in mcp_files {
        let content = match fs::read_to_string(&mcp_file) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let json: serde_json::Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if let Some(servers) = json.get("mcpServers").and_then(|v| v.as_object()) {
            for server_name in servers.keys() {
                if seen.insert(server_name.clone()) {
                    commands.push(DiscoveredCommand {
                        command: format!("/mcp__{}", server_name),
                        description: format!("MCP server: {}", server_name),
                        source: "mcp".to_string(),
                    });
                }
            }
        }
    }

    commands
}

/// Read enabled plugins from settings.json and scan each plugin's install path
/// for commands and skills.
fn scan_installed_plugins(home: &Path) -> Vec<DiscoveredCommand> {
    let mut all = Vec::new();

    // Read settings.json to get enabledPlugins
    let settings_path = home.join(".claude").join("settings.json");
    let settings_content = match fs::read_to_string(&settings_path) {
        Ok(c) => c,
        Err(_) => return all,
    };
    let settings: serde_json::Value = match serde_json::from_str(&settings_content) {
        Ok(v) => v,
        Err(_) => return all,
    };
    let enabled = match settings.get("enabledPlugins").and_then(|v| v.as_object()) {
        Some(m) => m,
        None => return all,
    };

    // Read installed_plugins.json to get install paths
    let installed_path = home
        .join(".claude")
        .join("plugins")
        .join("installed_plugins.json");
    let installed_content = match fs::read_to_string(&installed_path) {
        Ok(c) => c,
        Err(_) => return all,
    };
    let installed: serde_json::Value = match serde_json::from_str(&installed_content) {
        Ok(v) => v,
        Err(_) => return all,
    };
    let plugins = match installed.get("plugins").and_then(|v| v.as_object()) {
        Some(m) => m,
        None => return all,
    };

    for (plugin_key, is_enabled) in enabled {
        // Skip non-plugin settings (e.g. gitAttribution, includeCoAuthoredBy)
        if !is_enabled.as_bool().unwrap_or(false) {
            continue;
        }
        if !plugin_key.contains('@') {
            continue;
        }

        // Extract plugin name (before @)
        let plugin_name = plugin_key.split('@').next().unwrap_or(plugin_key);

        // Find the install path from installed_plugins.json
        let install_path = plugins
            .get(plugin_key)
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .and_then(|entry| entry.get("installPath"))
            .and_then(|v| v.as_str());

        if let Some(path_str) = install_path {
            let plugin_dir = Path::new(path_str);
            let prefix = format!("{}:", plugin_name);

            // Scan plugin commands: {installPath}/commands/*.md
            let cmds_dir = plugin_dir.join("commands");
            all.extend(scan_commands_dir(&cmds_dir, "plugin", &prefix));

            // Scan plugin skills: {installPath}/skills/*/SKILL.md
            let skills_dir = plugin_dir.join("skills");
            all.extend(scan_skills_dir(&skills_dir, "plugin_skill", &prefix));
        }
    }

    all
}

/// Discover all available slash commands from the filesystem.
///
/// Scans:
/// - Project custom commands: `{worktree}/.claude/commands/*.md`
/// - Project skills: `{worktree}/.claude/skills/*/SKILL.md`
/// - Personal custom commands: `~/.claude/commands/*.md`
/// - Personal skills: `~/.claude/skills/*/SKILL.md`
/// - Installed plugin commands and skills (from `~/.claude/plugins/`)
/// - Marketplace skills (from `~/.claude/plugins/marketplaces/*/skills/`)
/// - MCP servers (from `.mcp.json` files)
#[tauri::command]
pub async fn scan_slash_commands(
    worktree_path: Option<String>,
) -> AppResult<Vec<DiscoveredCommand>> {
    let mut all = Vec::new();

    // Project-level custom commands: {worktree}/.claude/commands/*.md
    if let Some(ref wt) = worktree_path {
        let project_cmds = Path::new(wt).join(".claude").join("commands");
        all.extend(scan_commands_dir(&project_cmds, "custom", ""));

        let project_skills = Path::new(wt).join(".claude").join("skills");
        all.extend(scan_skills_dir(&project_skills, "skill", ""));
    }

    // Personal custom commands and skills, installed plugins, marketplace skills, MCP servers
    if let Some(home) = dirs::home_dir() {
        let personal_cmds = home.join(".claude").join("commands");
        all.extend(scan_commands_dir(&personal_cmds, "personal", ""));

        let personal_skills = home.join(".claude").join("skills");
        all.extend(scan_skills_dir(&personal_skills, "personal_skill", ""));

        // Installed plugins (reads settings.json + installed_plugins.json)
        all.extend(scan_installed_plugins(&home));

        // Marketplace skills (auto-discovered from marketplace directories)
        all.extend(scan_marketplace_skills(&home));

        // MCP servers (from .mcp.json files)
        all.extend(scan_mcp_servers(&home, worktree_path.as_deref()));
    }

    // Deduplicate by command name (keep first occurrence — more specific sources first)
    let mut seen = std::collections::HashSet::new();
    all.retain(|cmd| seen.insert(cmd.command.clone()));

    Ok(all)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub extension: Option<String>,
}

/// List directory contents, respecting .gitignore.
/// Returns immediate children only (lazy tree loading).
/// Sorted: directories first, then alphabetical.
#[tauri::command]
pub async fn list_dir(path: String) -> AppResult<Vec<FileEntry>> {
    let dir_path = Path::new(&path);
    if !dir_path.is_dir() {
        return Err(AppError::Custom(format!("Not a directory: {}", path)));
    }

    let mut entries: Vec<FileEntry> = Vec::new();

    let walker = WalkBuilder::new(&path)
        .max_depth(Some(1))
        .hidden(false) // show dotfiles at top level
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .build();

    for result in walker {
        let entry = match result {
            Ok(e) => e,
            Err(_) => continue,
        };

        // Skip the root directory itself
        if entry.path() == dir_path {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let name = entry.file_name().to_string_lossy().to_string();

        // Skip .git directory
        if name == ".git" {
            continue;
        }

        let file_path = entry.path().to_string_lossy().to_string();
        let is_dir = metadata.is_dir();
        let size = if is_dir { 0 } else { metadata.len() };
        let extension = if is_dir {
            None
        } else {
            entry
                .path()
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_string())
        };

        entries.push(FileEntry {
            name,
            path: file_path,
            is_dir,
            size,
            extension,
        });
    }

    // Sort: directories first, then alphabetical (case-insensitive)
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

/// Read file contents as a string.
/// Rejects files > 5MB or binary files (null bytes in first 8KB).
#[tauri::command]
pub async fn read_file(path: String) -> AppResult<String> {
    let file_path = Path::new(&path);

    if !file_path.is_file() {
        return Err(AppError::Custom(format!("Not a file: {}", path)));
    }

    let metadata = fs::metadata(&path)?;
    let size = metadata.len();

    if size > 5 * 1024 * 1024 {
        return Err(AppError::Custom(format!(
            "File too large ({} bytes). Maximum is 5MB.",
            size
        )));
    }

    // Read first 8KB for binary detection
    let content = fs::read(&path)?;

    let check_len = std::cmp::min(content.len(), 8192);
    if content[..check_len].contains(&0u8) {
        return Err(AppError::Custom(
            "Binary file — cannot display.".to_string(),
        ));
    }

    String::from_utf8(content).map_err(|_| AppError::Custom("File is not valid UTF-8.".to_string()))
}

/// Save base64-encoded image data to a temp file and return the path.
/// Used by the frontend to pass images to Claude CLI via --image flag.
#[tauri::command]
pub async fn save_temp_image(data: String, filename: String) -> AppResult<String> {
    use base64::Engine;

    let tmp_dir = std::env::temp_dir().join("toomanytabs-images");
    fs::create_dir_all(&tmp_dir)
        .map_err(|e| AppError::Custom(format!("failed to create temp dir: {}", e)))?;

    // Sanitize filename to prevent path traversal
    let safe_name = Path::new(&filename)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("image.png");
    let unique_name = format!(
        "{}-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
        safe_name
    );
    let dest = tmp_dir.join(&unique_name);

    // Strip data URL prefix if present (e.g., "data:image/png;base64,...")
    let b64 = if let Some(idx) = data.find(",") {
        &data[idx + 1..]
    } else {
        &data
    };

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| AppError::Custom(format!("invalid base64: {}", e)))?;

    fs::write(&dest, &bytes)
        .map_err(|e| AppError::Custom(format!("failed to write image: {}", e)))?;

    dest.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::Custom("non-UTF-8 temp path".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[tokio::test]
    async fn list_dir_returns_entries() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("hello.txt"), "world").unwrap();
        fs::create_dir(dir.path().join("subdir")).unwrap();

        let entries = list_dir(dir.path().to_string_lossy().to_string())
            .await
            .unwrap();

        assert!(entries.len() >= 2);
        // Directories should come first
        assert!(entries[0].is_dir);
        assert_eq!(entries[0].name, "subdir");
    }

    #[tokio::test]
    async fn read_file_works() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("test.txt");
        fs::write(&file, "hello world").unwrap();

        let content = read_file(file.to_string_lossy().to_string()).await.unwrap();
        assert_eq!(content, "hello world");
    }

    #[tokio::test]
    async fn read_file_rejects_binary() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("binary.bin");
        fs::write(&file, b"\x00\x01\x02\x03").unwrap();

        let result = read_file(file.to_string_lossy().to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn list_dir_empty_directory() {
        let dir = tempdir().unwrap();
        let entries = list_dir(dir.path().to_string_lossy().to_string())
            .await
            .unwrap();
        assert!(entries.is_empty());
    }

    #[tokio::test]
    async fn list_dir_sorts_dirs_before_files() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("z_file.txt"), "content").unwrap();
        fs::create_dir(dir.path().join("a_dir")).unwrap();
        fs::write(dir.path().join("a_file.txt"), "content").unwrap();

        let entries = list_dir(dir.path().to_string_lossy().to_string())
            .await
            .unwrap();

        // First entry should be a directory
        assert!(entries[0].is_dir, "first entry should be directory");
        assert_eq!(entries[0].name, "a_dir");

        // Files should be sorted alphabetically after dirs
        let file_names: Vec<&str> = entries
            .iter()
            .filter(|e| !e.is_dir)
            .map(|e| e.name.as_str())
            .collect();
        assert_eq!(file_names, vec!["a_file.txt", "z_file.txt"]);
    }

    #[tokio::test]
    async fn list_dir_includes_extensions() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("code.rs"), "fn main() {}").unwrap();
        fs::write(dir.path().join("data.json"), "{}").unwrap();
        fs::write(dir.path().join("no_ext"), "data").unwrap();

        let entries = list_dir(dir.path().to_string_lossy().to_string())
            .await
            .unwrap();

        let rs_file = entries.iter().find(|e| e.name == "code.rs").unwrap();
        assert_eq!(rs_file.extension, Some("rs".to_string()));

        let json_file = entries.iter().find(|e| e.name == "data.json").unwrap();
        assert_eq!(json_file.extension, Some("json".to_string()));

        let no_ext = entries.iter().find(|e| e.name == "no_ext").unwrap();
        assert_eq!(no_ext.extension, None);
    }

    #[tokio::test]
    async fn list_dir_reports_file_size() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("file.txt"), "12345").unwrap();
        fs::create_dir(dir.path().join("subdir")).unwrap();

        let entries = list_dir(dir.path().to_string_lossy().to_string())
            .await
            .unwrap();

        let file = entries.iter().find(|e| e.name == "file.txt").unwrap();
        assert_eq!(file.size, 5);

        let subdir = entries.iter().find(|e| e.name == "subdir").unwrap();
        assert_eq!(subdir.size, 0); // dirs report size 0
    }

    #[tokio::test]
    async fn read_file_nonexistent_returns_error() {
        let result = read_file("/tmp/totally_nonexistent_file_xyz.txt".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn read_file_directory_returns_error() {
        let dir = tempdir().unwrap();
        let result = read_file(dir.path().to_string_lossy().to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn list_dir_excludes_git_directory() {
        let dir = tempdir().unwrap();
        // Simulate a .git directory
        fs::create_dir(dir.path().join(".git")).unwrap();
        fs::write(dir.path().join("file.txt"), "content").unwrap();

        let entries = list_dir(dir.path().to_string_lossy().to_string())
            .await
            .unwrap();

        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert!(!names.contains(&".git"));
        assert!(names.contains(&"file.txt"));
    }

    #[test]
    fn file_entry_serializes_to_camel_case() {
        let entry = FileEntry {
            name: "test.rs".to_string(),
            path: "/tmp/test.rs".to_string(),
            is_dir: false,
            size: 100,
            extension: Some("rs".to_string()),
        };
        let json = serde_json::to_value(&entry).unwrap();
        assert!(json.get("isDir").is_some());
        assert!(json.get("is_dir").is_none());
    }

    // ── Slash command discovery tests ──────────────────────────────────────

    #[test]
    fn extract_description_from_frontmatter() {
        let content = "---\ndescription: Fix all the bugs\nallowed-tools: [Read, Write]\n---\n\n# Body\nSome content";
        assert_eq!(
            extract_frontmatter_description(content),
            Some("Fix all the bugs".to_string())
        );
    }

    #[test]
    fn extract_description_with_quotes() {
        let content = "---\ndescription: \"Quoted description\"\n---\nBody";
        assert_eq!(
            extract_frontmatter_description(content),
            Some("Quoted description".to_string())
        );
    }

    #[test]
    fn extract_description_falls_back_to_first_line() {
        let content = "# My Command\n\nDoes something cool";
        assert_eq!(
            extract_frontmatter_description(content),
            Some("My Command".to_string())
        );
    }

    #[test]
    fn extract_description_no_desc_in_frontmatter_uses_body() {
        let content = "---\nallowed-tools: [Read]\n---\n\nActual body text here";
        assert_eq!(
            extract_frontmatter_description(content),
            Some("Actual body text here".to_string())
        );
    }

    #[test]
    fn extract_description_empty_content() {
        assert_eq!(extract_frontmatter_description(""), None);
    }

    #[tokio::test]
    async fn scan_commands_dir_finds_md_files() {
        let dir = tempdir().unwrap();
        let cmds = dir.path().join(".claude").join("commands");
        fs::create_dir_all(&cmds).unwrap();
        fs::write(
            cmds.join("fix-bug.md"),
            "---\ndescription: Fix a specific bug\n---\nContent",
        )
        .unwrap();
        fs::write(cmds.join("deploy.md"), "# Deploy to production\nSteps...").unwrap();
        // Non-md file should be ignored
        fs::write(cmds.join("notes.txt"), "not a command").unwrap();

        let results = scan_commands_dir(&cmds, "custom", "");
        assert_eq!(results.len(), 2);

        let fix = results.iter().find(|c| c.command == "/fix-bug").unwrap();
        assert_eq!(fix.description, "Fix a specific bug");
        assert_eq!(fix.source, "custom");

        let deploy = results.iter().find(|c| c.command == "/deploy").unwrap();
        assert_eq!(deploy.description, "Deploy to production");
    }

    #[tokio::test]
    async fn scan_commands_dir_with_prefix() {
        let dir = tempdir().unwrap();
        fs::create_dir_all(&dir.path()).unwrap();
        fs::write(
            dir.path().join("standup.md"),
            "---\ndescription: Generate standup\n---\n",
        )
        .unwrap();

        let results = scan_commands_dir(dir.path(), "plugin", "slack:");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].command, "/slack:standup");
        assert_eq!(results[0].description, "Generate standup");
        assert_eq!(results[0].source, "plugin");
    }

    #[tokio::test]
    async fn scan_skills_dir_finds_skill_md() {
        let dir = tempdir().unwrap();
        let skills = dir.path().join(".claude").join("skills");
        let skill1 = skills.join("code-review");
        fs::create_dir_all(&skill1).unwrap();
        fs::write(
            skill1.join("SKILL.md"),
            "---\ndescription: Review code quality\n---\nInstructions",
        )
        .unwrap();

        // Skill without SKILL.md should be ignored
        let skill2 = skills.join("no-skill");
        fs::create_dir_all(&skill2).unwrap();
        fs::write(skill2.join("README.md"), "Not a skill").unwrap();

        let results = scan_skills_dir(&skills, "skill", "");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].command, "/code-review");
        assert_eq!(results[0].description, "Review code quality");
        assert_eq!(results[0].source, "skill");
    }

    #[tokio::test]
    async fn scan_skills_dir_with_prefix() {
        let dir = tempdir().unwrap();
        let skill = dir.path().join("slack-messaging");
        fs::create_dir_all(&skill).unwrap();
        fs::write(
            skill.join("SKILL.md"),
            "---\ndescription: Slack messaging guidance\n---\n",
        )
        .unwrap();

        let results = scan_skills_dir(dir.path(), "plugin_skill", "slack:");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].command, "/slack:slack-messaging");
        assert_eq!(results[0].source, "plugin_skill");
    }

    #[test]
    fn scan_installed_plugins_full() {
        let dir = tempdir().unwrap();
        let home = dir.path();

        // Create settings.json with an enabled plugin
        let claude_dir = home.join(".claude");
        fs::create_dir_all(&claude_dir).unwrap();
        fs::write(
            claude_dir.join("settings.json"),
            r#"{"enabledPlugins":{"my-plugin@test-marketplace":true,"disabled-plugin@test-marketplace":false}}"#,
        )
        .unwrap();

        // Create installed_plugins.json
        let plugins_dir = claude_dir.join("plugins");
        fs::create_dir_all(&plugins_dir).unwrap();
        let install_path = plugins_dir
            .join("cache")
            .join("test-marketplace")
            .join("my-plugin")
            .join("1.0.0");
        fs::create_dir_all(&install_path).unwrap();

        let installed_json = format!(
            r#"{{"version":2,"plugins":{{"my-plugin@test-marketplace":[{{"scope":"user","installPath":"{}"}}]}}}}"#,
            install_path.to_string_lossy().replace('\\', "\\\\")
        );
        fs::write(plugins_dir.join("installed_plugins.json"), installed_json).unwrap();

        // Create plugin commands
        let cmds = install_path.join("commands");
        fs::create_dir_all(&cmds).unwrap();
        fs::write(cmds.join("hello.md"), "---\ndescription: Say hello\n---\n").unwrap();

        // Create plugin skills
        let skills = install_path.join("skills");
        let skill_dir = skills.join("greeting");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            "---\ndescription: Greeting skill\n---\n",
        )
        .unwrap();

        let results = scan_installed_plugins(home);

        let cmd = results.iter().find(|c| c.command == "/my-plugin:hello");
        assert!(cmd.is_some(), "Should find plugin command");
        assert_eq!(cmd.unwrap().description, "Say hello");
        assert_eq!(cmd.unwrap().source, "plugin");

        let skill = results.iter().find(|c| c.command == "/my-plugin:greeting");
        assert!(skill.is_some(), "Should find plugin skill");
        assert_eq!(skill.unwrap().description, "Greeting skill");
        assert_eq!(skill.unwrap().source, "plugin_skill");
    }

    #[test]
    fn scan_installed_plugins_skips_disabled() {
        let dir = tempdir().unwrap();
        let home = dir.path();

        let claude_dir = home.join(".claude");
        fs::create_dir_all(&claude_dir).unwrap();
        fs::write(
            claude_dir.join("settings.json"),
            r#"{"enabledPlugins":{"my-plugin@market":false}}"#,
        )
        .unwrap();

        let plugins_dir = claude_dir.join("plugins");
        fs::create_dir_all(&plugins_dir).unwrap();
        fs::write(
            plugins_dir.join("installed_plugins.json"),
            r#"{"version":2,"plugins":{}}"#,
        )
        .unwrap();

        let results = scan_installed_plugins(home);
        assert!(results.is_empty());
    }

    #[test]
    fn scan_installed_plugins_no_settings() {
        let dir = tempdir().unwrap();
        let results = scan_installed_plugins(dir.path());
        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn scan_slash_commands_with_worktree() {
        let dir = tempdir().unwrap();
        let cmds = dir.path().join(".claude").join("commands");
        fs::create_dir_all(&cmds).unwrap();
        fs::write(
            cmds.join("my-cmd.md"),
            "---\ndescription: My custom command\n---\n",
        )
        .unwrap();

        let results = scan_slash_commands(Some(dir.path().to_string_lossy().to_string()))
            .await
            .unwrap();

        let found = results.iter().find(|c| c.command == "/my-cmd");
        assert!(found.is_some());
        assert_eq!(found.unwrap().source, "custom");
    }

    #[tokio::test]
    async fn scan_slash_commands_no_worktree() {
        // Should still work (scans personal commands + plugins)
        let results = scan_slash_commands(None).await.unwrap();
        // Just verify it doesn't error — personal commands depend on the test machine
        let _ = results;
    }

    #[test]
    fn scan_marketplace_skills_finds_skills() {
        let dir = tempdir().unwrap();
        let home = dir.path();

        // Create marketplace structure
        let mkt_skills = home
            .join(".claude")
            .join("plugins")
            .join("marketplaces")
            .join("test-marketplace")
            .join("skills");

        let skill1 = mkt_skills.join("my-skill");
        fs::create_dir_all(&skill1).unwrap();
        fs::write(
            skill1.join("SKILL.md"),
            "---\ndescription: A marketplace skill\n---\n",
        )
        .unwrap();

        // Skill without SKILL.md should be ignored
        let skill2 = mkt_skills.join("incomplete");
        fs::create_dir_all(&skill2).unwrap();
        fs::write(skill2.join("README.md"), "Not a skill").unwrap();

        let results = scan_marketplace_skills(home);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].command, "/my-skill");
        assert_eq!(results[0].description, "A marketplace skill");
        assert_eq!(results[0].source, "marketplace_skill");
    }

    #[test]
    fn scan_marketplace_skills_no_marketplaces() {
        let dir = tempdir().unwrap();
        let results = scan_marketplace_skills(dir.path());
        assert!(results.is_empty());
    }

    #[test]
    fn scan_mcp_servers_from_project() {
        let dir = tempdir().unwrap();
        let home = dir.path();
        let worktree = dir.path().join("project");
        fs::create_dir_all(&worktree).unwrap();

        // Create project .mcp.json
        fs::write(
            worktree.join(".mcp.json"),
            r#"{"mcpServers":{"my-db":{"command":"npx","args":["-y","db-mcp"]},"my-api":{"url":"http://localhost:3000"}}}"#,
        )
        .unwrap();

        let results = scan_mcp_servers(home, Some(worktree.to_str().unwrap()));
        assert_eq!(results.len(), 2);

        let db = results.iter().find(|c| c.command == "/mcp__my-db");
        assert!(db.is_some());
        assert_eq!(db.unwrap().source, "mcp");

        let api = results.iter().find(|c| c.command == "/mcp__my-api");
        assert!(api.is_some());
    }

    #[test]
    fn scan_mcp_servers_deduplicates() {
        let dir = tempdir().unwrap();
        let home = dir.path();
        let worktree = dir.path().join("project");
        fs::create_dir_all(&worktree).unwrap();

        // Same server in project and global
        fs::write(
            worktree.join(".mcp.json"),
            r#"{"mcpServers":{"shared":{"command":"cmd"}}}"#,
        )
        .unwrap();

        let claude_dir = home.join(".claude");
        fs::create_dir_all(&claude_dir).unwrap();
        fs::write(
            claude_dir.join(".mcp.json"),
            r#"{"mcpServers":{"shared":{"command":"cmd"},"global-only":{"command":"cmd2"}}}"#,
        )
        .unwrap();

        let results = scan_mcp_servers(home, Some(worktree.to_str().unwrap()));
        assert_eq!(results.len(), 2); // shared (deduped) + global-only

        let names: Vec<&str> = results.iter().map(|c| c.command.as_str()).collect();
        assert!(names.contains(&"/mcp__shared"));
        assert!(names.contains(&"/mcp__global-only"));
    }

    #[test]
    fn scan_mcp_servers_no_files() {
        let dir = tempdir().unwrap();
        let results = scan_mcp_servers(dir.path(), None);
        assert!(results.is_empty());
    }

    #[test]
    fn discovered_command_serializes_to_camel_case() {
        let cmd = DiscoveredCommand {
            command: "/test".to_string(),
            description: "Test command".to_string(),
            source: "custom".to_string(),
        };
        let json = serde_json::to_value(&cmd).unwrap();
        assert!(json.get("command").is_some());
        assert!(json.get("description").is_some());
        assert!(json.get("source").is_some());
    }
}
