use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub struct NucleotideColorConfig {
    a: u32,
    g: u32,
    c: u32,
    t: u32,
    n: u32,
    r: u32,
    y: u32,
    k: u32,
    m: u32,
    s: u32,
    w: u32,
    b: u32,
    d: u32,
    h: u32,
    v: u32,
    gap: u32, // '-' IUPAC code
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColorConfig {
    background: u32,
    foreground: u32,
    alignment: u32,
    track_label_background: u32,
    secondary_text: u32,
    nucleotide_colors: NucleotideColorConfig,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FontConfig {
    tooltip_font_size: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleConfig {
    colors: ColorConfig,
    fonts: FontConfig,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserConfig {
    styles: StyleConfig,
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
        styles: StyleConfig {
            fonts: FontConfig { tooltip_font_size: 18 },
            colors: ColorConfig {
                alignment: parse_hex("#969592")?,
                background: parse_hex("#f2f2f2")?,
                foreground: parse_hex("#222222")?,
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
            },
        },
    };
    Ok(config)
}
