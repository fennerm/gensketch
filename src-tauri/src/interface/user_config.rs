use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub struct NucleotideColorConfig {
    pub a: u32,
    pub g: u32,
    pub c: u32,
    pub t: u32,
    pub n: u32,
    pub r: u32,
    pub y: u32,
    pub k: u32,
    pub m: u32,
    pub s: u32,
    pub w: u32,
    pub b: u32,
    pub d: u32,
    pub h: u32,
    pub v: u32,
    pub gap: u32, // '-' IUPAC code
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColorConfig {
    pub alignment: u32,
    pub background: u32,
    pub deletion: u32,
    pub error: u32,
    pub error_background: u32,
    pub foreground: u32,
    pub light_foreground: u32,
    pub insertion: u32,
    pub nucleotide_colors: NucleotideColorConfig,
    pub secondary_text: u32,
    pub track_label_background: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FontConfig {
    pub tooltip_font_size: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleConfig {
    pub colors: ColorConfig,
    pub fonts: FontConfig,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneralConfig {
    /// Maximum length genomic region for which individual alignments are rendered in the GUI.
    pub max_render_window: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserConfig {
    pub styles: StyleConfig,
    pub general: GeneralConfig,
}

/// Parse a hex code string to its u32 representation
fn parse_hex(hex_string: &str) -> Result<u32> {
    let hex_string = hex_string.trim_start_matches("0x").trim_start_matches("#");
    u32::from_str_radix(hex_string, 16)
        .with_context(|| format!("{} is not a valid hex code", hex_string))
}

/// Read the user's config file
pub fn read_user_config() -> Result<UserConfig> {
    // TODO Read from JSON file
    let config = UserConfig {
        general: GeneralConfig { max_render_window: 10000 },
        styles: StyleConfig {
            fonts: FontConfig { tooltip_font_size: 12 },
            colors: ColorConfig {
                alignment: parse_hex("#969592")?,
                background: parse_hex("#f2f2f2")?,
                error: parse_hex("#e63519")?,
                error_background: parse_hex("#f7c2ba")?,
                foreground: parse_hex("#222222")?,
                light_foreground: parse_hex("#bfbfbf")?,
                track_label_background: parse_hex("#243f47")?,
                secondary_text: parse_hex("#f2f2f2")?,
                nucleotide_colors: NucleotideColorConfig {
                    a: parse_hex("#ff0000")?,
                    g: parse_hex("00ff00")?,
                    c: parse_hex("#0000ff")?,
                    t: parse_hex("#a020f0")?,
                    n: parse_hex("808080")?,
                    r: parse_hex("808080")?,
                    y: parse_hex("808080")?,
                    k: parse_hex("808080")?,
                    m: parse_hex("808080")?,
                    s: parse_hex("808080")?,
                    w: parse_hex("808080")?,
                    b: parse_hex("808080")?,
                    d: parse_hex("808080")?,
                    h: parse_hex("808080")?,
                    v: parse_hex("808080")?,
                    gap: parse_hex("808080")?,
                },
                deletion: parse_hex("#222222")?,
                insertion: parse_hex("#3019a6")?,
            },
        },
    };
    Ok(config)
}
